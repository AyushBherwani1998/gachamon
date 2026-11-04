# Price Feed Verification

ClawMachine prices xStocks with **Chainlink Data Feeds on Monad mainnet**; Pyth is
only used for Entropy randomness. All checks below were run live on 2026-11-04.

## Feeds

The feeds price the **wrapped, non-rebasing ERC-4626 xStock**. The machine holds and
pays out the **rebasing xStock**, so it divides the feed price by the token's
`multiplier()`. See the conversion section.

| Feed (AggregatorV3 proxy) | Description | Token the machine pays | Token `multiplier()` | Feed → price per xStock |
|---|---|---|---|---|
| `0xE42022cCe1913626AE4297B99291d3Ba24Cc9281` | `wTSLAx-USD (Calculated)` | TSLAx `0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0` | 1e18 | $383.891450 |
| `0x03ffa4673c060339E6a8E5Ba1a12B3301c966bf0` | `wNVDAx-USD (Calculated)` | NVDAx `0xc845b2894dBddd03858fd2D643B4eF725fE0849d` | 1.0017011968e18 | $207.868 |
| `0x2e2dA5717eDE960F8b77Af4cFcBDC4Ca3099006D` | `wSPYx-USD (Calculated)` | SPYx `0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48` | 1.0074741267e18 | $757.76 |
| `0x7CA45B17D8D43059a222dEC5d991B613F61c02d9` | `wQQQx-USD (Calculated)` | QQQx `0xa753A7395cAe905Cd615Da0B82A53E0560f250af` | 1.0034560759e18 | $687.87 |
| `0x7577154038de77668d0188baF47707EDcd86d0b3` | `wSPCXx-USD (Calculated)` | SPCXx `0x68fa48B1C2FE52b3D776E1953e0E782b5044Ce28` | 1e18 | $2173.76 |

Feed decimals are 8. Heartbeat is 3600 s, deviation threshold 0.05%, market hours
24/5. Prices move, so the dollar column is illustrative; the contract always reads
the live feed. The default `maxPriceAge` is **3900 s** (heartbeat + 5 minutes) and
the owner can change it with `setMaxPriceAge`.

## Wrapped feed vs rebasing xStock

Each xStock rebases. `balanceOf` is already denominated in underlying-share units and
`multiplier()` is the number of such units in one whole xStock. The Chainlink feed
prices one **wrapped** share (non-rebasing, ERC-4626). One wrapped share is
`multiplier()` units of the xStock, so:

```
priceUsd6Per1e18XStock = answer * 1e6 / 10**feedDecimals * 1e18 / multiplier()
```

Example (SPYx): `$763.42742261 / 1.007474126658766 = $757.76` per whole SPYx. This
matches the Jupiter quote at the time of the check.

The contract applies this formula in `_getPrice` and exposes the result through:

```solidity
claw.getTokenPrice(token)  // (uint256 priceUsd6, uint256 updatedAt)
```

`priceUsd6` is USDC (6 decimals) per `1e18` xStock units, the same unit used for
inventory values and payout snapshots. `getInventoryValue()` and `canPull()` use
live Chainlink prices, so the UI can rely on them between pulls.

## Cast commands

```bash
RPC=https://rpc.monad.xyz

# Feed metadata and latest answer
cast call 0xE42022cCe1913626AE4297B99291d3Ba24Cc9281 \
  "description()(string)" --rpc-url $RPC
# "wTSLAx-USD (Calculated)"

cast call 0xE42022cCe1913626AE4297B99291d3Ba24Cc9281 \
  "latestRoundData()" --rpc-url $RPC
# (roundId, answer=38389145000, startedAt, updatedAt, answeredInRound)

cast call 0xE42022cCe1913626AE4297B99291d3Ba24Cc9281 \
  "decimals()(uint8)" --rpc-url $RPC
# 8

# Token multiplier (rebasing xStock)
cast call 0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48 \
  "multiplier()(uint256)" --rpc-url $RPC
# 1007474126658766000  (1.007474126658766e18)

# The machine's converted price and feed timestamp
cast call <CLAW_MACHINE> \
  "getTokenPrice(address)(uint256,uint256)" \
  0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48 \
  --rpc-url $RPC
# (757760000, <updatedAt>)
```

For the SPYx example, the wrapper's `convertToAssets(1e18)` equals the xStock's
`multiplier()` (verified live); that is why dividing by `multiplier()` is the correct
bridge from the wrapped feed to the rebasing token.

## Fork test results

`MONAD_RPC=https://rpc.monad.xyz forge test --match-contract ClawMachineForkTest -vv`
runs against the real feeds and real Entropy:

```
TSLA price (USDC per TSLAx): 383891450
Common payout value:         729997   (0.73 USD, 1% tolerance)
Legendary payout value:      9999997  (10 USD at the default 10x)
Callback gas used:           102590   (common, 3-token payout)
Callback gas used:           102705   (legendary, 3-token payout)
```

The callback gas is measured with Foundry's Ethereum gas schedule; Monad charges
more for cold access. `max(500_000, 2 x measured)` rounded up to 50,000 gives the
default **`callbackGasLimit = 500_000`**.

## Monad testnet

Monad testnet has no Chainlink equity feeds. `DeployTestnet.s.sol` deploys a
`MockPriceFeed` (AggregatorV3-compatible, 8 decimals) seeded at 383.00 USD and a
`MockStock` TSLAx whose `multiplier()` is 1e18. Entropy is the real testnet
deployment `0x825c...` (the mainnet `0xD458...` address exists on testnet but its
provider is not registered; `requestV2` reverts there).

## Files

- `contracts/src/ClawMachine.sol` — machine, Chainlink pricing and Entropy consumer
- `contracts/src/interfaces/IAggregatorV3.sol` — minimal Chainlink interface
- `contracts/src/interfaces/IXStock.sol` — minimal `multiplier()` interface
- `contracts/src/mocks/MockPriceFeed.sol` — testnet AggregatorV3 mock
- `contracts/script/Deploy.s.sol` — mainnet deploy
- `contracts/script/DeployTestnet.s.sol` — testnet deploy with mocks
- `contracts/test/ClawMachine.t.sol` — unit tests
- `contracts/test/ClawMachineFork.t.sol` — real Chainlink + Entropy fork tests
- `contracts/README.md` — build, test and deploy guide
