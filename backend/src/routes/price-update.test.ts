import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockGetPriceUpdate } = vi.hoisted(() => ({
  mockGetPriceUpdate: vi.fn(),
}));

vi.mock('../services/pyth.js', async () => {
  const actual = await vi.importActual<typeof import('../services/pyth.js')>('../services/pyth.js');
  return {
    ...actual,
    getPriceUpdate: mockGetPriceUpdate,
  };
});

import app from './index.js';
import { PriceUpdateError } from '../services/pyth.js';

describe('GET /price-update', () => {
  beforeEach(() => {
    mockGetPriceUpdate.mockReset();
  });

  it('returns the price update and contract fee', async () => {
    mockGetPriceUpdate.mockResolvedValue({
      priceUpdateData: ['0xdeadbeef'],
      fee: '150000000000000',
    });

    const response = await app.request('/price-update');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      priceUpdateData: ['0xdeadbeef'],
      fee: '150000000000000',
    });
    expect(mockGetPriceUpdate).toHaveBeenCalledWith(undefined);
  });

  it('passes a comma-separated symbols query through', async () => {
    mockGetPriceUpdate.mockResolvedValue({ priceUpdateData: ['0xaa'], fee: '0' });

    const response = await app.request('/price-update?symbols=TSLAx,%20NVDAx');

    expect(response.status).toBe(200);
    expect(mockGetPriceUpdate).toHaveBeenCalledWith(['TSLAx', 'NVDAx']);
  });

  it('returns the Hermes status and message instead of a fake success', async () => {
    mockGetPriceUpdate.mockRejectedValue(
      new PriceUpdateError(403, 'Pyth Hermes request failed (403 Forbidden): not entitled')
    );

    const response = await app.request('/price-update');

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Pyth Hermes request failed (403 Forbidden): not entitled',
    });
  });
});
