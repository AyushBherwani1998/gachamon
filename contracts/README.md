# ClawMachine contracts

Foundry project for the xStocks Claw Machine on Monad.

A player pays `pullPrice` USDC (default 1 USDC) plus the Pyth Entropy fee in MON. Pyth
Entropy V2 returns a random number, the callback picks common (98%, 0.73 USD) or legendary
(2%, 10 USD), and the machine transfers xStocks straight to the player's wallet. There is no
claim step for successful transfers. If a stock transfer fails, the amount is recorded in
`owed(player, stock)` and the player can retry with `withdrawOwed()`.

USD amounts use 6 decimals. Stock prices are USD per **whole** token, 6 decimals (xStocks have
18 decimals on-chain).

## Networks

| | Mainnet | Testnet |
|---|---|---|
| chainId | 143 | 10143 |
| RPC | `https://rpc.monad.xyz` | `https://testnet-rpc.monad.xyz` |
| Explorer | `https://monadscan.com` | `https://testnet.monadscan.com` |
| USDC | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` | MockUSDC (deployed by the script) |
| Pyth Entropy V2 | `0xD458261E832415CFd3BAE5E416FdF3230ce6F134` | `0x825c0390f379C631f3Cf11A82a37D20BddF93c07` |
| Entropy default provider | `0x52DeaA1c84233F7bb8C8A45baeDE41091c616506` | `0x6CC14824Ea2918f5De5C2f75A9Da968ad4BD6344` |

## Layout

```
contracts/
├── src/
│   ├── ClawMachine.sol          main contract
│   ├── mocks/MockUSDC.sol       testnet USDC + public faucet()
│   ├── mocks/MockStock.sol      testnet xStock, owner mint()
│   └── pyth/                    vendored Pyth Entropy V2 SDK 2.2.1 (Apache-2.0)
├── test/
│   ├── ClawMachine.t.sol        45 tests incl. payout split, owed accounting, refunds, gas, ring buffer
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

Expected: build succeeds, `45 tests passed, 0 failed`, and 1 skipped (the gated live-fork test).

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
make test-fork   # live Monad testnet entropy request (needs FORK_TEST)
make abi         # regenerate abi/*.json
make fmt         # forge fmt
```

## How a pull resolves

1. Player approves the machine for `pullPrice` USDC and calls `pull()` with `msg.value >= getFee()`.
2. `pull()` takes `pullPrice` USDC, snapshots the pull config (`pullPrice`, `commonValue`,
   `legendaryValue`, `legendaryBps`), reserves `legendaryValue` of inventory, and calls
   `IEntropyV2(entropy).requestV2{value: fee}(callbackGasLimit)` (default provider). A later
   `setPullConfig` cannot change an in-flight pull.
3. The `PullRequested` log carries the `pullId` and entropy `sequenceNumber`. Excess MON is refunded.
4. Pyth calls `_entropyCallback`; only the configured entropy contract can enter. The machine
   computes `random % 10000 < legendaryBps`, allocates the payout round-robin from a random stock,
   transfers tokens, releases the reservation, and emits `PullResolved`.
5. Read `getPull(id)` until `status == Resolved`, then `getPullPayout(id)` for the tokens/amounts
   actually delivered. If the callback never lands, the player or owner can call
   `refundStuckPull(id)` after 10 minutes; it releases the reservation, refunds the snapshotted pull
   price in USDC, and emits `PullRefunded`.

Entropy sequences are stored per `(provider, sequence)` and the provider returned by
`getDefaultProvider()` is captured at request time. A callback with the same sequence from another
provider is ignored.

Payout allocation rounds the token amount up by at most 1 USD-wei so a single stock can cover a
payout without leaving dust that would trigger a second transfer. If inventory cannot cover the
full value, the shortfall is paid in USDC from the contract. Both paths never revert the callback.

Failed token transfers go to `owed(player, stock)` and emit `PayoutOwed`; `withdrawOwed()` retries
every owed token for `msg.sender` (including a USDC shortfall). `totalOwed[token]` tracks the global
amount owed for each token; owed tokens are excluded from `inventoryValueUsd6()`, from the USDC
shortfall fallback, and from owner withdrawals.

`canPull()` requires: not paused; every stock with a nonzero balance has a nonzero price updated
within `maxPriceAge`; and `inventoryValueUsd6() >= reservedValueUsd6() + legendaryValue`. Prices
are tracked per stock, so a partial `setPrices()` call cannot make other stocks' stale prices look
fresh. `getPrices()` returns the oldest per-stock timestamp.

## Deploy to Monad testnet (chainId 10143)

The testnet script deploys MockUSDC, four MockStocks (TSLAx/AAPLx/NVDAx/SPYx), and ClawMachine,
seeds 500 USD of each stock, sets prices (250/230/180/650 USD), sets `maxPriceAge` to 7 days,
sets keeper = deployer. `deployments/monad-testnet.json` is written **only when the script runs with
`--broadcast`**; a dry run prints the addresses but writes nothing.

Pyth Entropy V2 is at `0x825c0390f379C631f3Cf11A82a37D20BddF93c07` on Monad **testnet**
(mainnet uses `0xD458261E832415CFd3BAE5E416FdF3230ce6F134`; they are different deployments).
The testnet fee is dynamic and currently ~0.154 MON for a 1.2M callback (mainnet ~1.48 MON).
Always read `getFee()` / `getFeeV2(callbackGasLimit)` before pulling.

The deploy simulation uses ~8M gas (~1.7 testnet MON at current gas prices), so fund the deployer
with at least 2 testnet MON before broadcasting.

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
FEE=$(cast call <ClawMachine> "getFee()(uint256)" --rpc-url monad_testnet | awk '{print $1}')
echo "entropy fee: $FEE wei"   # ~0.154 MON for 1.2M gas on testnet
cast send <MockUSDC> "approve(address,uint256)" <ClawMachine> 1000000 \
  --rpc-url monad_testnet --account player
cast send <ClawMachine> "pull()" --value "$FEE" --rpc-url monad_testnet --account player
```

## Deploy to Monad mainnet (chainId 143)

The mainnet script deploys only ClawMachine with the verified USDC and xStock addresses. It does
**not** move tokens and does **not** set prices.

Environment variables (all optional):

| Variable | Default | Meaning |
|---|---|---|
| `KEEPER` | deployer | address allowed to call `setPrices` |
| `TREASURY` | deployer | treasury address recorded on-chain; the owner passes it to `withdrawUsdc` |
| `STOCKS` | TSLAx, NVDAx, SPYx | comma separated xStock addresses, max 8 |

AAPLx is intentionally not in the default list: it has no usable liquidity on Monad today.

The deployment simulation uses ~3.2M gas (~0.65 MON at current gas prices).

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

On a real `--broadcast`, addresses are written to `deployments/monad-mainnet.json`: `usdc`,
`clawMachine`, `entropy`, `deployer`, `keeper`, `treasury`, `symbols`, `stocks`, `chainId`,
`deployedAt`. Dry runs do not write the file.

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
STOCKS=$(jq -r '.stocks | join(",")' deployments/monad-testnet.json)
TREASURY=$(jq -r .treasury deployments/monad-testnet.json)
KEEPER=$(jq -r .keeper deployments/monad-testnet.json)
ENTROPY=$(jq -r .entropy deployments/monad-testnet.json)

TESTNET_ARGS=$(cast abi-encode "constructor(address,address,address[],address,address)" \
  "$USDC" "$ENTROPY" "[$STOCKS]" "$TREASURY" "$KEEPER")
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
  `legendaryBps 200`, `callbackGasLimit 1_200_000`, `maxPriceAge 900`.
- `pull()` is `nonReentrant`; `withdrawOwed()` is `nonReentrant`.
- Pull ids start at 1. `getRecentPulls(count)` returns the newest-first ids of the last 20 resolved
  pulls (ring buffer, not event logs).
- Owner: `setKeeper`, `setTreasury`, `setPullConfig`, `setCallbackGasLimit`, `setMaxPriceAge`,
  `pause`, `unpause`, `withdrawUsdc`, `withdrawStock`.
- Keeper: `setPrices`.
- `withdrawUsdc` / `withdrawStock` cannot withdraw balances recorded in `totalOwed`; owed tokens
  stay in the contract until players call `withdrawOwed`.
- `refundStuckPull(pullId)` is callable by the pull's player or the owner once
  `block.timestamp > requestedAt + STUCK_PULL_TIMEOUT` (10 minutes). It releases the reservation,
  refunds the snapshotted `pullPrice` in USDC (or records it in `owed` if free USDC is short), marks
  the pull Resolved with `valueUsd6 = 0`, and emits `PullRefunded`.
- The constructor requires every stock to report 18 decimals.
- Per-pull state includes snapshots of `pullPrice`, `commonValue`, `legendaryValue`, and
  `legendaryBps`; `getPrices()` returns the oldest per-stock update time.
- Inventory is not segregated per player; `reservedValueUsd6` is an accounting reservation for
  pending legendary payouts.
- Callback cost measured cold (`vm.cool`) in tests: ~256k gas for a one-stock common pull, ~514k
  for a legendary pull that touches all four stocks. Monad cold account access is ~4x Ethereum,
  so the default `callbackGasLimit` is 1_200_000 to leave headroom (~800k on Monad). Monad charges
  gas on the limit, so keep it close to real usage.

## Security / trust model

- Randomness comes from Pyth Entropy V2 (default provider). The callback is gated by
  `msg.sender == entropy`.
- The keeper is trusted for prices. `maxPriceAge` bounds how long a stale price can be used.
- The owner is trusted to fund inventory, keep USDC for shortfalls, and not drain inventory while
  pulls are pending. The owner can also change `legendaryBps` / payout values between a request and
  its callback, so use a multisig in production.
- Entropy callbacks can be re-delivered; unknown or already-resolved sequence numbers are ignored.
- Failed transfers never revert the callback; they are paid later from `owed`.
