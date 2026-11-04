// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

import {ClawMachine} from "../src/ClawMachine.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockStock} from "../src/mocks/MockStock.sol";

/**
 * @title DeployTestnet
 * @notice Deploys the full Monad testnet stack (chain 10143): MockUSDC, MockStock TSLAx
 *         and a ClawMachine wired to the real testnet Pyth and Pyth Entropy deployments.
 *
 * @dev The broadcaster is the owner. No key is read from the environment:
 *
 *      forge script script/DeployTestnet.s.sol --rpc-url monad_testnet --account deployer \
 *        --broadcast --verify --verifier sourcify \
 *        --verifier-url https://sourcify-api-monad.blockvision.org/
 *
 *      Testnet has no USDC and no xStocks, so the machine is seeded with mocks. The
 *      Entropy and Pyth contracts are the real testnet deployments.
 */
contract DeployTestnet is Script {
    // Monad testnet (chain 10143)
    address internal constant PYTH_PRICE_FEED = 0x2880aB155794e7179c9eE2e38200202908C17B43;

    // Verified live 2026-11-04: 0x825c... is the Entropy V2 deployment whose default
    // provider (0x6CC14824Ea2918f5De5C2f75A9Da968ad4BD6344) is registered. The mainnet
    // address 0xD458... also exists on testnet but its provider is not registered.
    address internal constant PYTH_ENTROPY = 0x825c0390f379C631f3Cf11A82a37D20BddF93c07;

    bytes32 internal constant TSLA_FEED_ID =
        0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1;

    function run() external returns (ClawMachine claw) {
        address deployer = msg.sender;
        require(block.chainid == 10143, "Must deploy on Monad testnet (chain 10143)");

        console.log("Deploying from:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast();

        MockUSDC usdc = new MockUSDC();
        MockStock tsla = new MockStock("Tesla xStock", "TSLAx");

        claw = new ClawMachine(
            address(usdc),
            PYTH_ENTROPY,
            PYTH_PRICE_FEED,
            deployer
        );

        claw.addToken(address(tsla), TSLA_FEED_ID);

        // Seed the machine with 1 TSLAx of inventory.
        tsla.mint(address(claw), 1 ether);

        vm.stopBroadcast();

        console.log("\n=== Testnet Deployment Complete ===");
        console.log("MockUSDC:", address(usdc));
        console.log("MockStock (TSLAx):", address(tsla));
        console.log("ClawMachine:", address(claw));
        console.log("Owner:", deployer);
        console.log("Pyth price feed:", PYTH_PRICE_FEED);
        console.log("Pyth Entropy:", PYTH_ENTROPY);
        console.log("Entropy provider:", claw.entropyProvider());
        console.log("Callback gas limit:", claw.callbackGasLimit());

        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            _writeDeployment(claw, address(usdc), address(tsla));
        } else {
            console.log("\nDry run: deployments/monad-testnet.json not written");
        }

        console.log("\nNext steps:");
        console.log("1. Players call MockUSDC.faucet() for 100 test USDC");
        console.log("2. Use the TSLA Hermes update (same feed ID as mainnet) for pull()");
    }

    function _writeDeployment(ClawMachine claw, address usdc, address tsla) internal {
        string[] memory symbols = new string[](1);
        symbols[0] = "TSLAx";

        address[] memory tokens = new address[](1);
        tokens[0] = tsla;

        bytes32[] memory feeds = new bytes32[](1);
        feeds[0] = TSLA_FEED_ID;

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
        vm.serializeAddress(obj, "pyth", PYTH_PRICE_FEED);
        vm.serializeAddress(obj, "entropy", PYTH_ENTROPY);
        vm.serializeAddress(obj, "provider", claw.entropyProvider());
        vm.serializeString(obj, "tokens", symbols);
        vm.serializeAddress(obj, "tokenAddresses", tokens);
        vm.serializeBytes32(obj, "feedIds", feeds);
        string memory json = vm.serializeString(obj, "params", paramsJson);

        vm.createDir("deployments", true);
        vm.writeJson(json, "deployments/monad-testnet.json");
        console.log("\nWrote deployments/monad-testnet.json");
    }
}
