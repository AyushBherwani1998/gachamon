// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ClawMachine} from "../src/ClawMachine.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/**
 * @title ClawMachineForkTest
 * @notice Fork tests against Monad mainnet
 * @dev Run with: MONAD_RPC=https://rpc.monad.xyz forge test --match-contract ClawMachineForkTest
 */
contract ClawMachineForkTest is Test {
    // Monad mainnet addresses
    address constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address constant PYTH_ENTROPY = 0xD458261E832415CFd3BAE5E416FdF3230ce6F134;
    address constant PYTH_PRICE_FEED = 0xB754BA51E3861Ac0Cb67f73CD046dE790A36508d; // PriceFeedUpgraded (Core Aug 2026)
    address constant TSLAx = 0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0;
    address constant AAPLx = 0x9d275685dC284C8eB1C79f6ABA7a63Dc75ec890a;
    address constant NVDAx = 0xc845b2894dBddd03858fd2D643B4eF725fE0849d;
    address constant SPYx = 0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48;

    // Pyth feed IDs
    bytes32 constant TSLA_FEED_ID = 0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1;
    bytes32 constant NVDA_FEED_ID = 0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593;
    bytes32 constant AAPL_FEED_ID = 0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688;
    bytes32 constant SPY_FEED_ID = 0x19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5;

    ClawMachine public claw;
    address public owner = address(0x1);

    function setUp() public {
        // Skip if MONAD_RPC not set
        string memory rpcUrl = vm.envOr("MONAD_RPC", string(""));
        if (bytes(rpcUrl).length == 0) {
            vm.skip(true);
            return;
        }

        // Create fork
        vm.createSelectFork(rpcUrl);

        // Deploy ClawMachine
        vm.prank(owner);
        claw = new ClawMachine(
            USDC,
            PYTH_ENTROPY,
            PYTH_PRICE_FEED,
            owner
        );

        // Setup tokens
        vm.startPrank(owner);
        claw.addToken(TSLAx, TSLA_FEED_ID);
        claw.addToken(AAPLx, AAPL_FEED_ID);
        claw.addToken(NVDAx, NVDA_FEED_ID);
        claw.addToken(SPYx, SPY_FEED_ID);
        vm.stopPrank();
    }

    function test_Fork_ContractDeployment() public view {
        assertEq(address(claw.usdc()), USDC);
        assertEq(address(claw.entropy()), PYTH_ENTROPY);
        assertEq(address(claw.pyth()), PYTH_PRICE_FEED);
    }

    function test_Fork_TokenMetadata() public view {
        // Verify USDC decimals
        uint8 usdcDecimals = IERC20Metadata(USDC).decimals();
        assertEq(usdcDecimals, 6, "USDC should have 6 decimals");

        // Verify xStocks decimals
        uint8 tslaDecimals = IERC20Metadata(TSLAx).decimals();
        uint8 nvdaDecimals = IERC20Metadata(NVDAx).decimals();
        uint8 aaplDecimals = IERC20Metadata(AAPLx).decimals();
        uint8 spyDecimals = IERC20Metadata(SPYx).decimals();

        console.log("TSLAx decimals:", tslaDecimals);
        console.log("NVDAx decimals:", nvdaDecimals);
        console.log("AAPLx decimals:", aaplDecimals);
        console.log("SPYx decimals:", spyDecimals);

        // Most ERC20s use 18 decimals, but verify
        assertTrue(tslaDecimals > 0 && tslaDecimals <= 18, "Valid decimals");
        assertTrue(nvdaDecimals > 0 && nvdaDecimals <= 18, "Valid decimals");
        assertTrue(aaplDecimals > 0 && aaplDecimals <= 18, "Valid decimals");
        assertTrue(spyDecimals > 0 && spyDecimals <= 18, "Valid decimals");
    }

    function test_Fork_EntropyFee() public view {
        uint256 fee = claw.getEntropyFee();
        console.log("Entropy fee (MON):", fee);
        assertGt(fee, 0, "Fee should be > 0");
    }

    function test_Fork_PythFee() public view {
        bytes[] memory emptyUpdate = new bytes[](0);
        uint256 fee = claw.getPythFee(emptyUpdate);
        console.log("Pyth fee (MON):", fee);
        // Fee might be 0 for empty update, that's OK
    }

    function test_Fork_ContractAddresses() public view {
        console.log("USDC address:", USDC);
        console.log("TSLAx address:", TSLAx);
        console.log("Pyth PriceFeed:", PYTH_PRICE_FEED);
        console.log("Pyth Entropy:", PYTH_ENTROPY);
        console.log("ClawMachine address:", address(claw));
        
        // Verify feed IDs are set
        (bytes32 tslaFeedId, , bool supported) = claw.tokenInfo(TSLAx);
        assertTrue(supported, "TSLA should be supported");
        assertEq(tslaFeedId, TSLA_FEED_ID, "TSLA feed ID should match");
        
        console.log("TSLA feed ID:", vm.toString(tslaFeedId));
    }
}
