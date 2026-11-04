# ClawMachine Smart Contracts

Pixel-art xStocks claw machine on Monad. A player pays **1 USDC** per pull plus the
Pyth Entropy fee in MON and receives tokenized stocks (xStocks) in the entropy
callback.

- **Common (98%)**: 0.73 USDC worth of xStocks
- **Legendary (2%)**: `pullPrice * legendaryMultiplier` worth of xStocks (10x by default)

The house keeps the rest as revenue. Payouts use the price snapshot taken when the
pull is requested, so the result cannot be front-run by a price update.

**Prices: Chainlink Data Feeds. Randomness: Pyth Entropy.**

## Contracts and dependencies

All Solidity dependencies are vendored as plain directories (no submodules):

| Path | What |
|------|------|
| `lib/forge-std` | Foundry test/script library |
| `lib/openzeppelin-contracts` | OpenZeppelin Contracts v5 (Ownable, Pausable, ReentrancyGuard, ERC20) |
| `src/pyth` | Pyth Entropy V2 SDK (`IEntropyV2`, `IEntropyConsumer`, events/structs) |
| `src/interfaces` | Minimal `IAggregatorV3`, `IXStock` and the unused `IPriceOracle` |

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

The unit tests use `MockPriceFeed`, `MockEntropy` and mock ERC20s and need no network
access. They cover common/legendary payouts, Chainlink staleness and zero/negative
answers, the wrapped-feed `multiplier()` conversion, inventory caps across 3 tokens,
failed transfers/owed balances, treasury accounting, reservations, refunds, owner
controls and fee forwarding.

## Mainnet fork tests

The fork tests exercise the real Monad mainnet USDC, the three xStocks, the real
Chainlink proxies and the real Pyth Entropy contract. They only need an RPC:

```bash
MONAD_RPC=https://rpc.monad.xyz forge test --match-contract ClawMachineForkTest -vv
```

No API key or off-chain price update is involved: the prices are read from the
Chainlink proxies on-chain.

The pull tests impersonate `0xb2dC0a93841Ac49Ce0664e45D6575BA31AEA7C0e`, which holds
MON, USDC and the xStocks on mainnet, and move its inventory into the machine:

| Token | Actor balance | Approx USD |
|-------|---------------|-----------|
| TSLAx | 0.02356 | 9.04 |
| NVDAx | 0.03845 | 7.99 |
| SPYx | 0.01058 | 8.02 |

That is about 25 USD, enough for the default 10x legendary payout (10 USD).

`test_Fork_FullPull_RealChainlinkAndEntropy`:

1. Moves the actor's TSLAx, NVDAx and SPYx into the machine as inventory.
2. Calls `pull(userRandomNumber)` with `value = getFee()` (the real Entropy fee).
3. Reads the Entropy sequence number from `PullRequested`.
4. Simulates the provider reveal with `vm.prank(ENTROPY)` and
   `_entropyCallback{gas: callbackGasLimit}(seq, provider, random)`.
5. Asserts the received stock is worth 0.73 USD at the snapshot prices (within 1%),
   the reservation is released and `PullResolved` carries the right pull id.

`test_Fork_LegendaryPull` does the same with a random number that rolls below 200 bps
and asserts a 10 USD payout at the default 10x.

`test_Fork_GetTokenPrice` checks the Chainlink conversion against the raw feed:
`answer * 1e6 / 10**8 * 1e18 / multiplier()`.

### Callback gas

The fork run measures the callback itself (3-token payout):

```
Callback gas used: 102590   (common, 0.73 USD)
Callback gas used: 102705   (legendary, 10 USD)
```

Foundry uses the Ethereum gas schedule; Monad cold storage/account access is more
expensive. Following `max(500_000, 2 x measured)`, rounded up to 50,000, the default
is **`callbackGasLimit = 500_000`**. On mainnet the Entropy fee is a flat 1.4 MON up
to 1M gas (1.6 MON at 1.5M), so raising it to 800k costs nothing extra if a future
token mix needs more headroom. The owner can change it:

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
| `STOCKS` | `TSLAx,NVDAx,SPYx` | Comma-separated subset of `TSLAx,NVDAx,SPYx,QQQx,SPCXx` |
| `LEGENDARY_MULTIPLIER` | unset (10) | Calls `setParameters` changing only the multiplier |
| `CALLBACK_GAS_LIMIT` | unset (500000) | Calls `setCallbackGasLimit` |

The symbol map:

| Symbol | Token | Chainlink feed |
|--------|-------|----------------|
| `TSLAx` | `0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0` | `0xE42022cCe1913626AE4297B99291d3Ba24Cc9281` |
| `NVDAx` | `0xc845b2894dBddd03858fd2D643B4eF725fE0849d` | `0x03ffa4673c060339E6a8E5Ba1a12B3301c966bf0` |
| `SPYx` | `0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48` | `0x2e2dA5717eDE960F8b77Af4cFcBDC4Ca3099006D` |
| `QQQx` | `0xa753A7395cAe905Cd615Da0B82A53E0560f250af` | `0x7CA45B17D8D43059a222dEC5d991B613F61c02d9` |
| `SPCXx` | `0x68fa48B1C2FE52b3D776E1953e0E782b5044Ce28` | `0x7577154038de77668d0188baF47707EDcd86d0b3` |

The script writes `deployments/monad-mainnet.json` only when broadcasting (not on a
dry run), with the machine address, deploy block, tokens, Chainlink feeds, Entropy,
provider and parameters.

### Post-deploy steps

1. **Send inventory.** The machine pays out from its own balance. Send the xStocks you
   enabled (`TSLAx`, `NVDAx` and `SPYx` by default; at least 10 USD total for a 10x
   legendary):

   ```bash
   cast send 0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0 \
     "transfer(address,uint256)" <CLAW_MACHINE> <AMOUNT> \
     --rpc-url monad --account deployer
   ```

   Repeat for `NVDAx` and `SPYx`. Alternatively `refillInventory([...], [...])` after
   approving the machine. xStocks rebase: `balanceOf` is in underlying-share units
   and the machine prices those units at the feed price divided by `multiplier()`.

2. **Tune parameters if needed.**

   ```solidity
   claw.setParameters(1_000_000, 7300, 200, 10); // price, common bps, rarity bps, multiplier
   claw.setMaxPriceAge(7200);                    // slower than the 1h heartbeat
   claw.setCallbackGasLimit(800_000);
   ```

3. **Backend / frontend.** Read `getSupportedTokens()` and
   `tokenInfo(token)` → `(priceFeed, decimals, supported)`. Use `getTokenPrice(token)`
   for the live USD price, `getFee()` right before sending `pull(bytes32)` with that
   exact `value`, and watch `PullRequested` / `PullResolved`. There is no price update
   payload anymore.

4. **Ownership.** Transfer to a multisig if the demo is not the final owner.

## Deploy to Monad testnet (chain 10143)

Monad testnet has no USDC and no Chainlink equity feeds, so the script deploys mocks
and wires the machine to the **real** testnet Entropy deployment:

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
- deploys `MockStock` TSLAx (18 decimals, owner mint, `multiplier() = 1e18`),
- deploys `MockPriceFeed` (AggregatorV3-compatible, 8 decimals) seeded at 383.00 USD;
  the owner can refresh it with `setAnswer(int256)` (which sets
  `updatedAt = block.timestamp`),
- deploys `ClawMachine` and adds TSLAx with that mock feed,
- mints 1 TSLAx into the machine as inventory.

Writes `deployments/monad-testnet.json` only when broadcasting.

## Addresses

### Monad mainnet (143)

| Contract | Address |
|----------|---------|
| USDC (6 decimals) | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` |
| Pyth Entropy V2 | `0xD458261E832415CFd3BAE5E416FdF3230ce6F134` |
| Entropy default provider | `0x52DeaA1c84233F7bb8C8A45baeDE41091c616506` |
| TSLAx | `0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0` |
| NVDAx | `0xc845b2894dBddd03858fd2D643B4eF725fE0849d` |
| SPYx | `0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48` |
| QQQx | `0xa753A7395cAe905Cd615Da0B82A53E0560f250af` |
| SPCXx | `0x68fa48B1C2FE52b3D776E1953e0E782b5044Ce28` |

Chainlink feeds are listed in the deploy table above. `PRICE_FEEDS.md` records the
live verification commands and the wrapped/multiplier conversion.

RPC: `https://rpc.monad.xyz` · Explorer: `https://monadscan.com`

### Monad testnet (10143)

| Contract | Address |
|----------|---------|
| Pyth Entropy V2 | `0x825c0390f379C631f3Cf11A82a37D20BddF93c07` |
| Entropy default provider | `0x6CC14824Ea2918f5De5C2f75A9Da968ad4BD6344` |

RPC: `https://testnet-rpc.monad.xyz` · Explorer: `https://testnet.monadscan.com`

**Entropy address note.** The mainnet Entropy address `0xD458...` also has code on
testnet, but its default provider is not registered there: `requestV2` reverts and
`getProviderInfoV2(defaultProvider)` is all zeroes. The live testnet Entropy V2
deployment is `0x825c...` (provider registered, `getFeeV2(provider, 500000)` returns
about 0.128 MON). This was verified live on 2026-11-04; the deploy script uses it.

## Price feeds and the multiplier conversion

The Chainlink feeds price the **wrapped, non-rebasing ERC-4626 xStock**. One wrapped
share is `multiplier()` units of the rebasing xStock the machine holds, so the price
of one whole xStock unit is:

```
priceUsd6Per1e18XStock = answer * 1e6 / 10**feedDecimals * 1e18 / multiplier()
```

Feed decimals are 8 and the heartbeat is 3600 s (deviation 0.05%, market hours 24/5).
`maxPriceAge` defaults to 3900 s; the owner can raise it for quiet periods.
`getTokenPrice(token)` returns `(priceUsd6, updatedAt)`, and `getInventoryValue()` and
`canPull()` use the same live conversion.

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
- Payouts are capped at each token's current balance at the snapshot price; any
  remainder is redistributed to tokens with spare inventory, so an empty token can no
  longer turn a payout into an IOU. Owed balances only appear when the whole
  inventory is short.
- A pull whose callback never lands can be refunded by the owner after 10 minutes
  (`refundStuckPull`), which releases the reservation and returns the pull price.

## Project layout

```text
contracts/
├── src/
│   ├── ClawMachine.sol
│   ├── interfaces/          IAggregatorV3, IXStock, IPriceOracle
│   ├── mocks/               MockUSDC, MockStock, MockPriceFeed
│   └── pyth/                Entropy V2 SDK
├── script/                  Deploy.s.sol, DeployTestnet.s.sol
├── test/                    unit tests, mocks, ClawMachineFork.t.sol
├── lib/                     forge-std, openzeppelin-contracts
└── foundry.toml
```

## Contract ABI

Compiled artifacts (including the full ABI) are written to:

```
contracts/out/ClawMachine.sol/ClawMachine.json
```
