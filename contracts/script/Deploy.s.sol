// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ClawMachine} from "../src/ClawMachine.sol";

/**
 * @title Deploy
 * @notice Deployment script for ClawMachine on Monad mainnet
 * @dev Run with: forge script script/Deploy.s.sol --rpc-url monad --broadcast --verify
 *      (Add --private-key <key> or set PRIVATE_KEY env var to actually deploy)
 */
contract Deploy is Script {
    // Monad mainnet (chain 143) addresses
    address constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address constant PYTH_ENTROPY = 0xD458261E832415CFd3BAE5E416FdF3230ce6F134;
    address constant PYTH_PRICE_FEED = 0xB754BA51E3861Ac0Cb67f73CD046dE790A36508d; // PriceFeedUpgraded (Pyth Core Aug 2026)
    
    address constant TSLAx = 0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0;
    address constant AAPLx = 0x9d275685dC284C8eB1C79f6ABA7a63Dc75ec890a;
    address constant NVDAx = 0xc845b2894dBddd03858fd2D643B4eF725fE0849d;
    address constant SPYx = 0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48;

    // Pyth price feed IDs (from Hermes API)
    bytes32 constant TSLA_FEED_ID = 0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1;
    bytes32 constant NVDA_FEED_ID = 0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593;
    bytes32 constant AAPL_FEED_ID = 0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688;
    bytes32 constant SPY_FEED_ID = 0x19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5;

    function run() public {
        // Get deployer from private key
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0));
        require(deployerPrivateKey != 0, "PRIVATE_KEY not set");

        address deployer = vm.addr(deployerPrivateKey);
        console.log("Deploying from:", deployer);
        console.log("Chain ID:", block.chainid);

        require(block.chainid == 143, "Must deploy on Monad mainnet (chain 143)");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy ClawMachine
        ClawMachine claw = new ClawMachine(
            USDC,
            PYTH_ENTROPY,
            PYTH_PRICE_FEED,
            deployer  // owner
        );

        console.log("ClawMachine deployed at:", address(claw));

        // Add supported tokens with their Pyth feed IDs
        console.log("Adding supported tokens with Pyth feed IDs...");
        claw.addToken(TSLAx, TSLA_FEED_ID);
        claw.addToken(NVDAx, NVDA_FEED_ID);
        claw.addToken(AAPLx, AAPL_FEED_ID);
        claw.addToken(SPYx, SPY_FEED_ID);

        vm.stopBroadcast();

        console.log("\n=== Deployment Complete ===");
        console.log("ClawMachine:", address(claw));
        console.log("Owner:", deployer);
        console.log("USDC:", USDC);
        console.log("Pyth Entropy:", PYTH_ENTROPY);
        console.log("Pyth PriceFeed (Core Upgraded):", PYTH_PRICE_FEED);
        console.log("\nPyth Feed IDs:");
        console.log("TSLAx:", vm.toString(TSLA_FEED_ID));
        console.log("NVDAx:", vm.toString(NVDA_FEED_ID));
        console.log("AAPLx:", vm.toString(AAPL_FEED_ID));
        console.log("SPYx:", vm.toString(SPY_FEED_ID));
        console.log("\nNext steps:");
        console.log("1. Transfer ~20 USDC worth of xStocks to the contract for inventory");
        console.log("2. Frontend fetches price updates from Pyth Hermes API");
        console.log("   https://hermes.pyth.network/v2/updates/price/latest");
        console.log("3. Players call pull(userRandom, priceUpdateData) with Pyth+Entropy fees");
        console.log("4. Consider transferring ownership to multi-sig");
        console.log("\nInventory refill example:");
        console.log("  claw.refillInventory([TSLAx, NVDAx, AAPLx, SPYx], [amounts...])");
    }

    /**
     * @notice Dry run deployment (no broadcast, no private key needed)
     */
    function runDryRun() public view {
        console.log("=== Dry Run Deployment ===");
        console.log("Target chain: Monad mainnet (143)");
        console.log("Current chain:", block.chainid);
        console.log("\nContract addresses:");
        console.log("USDC:", USDC);
        console.log("Pyth Entropy:", PYTH_ENTROPY);
        console.log("Pyth PriceFeed (Core Upgraded):", PYTH_PRICE_FEED);
        console.log("TSLAx:", TSLAx);
        console.log("AAPLx:", AAPLx);
        console.log("NVDAx:", NVDAx);
        console.log("SPYx:", SPYx);
        console.log("\nPyth Feed IDs:");
        console.log("TSLA:", vm.toString(TSLA_FEED_ID));
        console.log("NVDA:", vm.toString(NVDA_FEED_ID));
        console.log("AAPL:", vm.toString(AAPL_FEED_ID));
        console.log("SPY:", vm.toString(SPY_FEED_ID));
        console.log("\nTo deploy:");
        console.log("forge script script/Deploy.s.sol --rpc-url monad --broadcast --private-key <key>");
    }
}
