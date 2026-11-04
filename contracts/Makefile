.PHONY: build test test-gas fmt abi clean deploy-testnet deploy-mainnet

build:
	forge build

test:
	forge test -vv

test-gas:
	forge test --match-test "Gas" -vv

fmt:
	forge fmt

abi:
	mkdir -p abi
	FOUNDRY_DISABLE_NIGHTLY_WARNING=1 forge inspect src/ClawMachine.sol:ClawMachine abi --json > abi/ClawMachine.json
	FOUNDRY_DISABLE_NIGHTLY_WARNING=1 forge inspect src/mocks/MockUSDC.sol:MockUSDC abi --json > abi/MockUSDC.json
	FOUNDRY_DISABLE_NIGHTLY_WARNING=1 forge inspect src/mocks/MockStock.sol:MockStock abi --json > abi/MockStock.json

clean:
	forge clean

# Requires a keystore account named "deployer" (see README).
deploy-testnet:
	forge script script/DeployTestnet.s.sol --rpc-url monad_testnet --account deployer --broadcast

deploy-mainnet:
	forge script script/DeployMainnet.s.sol --rpc-url monad --account deployer --broadcast
