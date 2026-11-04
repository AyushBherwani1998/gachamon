# ClawMachine Smart Contracts

Pixel-art xStocks claw machine on Monad. A player pays **1 USDC** per pull plus the
Pyth + Entropy fee in MON and receives tokenized stocks (xStocks) in the same
transaction that Pyth Entropy reveals the random number.

- **Common (98%)**: 0.73 USDC worth of xStocks
- **Legendary (2%)**: `pullPrice * legendaryMultiplier` worth of xStocks (10x by default)

The house keeps the rest as revenue. Payouts use the Pyth price snapshot taken when
the pull is requested, so the result cannot be front-run by a price update.

## Contracts and dependencies

All Solidity dependencies are vendored as plain directories (no submodules):

| Path | What |
|------|------|
| `lib/forge-std` | Foundry test/script library |
| `lib/openzeppelin-contracts` | OpenZeppelin Contracts v5 (Ownable, Pausable, ReentrancyGuard, ERC20) |
| `lib/pyth-sdk-solidity` | Pyth price-feed SDK (`IPyth`, `PythStructs`, ...) |
| `src/pyth` | Pyth Entropy V2 SDK (`IEntropyV2`, `IEntropyConsumer`, events/structs) |

`foundry.toml` targets `solc 0.8.28` with `evm_version = "cancun"`. `forge build`
and `forge test` work from a clean clone without `forge install`.

## Build

```bash
cd contracts
forge build
```

## Unit tests

```bash
forge test
```

The unit tests use `MockPyth` and `MockEntropy` and need no network access. They
cover common/legendary payouts, inventory checks, stale prices, failed transfers,
treasury accounting, reservations, owner controls and fee forwarding.

## Mainnet fork tests

The fork tests exercise the real Monad mainnet USDC, TSLAx, Pyth price feed and
Pyth Entropy contracts. They are skipped unless `MONAD_RPC` is set; the two full-pull
tests also require a real Hermes update.

```bash
# 1. Fetch a fresh TSLA update (needs a server-side PYTH_API_KEY)
source <(script/pyth-update.sh)

# 2. Run the fork tests
MONAD_RPC=https://rpc.monad.xyz forge test --match-contract ClawMachineForkTest -vv
```

`script/pyth-update.sh` prints shell exports:

```
PYTH_UPDATE_HEX=0x504e4155...
PYTH_PUBLISH_TIME=1793781488
```

If `PYTH_PUBLISH_TIME` is set, the test warps the fork to `publishTime + 5` so the
60 second `maxPriceAge` check holds. Do not raise `maxPriceAge` for the fork test.

`test_Fork_FullPull_RealPythAndEntropy` proves the full path:

1. Impersonates `0xb2dC0a93841Ac49Ce0664e45D6575BA31AEA7C0e` (holds MON, USDC and TSLAx).
2. Moves its TSLAx into the machine as inventory.
3. Calls `pull(userRandomNumber, [update])` with the exact `getTotalFee(update)`.
4. Reads the Entropy sequence number from `PullRequested`.
5. Simulates the provider reveal with `vm.prank(ENTROPY)` and
   `_entropyCallback{gas: callbackGasLimit}(seq, provider, random)`.
6. Asserts the payout is 0.73 USD worth at the snapshot price (within 1%), the
   reservation is released and `PullResolved` carries the right pull id.

`test_Fork_LegendaryPull` does the same with `setParameters(1_000_000, 7300, 200, 5)`
and a random number that rolls below 200 bps, then asserts a 5 USD payout.

### Callback gas

The fork run measures the callback itself:

```
Callback gas used: 47996   (common)
Callback gas used: 48111   (legendary)
```

Foundry uses the Ethereum gas schedule; Monad cold storage/account access is more
expensive. Following `max(500_000, 2 x measured)`, rounded up to 50,000, the default
is **`callbackGasLimit = 500_000`**. On mainnet the Entropy fee is a flat 1.4 MON up
to 1M gas (verified live; 1.6 MON at 1.5M), so raising it to 800k costs nothing extra if a future token mix needs
more headroom. The owner can change it:

```solidity
claw.setCallbackGasLimit(800_000);
```

## Deploy to Monad mainnet (chain 143)

No key is read from the environment. Pass it with `--private-key`, `--account` or
`--ledger`; the broadcaster becomes the owner.

```bash
forge script script/Deploy.s.sol \
  --rpc-url monad \
  --account deployer \
  --broadcast \
  --verify --verifier sourcify \
  --verifier-url https://sourcify-api-monad.blockvision.org/
```

Environment options:

| Variable | Default | Meaning |
|----------|---------|---------|
| `STOCKS` | `TSLAx` | Comma-separated subset of `TSLAx,NVDAx,AAPLx,SPYx` |
| `LEGENDARY_MULTIPLIER` | unset (10) | Calls `setParameters` changing only the multiplier |
| `CALLBACK_GAS_LIMIT` | unset (500000) | Calls `setCallbackGasLimit` |

The script writes `deployments/monad-mainnet.json` only when broadcasting (not on a
dry run), with the machine address, deploy block, tokens, feed IDs, Pyth, Entropy,
provider and parameters.

### Post-deploy steps

1. **Send inventory.** The machine pays out from its own balance. Send TSLAx to the
   contract (at least 10 USD for a 10x legendary):

   ```bash
   cast send 0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0 \
     "transfer(address,uint256)" <CLAW_MACHINE> <AMOUNT> \
     --rpc-url monad --account deployer
   ```

   Alternatively `refillInventory([TSLAx], [amount])` after approving the machine.

2. **Tune parameters if needed.**

   ```solidity
   claw.setParameters(1_000_000, 7300, 200, 10); // price, common bps, rarity bps, multiplier
   claw.setMaxPriceAge(600);                     // after-hours tolerance
   claw.setCallbackGasLimit(800_000);
   ```

3. **Backend.** Point the backend at the machine and keep `PYTH_API_KEY` server-side.
   The price update comes from `GET /v2/updates/price/latest` on Hermes; pass
   `binary.data` (each element is one `bytes` entry) as `priceUpdateData`.

4. **Ownership.** Transfer to a multisig if the demo is not the final owner.

## Deploy to Monad testnet (chain 10143)

Testnet has no USDC and no xStocks, so the script deploys mocks and wires the machine
to the **real** testnet Pyth and Entropy deployments:

```bash
forge script script/DeployTestnet.s.sol \
  --rpc-url monad_testnet \
  --account deployer \
  --broadcast \
  --verify --verifier sourcify \
  --verifier-url https://sourcify-api-monad.blockvision.org/
```

The script:

- deploys `MockUSDC` (`Mock USD Coin`, symbol `USDC`, 6 decimals) with
  `faucet()` minting 100 USDC to the caller,
- deploys `MockStock` TSLAx (18 decimals, owner mint),
- deploys `ClawMachine`,
- adds TSLAx with the TSLA feed ID,
- mints 1 TSLAx into the machine as inventory.

Writes `deployments/monad-testnet.json` only when broadcasting.

## Addresses

### Monad mainnet (143)

| Contract | Address |
|----------|---------|
| USDC (6 decimals) | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` |
| Pyth price feed (Core, Aug 2026) | `0xB754BA51E3861Ac0Cb67f73CD046dE790A36508d` |
| Pyth Entropy V2 | `0xD458261E832415CFd3BAE5E416FdF3230ce6F134` |
| Entropy default provider | `0x52DeaA1c84233F7bb8C8A45baeDE41091c616506` |
| TSLAx | `0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0` |
| NVDAx | `0xc845b2894dBddd03858fd2D643B4eF725fE0849d` |
| AAPLx | `0x9d275685dC284C8eB1C79f6ABA7a63Dc75ec890a` |
| SPYx | `0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48` |

RPC: `https://rpc.monad.xyz` · Explorer: `https://monadscan.com`

### Monad testnet (10143)

| Contract | Address |
|----------|---------|
| Pyth price feed | `0x2880aB155794e7179c9eE2e38200202908C17B43` |
| Pyth Entropy V2 | `0x825c0390f379C631f3Cf11A82a37D20BddF93c07` |
| Entropy default provider | `0x6CC14824Ea2918f5De5C2f75A9Da968ad4BD6344` |

RPC: `https://testnet-rpc.monad.xyz` · Explorer: `https://testnet.monadscan.com`

**Entropy address note.** The mainnet Entropy address `0xD458...` also has code on
testnet, but its default provider is not registered there: `requestV2` reverts and
`getProviderInfoV2(defaultProvider)` is all zeroes. The live testnet Entropy V2
deployment is `0x825c...` (provider registered, `getFeeV2(provider, 500000)` returns
about 0.128 MON). This was verified live on 2026-11-04; the deploy script uses it.

## Why TSLAx only

Our Pyth Hermes API key is entitled to exactly one feed: `Equity.US.TSLA/USD`
(`0x16dad506...32f1`). Requests for NVDA, AAPL, SPY and the xStock crypto feeds
return HTTP 403 "Not entitled", so the frontend cannot produce a valid update for
them. The contract therefore launches with TSLAx only.

The list is not hardcoded in the frontend: read `getSupportedTokens()` and
`tokenInfo(token)`. When entitlement arrives, the owner can add tokens without a
redeploy:

```solidity
claw.addToken(NVDAx, 0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593);
```

## Entropy integration

The contract inherits `IEntropyConsumer` from `src/pyth`:

- `getEntropy()` returns the Entropy address, so `_entropyCallback` accepts calls
  only from Entropy.
- The callback body is `entropyCallback(uint64,address,bytes32) internal override`.
- Requests use the real V2 API:

  ```solidity
  uint256 fee = entropy.getFeeV2(entropyProvider, callbackGasLimit);
  uint64 seq = entropy.requestV2{value: fee}(
      entropyProvider,
      userRandomNumber,
      callbackGasLimit
  );
  ```

The old `requestV2(provider, random, bool)` / `getFeeV2(provider)` calls do not
exist in Entropy V2 and revert on Monad.

## Economic notes

- Player EV at defaults: `0.98 * 0.73 + 0.02 * 10 = 0.9154` USDC per 1 USDC pull.
- Each pending pull reserves the full legendary payout (`pullPrice * multiplier`) of
  inventory until it resolves.
- With TSLAx at ~381 USD, 1 TSLAx of inventory covers about 38 legendaries at 10x.

## Project layout

```
contracts/
├── src/
│   ├── ClawMachine.sol
│   ├── mocks/               # MockUSDC, MockStock (testnet only)
│   └── pyth/                # Entropy V2 SDK files
├── test/
│   ├── ClawMachine.t.sol
│   ├── ClawMachineFork.t.sol
│   └── mocks/
├── script/
│   ├── Deploy.s.sol
│   ├── DeployTestnet.s.sol
│   └── pyth-update.sh
├── lib/
├── foundry.toml
└── remappings.txt
```
