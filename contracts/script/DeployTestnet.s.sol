// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

import {ClawMachine} from "../src/ClawMachine.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockStock} from "../src/mocks/MockStock.sol";
import {MockPriceFeed} from "../src/mocks/MockPriceFeed.sol";

/**
 * @title DeployTestnet
 * @notice Deploys the full Monad testnet stack (chain 10143): MockUSDC, MockStock TSLAx,
 *         MockPriceFeed and a ClawMachine wired to the real testnet Pyth Entropy.
 *
 * @dev The broadcaster is the owner. No key is read from the environment:
 *
 *      forge script script/DeployTestnet.s.sol --rpc-url monad_testnet --account deployer \
 *        --broadcast --verify --verifier sourcify \
 *        --verifier-url https://sourcify-api-monad.blockvision.org/
 *
 *      Monad testnet has no Chainlink equity feeds, so the script deploys an
 *      AggregatorV3-compatible MockPriceFeed seeded at 383 USD. Entropy is real.
 */
contract DeployTestnet is Script {
    // Verified live 2026-11-04: this is the Entropy V2 deployment whose default
    // provider (0x6CC14824Ea2918f5De5C2f75A9Da968ad4BD6344) is registered. The
    // mainnet address 0xD458... also exists on testnet but its provider is not.
    address internal constant PYTH_ENTROPY = 0x825c0390f379C631f3Cf11A82a37D20BddF93c07;

    int256 internal constant TSLA_SEED_PRICE = 383e8; // 383.00 USD, 8 decimals

    function run() external returns (ClawMachine claw) {
        address deployer = msg.sender;
        require(block.chainid == 10143, "Must deploy on Monad testnet (chain 10143)");

        console.log("Deploying from:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast();

        MockUSDC usdc = new MockUSDC();
        MockStock tsla = new MockStock("Tesla xStock", "TSLAx");
        MockPriceFeed tslaFeed = new MockPriceFeed(TSLA_SEED_PRICE, 8);

        claw = new ClawMachine(address(usdc), PYTH_ENTROPY, deployer);

        claw.addToken(address(tsla), address(tslaFeed));

        // Seed the machine with 1 TSLAx of inventory.
        tsla.mint(address(claw), 1 ether);

        vm.stopBroadcast();

        console.log("\n=== Testnet Deployment Complete ===");
        console.log("MockUSDC:", address(usdc));
        console.log("MockStock (TSLAx):", address(tsla));
        console.log("MockPriceFeed (TSLA):", address(tslaFeed));
        console.log("ClawMachine:", address(claw));
        console.log("Owner:", deployer);
        console.log("Pyth Entropy:", PYTH_ENTROPY);
        console.log("Entropy provider:", claw.entropyProvider());
        console.log("Callback gas limit:", claw.callbackGasLimit());
        console.log("Seed TSLA price (8 decimals):", uint256(TSLA_SEED_PRICE));

        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            _writeDeployment(claw, address(usdc), address(tsla), address(tslaFeed));
        } else {
            console.log("\nDry run: deployments/monad-testnet.json not written");
        }

        console.log("\nNext steps:");
        console.log("1. Players call MockUSDC.faucet() for 100 test USDC");
        console.log("2. MockPriceFeed.setAnswer() refreshes the mock TSLA price");
    }

    function _writeDeployment(
        ClawMachine claw,
        address usdc,
        address tsla,
        address tslaFeed
    ) internal {
        string[] memory symbols = new string[](1);
        symbols[0] = "TSLAx";

        address[] memory tokens = new address[](1);
        tokens[0] = tsla;

        address[] memory feeds = new address[](1);
        feeds[0] = tslaFeed;

        string memory params = "params";
        vm.serializeUint(params, "pullPrice", claw.pullPrice());
        vm.serializeUint(params, "commonPayoutBps", claw.commonPayoutBps());
        vm.serializeUint(params, "legendaryRarityBps", claw.legendaryRarityBps());
        vm.serializeUint(params, "legendaryMultiplier", claw.legendaryMultiplier());
        vm.serializeUint(params, "maxPriceAge", claw.maxPriceAge());
        string memory paramsJson =
            vm.serializeUint(params, "callbackGasLimit", claw.callbackGasLimit());

        string memory obj = "monad-testnet";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "address", address(claw));
        vm.serializeAddress(obj, "clawMachine", address(claw));
        vm.serializeUint(obj, "deployBlock", block.number);
        vm.serializeAddress(obj, "usdc", usdc);
        vm.serializeAddress(obj, "entropy", PYTH_ENTROPY);
        vm.serializeAddress(obj, "provider", claw.entropyProvider());
        vm.serializeString(obj, "tokens", symbols);
        vm.serializeAddress(obj, "tokenAddresses", tokens);
        vm.serializeAddress(obj, "priceFeeds", feeds);
        string memory json = vm.serializeString(obj, "params", paramsJson);

        vm.createDir("deployments", true);
        vm.writeJson(json, "deployments/monad-testnet.json");
        console.log("\nWrote deployments/monad-testnet.json");
    }
}
