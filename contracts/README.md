# ClawMachine contracts

Foundry project for the xStocks Claw Machine on Monad.

A player pays `pullPrice` USDC (default 1 USDC) plus the Pyth Entropy fee in MON. Pyth
Entropy V2 returns a random number, the callback picks common (98%, 0.73 USD) or legendary
(2%, 10 USD), and the machine transfers xStocks straight to the player's wallet. There is no
claim step for successful transfers. If a stock transfer fails, the amount is recorded in
`owed(player, stock)` and the player can retry with `withdrawOwed()`.

USD amounts use 6 decimals. Stock prices are USD per **whole** token, 6 decimals (xStocks have
18 decimals on-chain).

## Layout

```
contracts/
├── src/
│   ├── ClawMachine.sol          main contract
│   ├── mocks/MockUSDC.sol       testnet USDC + public faucet()
│   ├── mocks/MockStock.sol      testnet xStock, owner mint()
│   └── pyth/                    vendored Pyth Entropy V2 SDK 2.2.1 (Apache-2.0)
├── test/
│   ├── ClawMachine.t.sol        31 tests incl. payout split, owed path, gas, ring buffer
│   ├── EntropyFork.t.sol        gated live Monad testnet Entropy request check
│   └── MockEntropy.sol          test entropy contract
├── script/
│   ├── DeployTestnet.s.sol      mocks + ClawMachine, seeds prices and ~500 USD inventory
│   └── DeployMainnet.s.sol      ClawMachine with verified mainnet tokens
├── abi/                         committed ABIs (ClawMachine, MockUSDC, MockStock)
├── deployments/                 written by deploy scripts (gitignored)
├── foundry.toml
└── Makefile
```

Dependencies are vendored under `lib/` (forge-std and OpenZeppelin v5.4.0), so a fresh clone
needs no dependency install step. Pyth Entropy SDK files are copied from
`@pythnetwork/entropy-sdk-solidity@2.2.1` and keep their Apache-2.0 headers.

## Setup

Requirements:

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`).
  Tested with `forge 1.4.1-nightly`.
- No other dependency installs. `solc 0.8.28` is downloaded automatically on first build.

```bash
git clone <repo>
cd <repo>/contracts
forge build
forge test
```

Expected: build succeeds, `31 tests passed, 0 failed`, and 1 skipped (the gated live-fork test).

To run the live integration check against the deployed Monad testnet Entropy contract:

```bash
FORK_TEST=true forge test --match-path test/EntropyFork.t.sol -vv
```

It deploys mocks on a Monad testnet fork and makes a real `requestV2` call. The provider reveal
happens in a later block, so the pull stays Pending in the fork test. Requires network access.

Useful targets:

```bash
make build       # forge build
make test        # forge test -vv
make test-gas    # gas logs for the entropy callback
make abi         # regenerate abi/*.json
make fmt         # forge fmt
```

## How a pull resolves

1. Player approves the machine for `pullPrice` USDC and calls `pull()` with `msg.value >= getFee()`.
2. `pull()` takes `pullPrice` USDC, reserves `legendaryValue` of inventory, and calls
   `IEntropyV2(entropy).requestV2{value: fee}(callbackGasLimit)` (default provider).
3. The `PullRequested` log carries the `pullId` and entropy `sequenceNumber`. Excess MON is refunded.
4. Pyth calls `_entropyCallback`; only the configured entropy contract can enter. The machine
   computes `random % 10000 < legendaryBps`, allocates the payout round-robin from a random stock,
   transfers tokens, releases the reservation, and emits `PullResolved`.
5. Read `getPull(id)` until `status == Resolved`, then `getPullPayout(id)` for the tokens/amounts
   actually delivered.

Payout allocation rounds the token amount up by at most 1 USD-wei so a single stock can cover a
payout without leaving dust that would trigger a second transfer. If inventory cannot cover the
full value, the shortfall is paid in USDC from the contract. Both paths never revert the callback.

Failed token transfers go to `owed(player, stock)` and emit `PayoutOwed`; `withdrawOwed()` retries
every owed token for `msg.sender` (including a USDC shortfall).

`canPull()` requires: not paused, prices set and fresh (`block.timestamp - pricesUpdatedAt <=
maxPriceAge`), every stock priced above zero, and
`inventoryValueUsd6() >= reservedValueUsd6() + legendaryValue`.

## Deploy to Monad testnet (chainId 10143)

The testnet script deploys MockUSDC, four MockStocks (TSLAx/AAPLx/NVDAx/SPYx), and ClawMachine,
seeds 500 USD of each stock, sets prices (250/230/180/650 USD), sets `maxPriceAge` to 7 days,
sets keeper = deployer, and writes `deployments/monad-testnet.json`.

Pyth Entropy V2 is at `0x825c0390f379C631f3Cf11A82a37D20BddF93c07` on Monad **testnet**
(mainnet uses `0xD458261E832415CFd3BAE5E416FdF3230ce6F134`; they are different deployments).
The testnet fee is dynamic and currently ~0.128 MON for an 800k callback, not 1 wei. Always
read `getFee()` / `getFeeV2(callbackGasLimit)` before pulling.

```bash
# one-time: import a funded testnet key into a keystore named "deployer"
cast wallet import deployer --interactive

forge script script/DeployTestnet.s.sol \
  --rpc-url monad_testnet \
  --account deployer \
  --broadcast
```

Or with an environment variable (never commit it):

```bash
forge script script/DeployTestnet.s.sol \
  --rpc-url monad_testnet \
  --private-key "$PRIVATE_KEY" \
  --broadcast
```

`--rpc-url monad_testnet` expands to `https://testnet-rpc.monad.xyz` from `foundry.toml`. Do not
pass a separate `--chain` flag.

Get testnet MON from the Monad faucet. Then get test USDC for a player wallet:

```bash
cast send <MockUSDC> "faucet()" --rpc-url monad_testnet --account player
```

Add inventory later (MockStock mint is owner-only; the deployer is the owner):

```bash
cast send <MockStock> "mint(address,uint256)" <ClawMachine> <amount18dp> \
  --rpc-url monad_testnet --account deployer
```

Pull once from the CLI to sanity check the deployment:

```bash
cast call <ClawMachine> "canPull()(bool)" --rpc-url monad_testnet
cast call <ClawMachine> "getFee()(uint256)" --rpc-url monad_testnet   # ~0.128 MON for 800k gas
cast send <MockUSDC> "approve(address,uint256)" <ClawMachine> 1000000 \
  --rpc-url monad_testnet --account player
cast send <ClawMachine> "pull()" --value <fee-from-getFee> --rpc-url monad_testnet --account player
```

## Deploy to Monad mainnet (chainId 143)

The mainnet script deploys only ClawMachine with the verified USDC and xStock addresses. It does
**not** move tokens and does **not** set prices.

Environment variables (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `KEEPER` | deployer | address allowed to call `setPrices` |
| `TREASURY` | deployer | address used by `withdrawUsdc` |
| `STOCKS` | TSLAx, NVDAx, SPYx | comma separated xStock addresses, max 8 |

AAPLx is intentionally not in the default list: it has no usable liquidity on Monad today.

```bash
cast wallet import deployer --interactive

# Optional overrides
export KEEPER=0x...
export TREASURY=0x...
export STOCKS=0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0,0xc845b2894dBddd03858fd2D643B4eF725fE0849d,0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48

forge script script/DeployMainnet.s.sol \
  --rpc-url monad \
  --account deployer \
  --broadcast
```

Addresses written to `deployments/monad-mainnet.json`: `usdc`, `clawMachine`, `entropy`,
`deployer`, `keeper`, `treasury`, `symbols`, `stocks`, `chainId`, `deployedAt`.

### Fund inventory

Purchases of xStocks happen off-chain. Send the tokens to the machine's address:

```bash
# amount is 18 decimals, e.g. 2e18 = 2 tokens
cast send <TSLAX> "transfer(address,uint256)" <ClawMachine> 2000000000000000000 \
  --rpc-url monad --account deployer
```

The machine needs at least `legendaryValue` (10 USD) plus one more legendary reserve
(`reservedValueUsd6 + legendaryValue`) before `canPull()` returns true. ~500 USD per stock is a
comfortable demo inventory.

### Set prices manually

Only the keeper can set prices. Values are USD per whole token, 6 decimals. Every address must be
registered; lengths must match.

```bash
cast send <ClawMachine> "setPrices(address[],uint256[])" \
  "[0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0,0xc845b2894dBddd03858fd2D643B4eF725fE0849d,0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48]" \
  "[250000000,180000000,650000000]" \
  --rpc-url monad --account deployer

cast call <ClawMachine> "getPrices()(uint256[],uint256)" --rpc-url monad
cast call <ClawMachine> "canPull()(bool)" --rpc-url monad
```

Prices go stale after `maxPriceAge` (default 900 s). The keeper must refresh them; the testnet
script raises the limit to 7 days for demos.

## Verification

Constructor arguments are printed by both deploy scripts (ABI encoded) and stored in the deployment
JSON. For testnet, build them from `deployments/monad-testnet.json`:

```bash
USDC=$(jq -r .usdc deployments/monad-testnet.json)
MACHINE=$(jq -r .clawMachine deployments/monad-testnet.json)
STOCKS=$(jq -c .stocks deployments/monad-testnet.json)
TREASURY=$(jq -r .treasury deployments/monad-testnet.json)
KEEPER=$(jq -r .keeper deployments/monad-testnet.json)
ENTROPY=$(jq -r .entropy deployments/monad-testnet.json)

TESTNET_ARGS=$(cast abi-encode "constructor(address,address,address[],address,address)" \
  "$USDC" "$ENTROPY" "$STOCKS" "$TREASURY" "$KEEPER")
```

For mainnet:

```bash
ARGS=$(cast abi-encode "constructor(address,address,address[],address,address)" \
  0x754704Bc059F8C67012fEd69BC8A327a5aafb603 \
  0xD458261E832415CFd3BAE5E416FdF3230ce6F134 \
  "[0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0,0xc845b2894dBddd03858fd2D643B4eF725fE0849d,0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48]" \
  0xTREASURY 0xKEEPER)
```

### Sourcify (works on both networks)

```bash
# testnet
forge verify-contract <ClawMachine> src/ClawMachine.sol:ClawMachine \
  --chain 10143 \
  --verifier sourcify \
  --verifier-url "https://sourcify-api-monad.blockvision.org/" \
  --constructor-args "$TESTNET_ARGS"

# mainnet
forge verify-contract <ClawMachine> src/ClawMachine.sol:ClawMachine \
  --chain 143 \
  --verifier sourcify \
  --verifier-url "https://sourcify-api-monad.blockvision.org/" \
  --constructor-args "$ARGS"
```

Do not add an `[etherscan]` entry for chain 143 to `foundry.toml` with this Foundry version: it
makes `forge script` fail with `Chain 143 not supported`. Use the Sourcify URL above or the
verification API below.

### devnads verification API (all explorers in one call)

```bash
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

forge verify-contract <ClawMachine> src/ClawMachine.sol:ClawMachine \
  --chain 10143 --show-standard-json-input > /tmp/standard-input.json
cat out/ClawMachine.sol/ClawMachine.json | jq '.metadata' > /tmp/metadata.json

jq -n \
  --argjson chainId 10143 \
  --arg contractAddress "<ClawMachine>" \
  --arg contractName "src/ClawMachine.sol:ClawMachine" \
  --arg compilerVersion "v0.8.28+commit.7893614a" \
  --slurpfile input /tmp/standard-input.json \
  --slurpfile meta /tmp/metadata.json \
  --arg constructorArgs "${TESTNET_ARGS#0x}" \
  '{chainId: $chainId, contractAddress: $contractAddress, contractName: $contractName,
    compilerVersion: $compilerVersion, standardJsonInput: $input[0],
    foundryMetadata: $meta[0], constructorArgs: $constructorArgs}' > /tmp/verify.json

curl -X POST https://agents.devnads.com/v1/verify \
  -H "Content-Type: application/json" \
  -d @/tmp/verify.json
```

The example is for testnet. For mainnet set `chainId` to 143 and use `${ARGS#0x}` as
`constructorArgs`. Mocks are verified the same way without constructor args (`MockStock` takes
`(string,string)`).

## ABIs

`abi/ClawMachine.json`, `abi/MockUSDC.json`, and `abi/MockStock.json` are committed. Regenerate
after interface changes:

```bash
make abi
```

Frontend/keeper should import `abi/ClawMachine.json`. Read state through views (`getRecentPulls`,
`getPull`, `getPullPayout`) instead of `eth_getLogs`: Monad public RPCs limit log ranges.

## Contract notes

- Math: `pullPrice 1_000_000`, `commonValue 730_000`, `legendaryValue 10_000_000`,
  `legendaryBps 200`, `callbackGasLimit 800_000`, `maxPriceAge 900`.
- `pull()` is `nonReentrant`; `withdrawOwed()` is `nonReentrant`.
- Pull ids start at 1. `getRecentPulls(count)` returns the newest-first ids of the last 20 resolved
  pulls (ring buffer, not event logs).
- Owner: `setKeeper`, `setTreasury`, `setPullConfig`, `setCallbackGasLimit`, `setMaxPriceAge`,
  `pause`, `unpause`, `withdrawUsdc`, `withdrawStock`.
- Keeper: `setPrices`.
- `withdrawUsdc` can withdraw any USDC balance (the contract is the treasury), including funds
  reserved for a pending USDC shortfall. Keep enough USDC in the machine for rare shortfalls.
- Inventory is not segregated per player; `reservedValueUsd6` is an accounting reservation for
  pending legendary payouts.
- Callback cost measured in tests: ~224k gas for a one-stock common pull, ~440k for a legendary
  pull that touches all four stocks (default limit 800k). Monad charges gas on the limit, so keep
  `callbackGasLimit` close to real usage.

## Security / trust model

- Randomness comes from Pyth Entropy V2 (default provider). The callback is gated by
  `msg.sender == entropy`.
- The keeper is trusted for prices. `maxPriceAge` bounds how long a stale price can be used.
- The owner is trusted to fund inventory, keep USDC for shortfalls, and not drain inventory while
  pulls are pending.
- Entropy callbacks can be re-delivered; unknown or already-resolved sequence numbers are ignored.
- Failed transfers never revert the callback; they are paid later from `owed`.
