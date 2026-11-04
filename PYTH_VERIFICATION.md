# Pyth Contract and Feed Verification

Live checks were run against Monad mainnet/testnet on 2026-11-04. This file records
what the contracts depend on and how it was verified.

## Price feed contract

| Network | Address | Notes |
|---------|---------|-------|
| Mainnet (143) | `0xB754BA51E3861Ac0Cb67f73CD046dE790A36508d` | Pyth Core "PriceFeedUpgraded" (Aug 2026), used by `Deploy.s.sol` |
| Testnet (10143) | `0x2880aB155794e7179c9eE2e38200202908C17B43` | The mainnet address has no code on testnet |

The old Pyth Pro/Lazer address `0xACeA761c27A909d4D3895128EBe6370FDE2dF481` uses a
different update format and does not accept standard Hermes `updatePriceFeeds` data.
It is not used.

Verification commands:

```bash
cast call 0xB754BA51E3861Ac0Cb67f73CD046dE790A36508d \
  "getValidTimePeriod()(uint256)" --rpc-url https://rpc.monad.xyz
# 60

cast call 0xB754BA51E3861Ac0Cb67f73CD046dE790A36508d \
  "getUpdateFee(bytes[])(uint256)" "[]" --rpc-url https://rpc.monad.xyz
# 0

cast codesize 0x2880aB155794e7179c9eE2e38200202908C17B43 \
  --rpc-url https://testnet-rpc.monad.xyz
# non-zero
```

A current TSLA Hermes update simulates successfully through `updatePriceFeeds` on
mainnet. `getUpdateFee` for that update is 0. Testnet charges 1 wei.

## Entropy V2

| Network | Address | Default provider |
|---------|---------|------------------|
| Mainnet (143) | `0xD458261E832415CFd3BAE5E416FdF3230ce6F134` | `0x52DeaA1c84233F7bb8C8A45baeDE41091c616506` |
| Testnet (10143) | `0x825c0390f379C631f3Cf11A82a37D20BddF93c07` | `0x6CC14824Ea2918f5De5C2f75A9Da968ad4BD6344` |

There is an important testnet correction. The mainnet address `0xD458...` also has
code on testnet, but its provider is not registered: `requestV2` reverts and
`getProviderInfoV2(defaultProvider)` returns all zeroes. The live testnet deployment
is `0x825c...`, whose provider is registered and charges about 0.128 MON for a
500k-gas callback. Verified with:

```bash
# mainnet fee: flat 1.4 MON from 100k to 1M gas (1.6 MON at 1.5M)
cast call 0xD458261E832415CFd3BAE5E416FdF3230ce6F134 \
  "getFeeV2(address,uint32)(uint128)" \
  0x52DeaA1c84233F7bb8C8A45baeDE41091c616506 500000 \
  --rpc-url https://rpc.monad.xyz
# 1400000000000000000

# testnet provider info (non-zero only on 0x825c...)
cast call 0x825c0390f379C631f3Cf11A82a37D20BddF93c07 \
  "getProviderInfoV2(address)((uint128,uint128,bytes32,uint64,bytes,bytes,uint64,uint64,bytes32,uint64,address,uint32,uint32))" \
  0x6CC14824Ea2918f5De5C2f75A9Da968ad4BD6344 \
  --rpc-url https://testnet-rpc.monad.xyz
```

The contract uses the real V2 API only:

```solidity
entropy.getFeeV2(entropyProvider, callbackGasLimit);
entropy.requestV2{value: fee}(entropyProvider, userRandomNumber, callbackGasLimit);
```

`getFeeV2(address)` and `requestV2(address,bytes32,bool)` do not exist in V2 and revert.
Entropy calls `IEntropyConsumer._entropyCallback`, which checks that `msg.sender` is
`getEntropy()` and then dispatches to the consumer's internal `entropyCallback`.

## Feed IDs

| Symbol | Feed ID | Valid feed | Our Hermes key |
|--------|---------|-----------|----------------|
| TSLA | `0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1` | yes | entitled |
| QQQ | `0x9695e2b96ea7b3859da9ed25b7a46a920a776e2fdae19a7bcfdf2b219230452d` | yes | entitled |
| VOO | `0x236b30dd09a9c00dfeec156c7b1efd646c0f01825a1758e3e4a0679e3bdff179` | yes | entitled |
| NVDA | `0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593` | yes | HTTP 403 "Not entitled" |
| AAPL | `0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688` | yes | HTTP 403 "Not entitled" |
| SPY | `0x19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5` | yes | HTTP 403 "Not entitled" |

Feed IDs can be checked against `https://hermes.pyth.network/v2/price_feeds`:

```bash
curl -s "https://hermes.pyth.network/v2/price_feeds?query=TSLA&asset_type=equity" \
  | python3 -m json.tool | grep '"id"'
# "id": "16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1"
```

The entitlement is the reason the deploy script defaults to `STOCKS=TSLAx,QQQx`.
VOOx can be enabled with `STOCKS=TSLAx,QQQx,VOOx`, and the owner can call `addToken`
later; the frontend must read `getSupportedTokens()` and `tokenInfo(token)` instead
of hardcoding a list.

## Hermes API

Base URL: `https://pyth.dourolabs.app/hermes` (`https://hermes.pyth.network` serves
the same API).

```bash
curl -sS --fail-with-body \
  -H "Authorization: Bearer $PYTH_API_KEY" \
  "https://pyth.dourolabs.app/hermes/v2/updates/price/latest?ids[]=0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1&encoding=hex&parsed=true"
```

- `binary.data` is an **array** of hex strings without `0x`. Each element is one
  `bytes` entry of `priceUpdateData`.
- `parsed[0].price.publish_time` is the Pyth publish time used by the fork tests.
- The key is server-side only. Never put it in browser code, a `NEXT_PUBLIC_*`
  variable, or a commit. `script/pyth-update.sh` reads `PYTH_API_KEY` from the env.

## Market hours

TSLA publishes live around the clock on weekdays; the sample used during development
was under a minute old. The contract keeps a 60 second `maxPriceAge` by default and
reverts pulls when the update is older. The owner can raise it for quiet periods:

```solidity
claw.setMaxPriceAge(600);
```

The fork tests use a real older TSLA update and warp the fork to
`PYTH_PUBLISH_TIME + 5` so the 60 second check holds; `maxPriceAge` is not changed in
the test.

## Test results

Run from `contracts/`:

```
forge test
# 26 passed, 0 failed (fork suite skipped without MONAD_RPC)

MONAD_RPC=https://rpc.monad.xyz ...
forge test --match-contract ClawMachineForkTest -vv
# 7 passed, 0 failed
```

Fork test measurements with the sample TSLA update (price 381.41 USD):

```
Callback gas used: 47996   (common, 0.73 USD payout)
Callback gas used: 48111   (legendary, 5x / 5 USD payout)
```

Foundry uses the Ethereum gas schedule. `callbackGasLimit` defaults to 500,000
(`max(500_000, 2 x measured)`, rounded up to 50,000, capped at 1,500,000).

## Files

- `contracts/src/ClawMachine.sol` — machine + Entropy V2 consumer
- `contracts/src/pyth/` — Entropy V2 SDK files
- `contracts/lib/pyth-sdk-solidity/` — Pyth price-feed SDK
- `contracts/script/Deploy.s.sol` — mainnet deploy
- `contracts/script/DeployTestnet.s.sol` — testnet deploy with mocks
- `contracts/script/pyth-update.sh` — Hermes fetch for fork tests
- `contracts/test/ClawMachineFork.t.sol` — real Pyth + real Entropy fork proofs
- `contracts/README.md` — build, test and deploy guide
