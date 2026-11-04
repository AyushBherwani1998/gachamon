import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { mockConfig, mockReadContract } = vi.hoisted(() => ({
  mockConfig: {
    clawMachineAddress: '0x0000000000000000000000000000000000000000' as `0x${string}`,
    pythApiKey: 'test-pyth-key' as string | undefined,
    pythHermesUrl: 'https://hermes.test/v2/updates/price/latest',
    pythFeeds: ['TSLAx'] as string[],
    pythFeedIds: {
      TSLAx: '0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1',
      NVDAx: '0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593',
    },
  },
  mockReadContract: vi.fn(),
}));

vi.mock('../config.js', () => ({
  config: mockConfig,
  publicClient: { readContract: mockReadContract },
}));

import { getPriceUpdate } from './pyth.js';

const TSLA_FEED_ID = '0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1';

function mockResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response;
}

describe('getPriceUpdate', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    mockReadContract.mockReset();
    mockConfig.pythApiKey = 'test-pyth-key';
    mockConfig.pythFeeds = ['TSLAx'];
    mockConfig.clawMachineAddress = '0x0000000000000000000000000000000000000000';
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the API key and maps every binary entry to its own priceUpdateData element', async () => {
    mockReadContract.mockResolvedValue(1_400_000_000_000_000_000n);
    fetchMock.mockResolvedValue(mockResponse({ binary: { data: ['deadbeef', '0xcafebabe'] } }));

    const result = await getPriceUpdate(['TSLAx']);

    expect(result.priceUpdateData).toEqual(['0xdeadbeef', '0xcafebabe']);
    expect(result.fee).toBe('1400000000000000000');
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'getTotalFee',
        args: [['0xdeadbeef', '0xcafebabe']],
      })
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer test-pyth-key');

    const url = new URL(requestUrl as string);
    expect(url.searchParams.get('encoding')).toBe('hex');
    expect(url.searchParams.get('parsed')).toBe('true');
    expect(url.searchParams.getAll('ids[]')).toEqual([TSLA_FEED_ID]);
  });

  it('requests only PYTH_FEEDS when no symbols are given', async () => {
    mockReadContract.mockResolvedValue(0n);
    fetchMock.mockResolvedValue(mockResponse({ binary: { data: ['aa'] } }));

    await getPriceUpdate();

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.getAll('ids[]')).toEqual([TSLA_FEED_ID]);
  });

  it.each([401, 403, 429])(
    'surfaces Hermes %i as a PriceUpdateError with the upstream status',
    async (status) => {
      fetchMock.mockResolvedValue(mockResponse('not entitled', status, 'Forbidden'));

      const promise = getPriceUpdate(['TSLAx']);

      await expect(promise).rejects.toMatchObject({
        name: 'PriceUpdateError',
        status,
      });
      await expect(promise).rejects.toThrow('Pyth Hermes request failed');
      expect(mockReadContract).not.toHaveBeenCalled();
    }
  );

  it('returns 503 when PYTH_API_KEY is missing', async () => {
    mockConfig.pythApiKey = undefined;

    await expect(getPriceUpdate(['TSLAx'])).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unknown symbols with 400 instead of requesting them', async () => {
    await expect(getPriceUpdate(['NVDAx2'])).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads feed IDs from the ClawMachine contract when it is configured', async () => {
    mockConfig.clawMachineAddress = '0x00000000000000000000000000000000000000aa';
    const contractFeedId = `0x${'ab'.repeat(32)}`;

    mockReadContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'getSupportedTokens') {
        return ['0x00000000000000000000000000000000000000bb'];
      }
      if (functionName === 'tokenInfo') {
        return [contractFeedId, 18, true];
      }
      if (functionName === 'getTotalFee') {
        return 42n;
      }
      throw new Error(`Unexpected contract call: ${functionName}`);
    });
    fetchMock.mockResolvedValue(mockResponse({ binary: { data: ['aa'] } }));

    const result = await getPriceUpdate();

    expect(result.fee).toBe('42');
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.getAll('ids[]')).toEqual([contractFeedId]);
  });
});
