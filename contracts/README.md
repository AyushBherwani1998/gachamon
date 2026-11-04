# ClawMachine Smart Contracts

Smart contracts for the xStocks Claw Machine game on Monad mainnet (chain 143).

## Overview

Players pay 1 USDC per pull to win xStocks (tokenized stocks). Each pull uses Pyth Entropy for on-chain randomness:
- **Common (98%)**: Player receives 0.73 USDC worth of xStocks
- **Legendary (2%)**: Player receives 10 USDC worth of xStocks (10x payout)

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) >= 1.8

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

## Installation

```bash
# Install dependencies
forge install
```

## Build

```bash
forge build
```

## Test

### Run all tests
```bash
forge test -vv
```

### Run specific test file
```bash
forge test --match-contract ClawMachineTest -vvv
```

### Run with gas reporting
```bash
forge test --gas-report
```

### Fork tests (against Monad mainnet)
```bash
MONAD_RPC=https://rpc.monad.xyz forge test --match-contract ClawMachineForkTest -vv
```

## Deploy

### Dry run (simulation)
```bash
forge script script/Deploy.s.sol --rpc-url https://rpc.monad.xyz
```

### Actual deployment (requires private key)
```bash
# Set private key
export PRIVATE_KEY=<your-private-key>

# Deploy to Monad mainnet
forge script script/Deploy.s.sol --rpc-url monad --broadcast --verify

# Or use private key directly (not recommended for production)
forge script script/Deploy.s.sol --rpc-url monad --broadcast --private-key <key>
```

### Post-deployment steps

1. **Fund inventory**: Transfer ~20 USDC worth of xStocks to the contract
   ```solidity
   // Approve xStocks tokens to ClawMachine
   TSLAx.approve(clawMachine, amount);
   
   // Refill inventory
   clawMachine.refillInventory(
       [TSLAx, NVDAx, AAPLx, SPYx],
       [amounts...]
   );
   ```

2. **Setup price keeper**: Deploy a keeper bot to call `setPrices()` every minute
   - Read prices from xStocks API: `https://api.xstocks.fi/api/v2/{symbol}/price-data`
   - Call `setPrices([tokens], [prices])` with 6-decimal USDC prices per 1e18 token units

3. **Update keeper address** (if using separate keeper account):
   ```solidity
   clawMachine.setKeeper(keeperAddress);
   ```

4. **Transfer ownership** (recommended: use multi-sig):
   ```solidity
   clawMachine.transferOwnership(multisigAddress);
   ```

## Contract Architecture

### Core Contracts

- **ClawMachine.sol**: Main game contract
  - Handles USDC payments and xStocks payouts
  - Integrates with Pyth Entropy for randomness
  - Manages inventory reservations
  - Direct transfer of xStocks to player in callback
  - Fallback to owed balance for failed transfers

### Interfaces

- **IEntropy.sol**: Pyth Entropy interface for on-chain randomness
- **IPriceOracle.sol**: Future oracle integration (Chainlink/Pyth price feeds)

### Key Features

1. **Pyth Entropy Integration**
   - Uses `requestV2()` for randomness requests
   - Callback delivers random number to determine rarity and stock mix
   - Gas-efficient callback (Monad charges by gas LIMIT)

2. **Inventory Management**
   - Reserves 10 USDC worth of inventory per pull
   - Releases unused reservation after resolution
   - Blocks pulls if inventory insufficient

3. **Direct Transfer**
   - xStocks transferred to player's wallet in `entropyCallback`
   - No separate claim step or custody
   - Fallback to owed balance if transfer fails

4. **Price Management**
   - Keeper updates prices every minute
   - Price staleness check (default: 5 minutes)
   - Future oracle hook for decentralization

5. **Safety Features**
   - ReentrancyGuard on all state-changing functions
   - Pausable in case of emergency
   - Owner controls for parameters and treasury

## Monad Mainnet Addresses

| Asset/Contract | Address |
|----------------|---------|
| USDC (6 decimals) | `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` |
| Pyth Entropy | `0xD458261E832415CFd3BAE5E416FdF3230ce6F134` |
| TSLAx (Tesla) | `0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0` |
| AAPLx (Apple) | `0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a` |
| NVDAx (Nvidia) | `0xc845b2894dbddd03858fd2d643b4ef725fe0849d` |
| SPYx (S&P 500) | `0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48` |

**RPC**: `https://rpc.monad.xyz`

## Gas Considerations (Monad-Specific)

### Gas Charged by Limit
Monad charges gas based on the gas **LIMIT**, not actual usage. Set realistic limits to avoid overpaying.

### Cold Storage Access
Cold SLOAD/SSTORE costs **10,100 gas** on Monad (vs 2,100 on Ethereum). Minimize cold storage access in hot paths.

### Callback Gas Limit
The `entropyCallback` function must handle up to 4 ERC-20 transfers (one per xStocks token). Recommended callback gas limit: **100,000+ gas** to cover:
- 4 cold ERC-20 transfers (~40,400 gas)
- Callback logic (~20,000 gas)
- Safety margin

## Economics

- **Player EV**: 0.9154 USDC per 1 USDC pull (~8.5% house edge)
  - Common (98%): 0.98 × 0.73 = 0.7154
  - Legendary (2%): 0.02 × 10 = 0.2000
- **Break-even legendary rate**: ~2.9%
- **Inventory requirements**: 20 USDC covers ~2 back-to-back legendaries or ~27 commons

## Testing

### Test Coverage

- ✅ Common pull (98% chance)
- ✅ Legendary pull (2% chance)
- ✅ Insufficient inventory blocks pull
- ✅ Stale price blocks pull
- ✅ Failed transfer creates owed balance
- ✅ Owed balance withdrawal
- ✅ Treasury accounting
- ✅ Reservation release
- ✅ Multiple simultaneous pulls
- ✅ Owner controls (pause, parameters, withdrawal)
- ✅ Keeper price updates
- ✅ Excess MON refunded
- ✅ Fork tests (Monad mainnet)

### Run specific tests

```bash
# Test common pull
forge test --match-test test_CommonPull -vvv

# Test legendary pull
forge test --match-test test_LegendaryPull -vvv

# Test failed transfers
forge test --match-test test_FailedTransferCreatesOwedBalance -vvv

# Test inventory management
forge test --match-test test_InsufficientInventoryBlocksPull -vvv
```

## Security Considerations

### Pre-Demo Checklist

- [ ] Test tiny xStocks transfers to/from contract (check for allowlist/blacklist)
- [ ] Verify xStocks token decimals
- [ ] Test with actual Monad RPC (fork tests)
- [ ] Deploy to Monad testnet first (if available)
- [ ] Verify Pyth Entropy callback gas limit is sufficient
- [ ] Test price staleness behavior
- [ ] Verify USDC approval and transfer
- [ ] Test pause/unpause functionality
- [ ] Verify owner controls work as expected
- [ ] Test multiple simultaneous pulls
- [ ] Monitor gas costs on Monad

### Known Risks

1. **Centralized Keeper**: Single point of failure for price updates
   - Mitigation: Monitor keeper, plan oracle migration
   
2. **xStocks Restrictions**: Tokens may have allowlist/blacklist or market halts
   - Mitigation: Test transfers, monitor halt status
   
3. **Callback Gas Limit**: Monad charges by limit, not usage
   - Mitigation: Set reasonable limit, test thoroughly

4. **Corporate Actions**: xStocks may split/reverse-split
   - Mitigation: Monitor multipliers from xStocks API

## Development

### Project Structure

```
contracts/
├── src/
│   ├── ClawMachine.sol          # Main contract
│   └── interfaces/
│       ├── IEntropy.sol          # Pyth Entropy interface
│       └── IPriceOracle.sol      # Oracle interface
├── test/
│   ├── ClawMachine.t.sol         # Unit tests
│   ├── ClawMachineFork.t.sol     # Fork tests
│   └── mocks/
│       ├── MockERC20.sol         # Mock ERC20 token
│       ├── MockEntropy.sol       # Mock Pyth Entropy
│       └── MockFailingToken.sol  # Token that can fail transfers
├── script/
│   └── Deploy.s.sol              # Deployment script
├── foundry.toml                  # Foundry configuration
└── README.md                     # This file
```

### Foundry Configuration

- **Solidity version**: 0.8.24
- **Optimizer**: Enabled (200 runs)
- **RPC endpoint**: `monad = https://rpc.monad.xyz`

### Dependencies

- OpenZeppelin Contracts (access control, security)
- Forge Standard Library (testing utilities)

## License

MIT
