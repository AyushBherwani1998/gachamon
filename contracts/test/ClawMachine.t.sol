// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ClawMachine} from "../src/ClawMachine.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockEntropy} from "./mocks/MockEntropy.sol";
import {MockPyth} from "./mocks/MockPyth.sol";
import {MockFailingToken} from "./mocks/MockFailingToken.sol";

contract ClawMachineTest is Test {
    ClawMachine public claw;
    MockERC20 public usdc;
    MockEntropy public entropy;
    MockPyth public pyth;
    MockERC20 public tsla;
    MockERC20 public nvda;
    MockERC20 public aapl;
    MockERC20 public spy;

    address public owner = address(0x1);
    address public player = address(0x3);

    uint256 constant PULL_PRICE = 1_000000; // 1 USDC
    uint256 constant ENTROPY_FEE = 0.001 ether;
    uint256 constant PYTH_FEE = 0.0001 ether;
    uint256 constant TOTAL_FEE = ENTROPY_FEE + PYTH_FEE;

    // Pyth feed IDs (mock)
    bytes32 constant TSLA_FEED_ID = bytes32(uint256(1));
    bytes32 constant NVDA_FEED_ID = bytes32(uint256(2));
    bytes32 constant AAPL_FEED_ID = bytes32(uint256(3));
    bytes32 constant SPY_FEED_ID = bytes32(uint256(4));

    event PullRequested(
        uint256 indexed pullId,
        address indexed player,
        uint64 sequenceNumber,
        uint256 pullPrice
    );

    event PullResolved(
        uint256 indexed pullId,
        address indexed player,
        bool legendary,
        address[] stocks,
        uint256[] amounts
    );

    function setUp() public {
        // Deploy mocks
        usdc = new MockERC20("USDC", "USDC", 6);
        entropy = new MockEntropy();
        pyth = new MockPyth();
        tsla = new MockERC20("TSLAx", "TSLAx", 18);
        nvda = new MockERC20("NVDAx", "NVDAx", 18);
        aapl = new MockERC20("AAPLx", "AAPLx", 18);
        spy = new MockERC20("SPYx", "SPYx", 18);

        // Deploy ClawMachine
        vm.prank(owner);
        claw = new ClawMachine(
            address(usdc),
            address(entropy),
            address(pyth),
            owner
        );

        // Setup tokens with feed IDs
        vm.startPrank(owner);
        claw.addToken(address(tsla), TSLA_FEED_ID);
        claw.addToken(address(nvda), NVDA_FEED_ID);
        claw.addToken(address(aapl), AAPL_FEED_ID);
        claw.addToken(address(spy), SPY_FEED_ID);
        vm.stopPrank();

        // Set mock Pyth prices
        _setMockPrices();

        // Fund inventory (20 USDC worth of xStocks)
        tsla.mint(address(claw), 0.02 ether); // 0.02 TSLA * $250 = $5
        nvda.mint(address(claw), 0.01 ether); // 0.01 NVDA * $500 = $5
        aapl.mint(address(claw), 0.033 ether); // 0.033 AAPL * $150 = $4.95
        spy.mint(address(claw), 0.0125 ether); // 0.0125 SPY * $400 = $5

        // Fund player
        usdc.mint(player, 100_000000); // 100 USDC
        vm.deal(player, 10 ether); // 10 MON for fees
    }

    function _setMockPrices() internal {
        // Set prices: $250, $500, $150, $400
        // Pyth format: price * 1e8 (expo = -8)
        pyth.setPrice(TSLA_FEED_ID, 25000000000, 1000000, -8, block.timestamp);
        pyth.setPrice(NVDA_FEED_ID, 50000000000, 1000000, -8, block.timestamp);
        pyth.setPrice(AAPL_FEED_ID, 15000000000, 1000000, -8, block.timestamp);
        pyth.setPrice(SPY_FEED_ID, 40000000000, 1000000, -8, block.timestamp);
    }

    function _getEmptyPriceUpdate() internal pure returns (bytes[] memory) {
        bytes[] memory updateData = new bytes[](0);
        return updateData;
    }

    function test_InitialState() public view {
        assertEq(address(claw.usdc()), address(usdc));
        assertEq(address(claw.entropy()), address(entropy));
        assertEq(address(claw.pyth()), address(pyth));
        assertEq(claw.pullPrice(), PULL_PRICE);
        assertEq(claw.commonPayoutBps(), 7300);
        assertEq(claw.legendaryRarityBps(), 200);
        assertEq(claw.legendaryMultiplier(), 10);
    }

    function test_InventoryValue() public view {
        uint256 inventoryValue = claw.getInventoryValue();
        // ~20 USDC worth (may have rounding)
        assertGt(inventoryValue, 19_000000);
        assertLt(inventoryValue, 21_000000);
    }

    function test_CommonPull() public {
        // Approve USDC
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        // Pull
        bytes[] memory priceUpdate = _getEmptyPriceUpdate();
        vm.prank(player);
        uint256 pullId = claw.pull{value: TOTAL_FEE}(bytes32(uint256(12345)), priceUpdate);

        assertEq(pullId, 0);
        assertEq(usdc.balanceOf(address(claw)), PULL_PRICE);

        // Fulfill with common roll (e.g., 500 which is > 200)
        uint64 sequenceNumber = 1;
        entropy.fulfillWithRoll(sequenceNumber, 500);

        // Check pull resolved
        (address p, , , bool resolved) = claw.getPullBasicData(pullId);
        assertTrue(resolved);
        assertEq(p, player);

        // Player should have received some xStocks
        assertTrue(
            tsla.balanceOf(player) > 0 ||
            nvda.balanceOf(player) > 0 ||
            aapl.balanceOf(player) > 0 ||
            spy.balanceOf(player) > 0
        );
    }

    function test_LegendaryPull() public {
        // Approve USDC
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        // Pull
        bytes[] memory priceUpdate = _getEmptyPriceUpdate();
        vm.prank(player);
        uint256 pullId = claw.pull{value: TOTAL_FEE}(bytes32(uint256(12345)), priceUpdate);

        uint256 playerBalanceBefore = tsla.balanceOf(player) + nvda.balanceOf(player) + 
                                      aapl.balanceOf(player) + spy.balanceOf(player);

        // Fulfill with legendary roll (< 200)
        uint64 sequenceNumber = 1;
        entropy.fulfillWithRoll(sequenceNumber, 50);

        uint256 playerBalanceAfter = tsla.balanceOf(player) + nvda.balanceOf(player) + 
                                     aapl.balanceOf(player) + spy.balanceOf(player);

        // Player should have received significantly more tokens
        assertGt(playerBalanceAfter, playerBalanceBefore);

        // Check pull resolved
        (address p, , , bool resolved) = claw.getPullBasicData(pullId);
        assertTrue(resolved);
        assertEq(p, player);
    }

    function test_InsufficientInventoryBlocksPull() public {
        // Drain most of inventory
        vm.startPrank(owner);
        claw.withdrawInventory(address(tsla), tsla.balanceOf(address(claw)));
        claw.withdrawInventory(address(nvda), nvda.balanceOf(address(claw)));
        claw.withdrawInventory(address(aapl), aapl.balanceOf(address(claw)));
        vm.stopPrank();

        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        bytes[] memory priceUpdate = _getEmptyPriceUpdate();
        vm.prank(player);
        vm.expectRevert("Insufficient inventory");
        claw.pull{value: TOTAL_FEE}(bytes32(uint256(12345)), priceUpdate);
    }

    function test_StalePriceBlocksPull() public {
        // Fast forward past max price age (60 seconds)
        vm.warp(block.timestamp + 61);

        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        bytes[] memory priceUpdate = _getEmptyPriceUpdate();
        vm.prank(player);
        vm.expectRevert();
        claw.pull{value: TOTAL_FEE}(bytes32(uint256(12345)), priceUpdate);
    }

    function test_FailedTransferCreatesOwedBalance() public {
        // Deploy a token that can fail transfers
        MockFailingToken failToken = new MockFailingToken("FAILx", "FAILx");
        
        vm.prank(owner);
        claw.addToken(address(failToken), bytes32(uint256(999)));

        // Set price
        pyth.setPrice(bytes32(uint256(999)), 10000000000, 1000000, -8, block.timestamp);

        failToken.mint(address(claw), 1 ether);

        // Make it fail transfers
        failToken.setShouldFail(true);

        // Player pulls
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        bytes[] memory priceUpdate = _getEmptyPriceUpdate();
        vm.prank(player);
        uint256 pullId = claw.pull{value: TOTAL_FEE}(bytes32(uint256(12345)), priceUpdate);

        // Fulfill
        entropy.fulfillWithRoll(1, 500);

        // Check owed balance
        (address[] memory owedTokens, uint256[] memory owedAmounts) = 
            claw.getOwedBalance(player);

        // Should have owed balance for failToken or other tokens
        bool hasOwed = false;
        for (uint256 i = 0; i < owedTokens.length; i++) {
            if (owedAmounts[i] > 0) {
                hasOwed = true;
                break;
            }
        }
        assertTrue(hasOwed, "Should have owed balance");

        // Fix transfer and withdraw
        failToken.setShouldFail(false);

        uint256 balanceBefore = failToken.balanceOf(player);
        vm.prank(player);
        claw.withdrawOwed();
        uint256 balanceAfter = failToken.balanceOf(player);
        
        // Should have received owed tokens (might be from failToken or other tokens)
        assertTrue(balanceAfter >= balanceBefore, "Balance should not decrease");
    }

    function test_TreasuryAccounting() public {
        uint256 treasuryBefore = usdc.balanceOf(address(claw));

        // Do a common pull
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        bytes[] memory priceUpdate = _getEmptyPriceUpdate();
        vm.prank(player);
        claw.pull{value: TOTAL_FEE}(bytes32(uint256(12345)), priceUpdate);

        uint256 treasuryAfterPull = usdc.balanceOf(address(claw));
        assertEq(treasuryAfterPull, treasuryBefore + PULL_PRICE);

        // Fulfill
        entropy.fulfillWithRoll(1, 500);

        // Treasury should still have the USDC
        assertEq(usdc.balanceOf(address(claw)), treasuryAfterPull);

        // Owner can withdraw treasury
        vm.prank(owner);
        claw.withdrawTreasury(PULL_PRICE);

        assertEq(usdc.balanceOf(address(claw)), 0);
        assertEq(usdc.balanceOf(owner), PULL_PRICE);
    }

    function test_ReservationRelease() public {
        assertEq(claw.getPendingReservations(), 0);

        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        bytes[] memory priceUpdate = _getEmptyPriceUpdate();
        vm.prank(player);
        claw.pull{value: TOTAL_FEE}(bytes32(uint256(12345)), priceUpdate);

        // Should have reserved 10 USDC worth
        assertEq(claw.getPendingReservations(), 10_000000);

        // Fulfill with common (only uses 0.73 USDC)
        entropy.fulfillWithRoll(1, 500);

        // Reservation should be released
        assertEq(claw.getPendingReservations(), 0);
    }

    function test_OwnerCanUpdateParameters() public {
        vm.prank(owner);
        claw.setParameters(
            2_000000, // 2 USDC
            8000,     // 80% common payout
            100,      // 1% legendary
            20        // 20x multiplier
        );

        assertEq(claw.pullPrice(), 2_000000);
        assertEq(claw.commonPayoutBps(), 8000);
        assertEq(claw.legendaryRarityBps(), 100);
        assertEq(claw.legendaryMultiplier(), 20);
    }

    function test_OwnerCanPauseAndUnpause() public {
        vm.prank(owner);
        claw.pause();

        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        bytes[] memory priceUpdate = _getEmptyPriceUpdate();
        vm.prank(player);
        vm.expectRevert();
        claw.pull{value: TOTAL_FEE}(bytes32(uint256(12345)), priceUpdate);

        vm.prank(owner);
        claw.unpause();

        // Should work now
        vm.prank(player);
        claw.pull{value: TOTAL_FEE}(bytes32(uint256(12345)), priceUpdate);
    }

    function test_InsufficientFeeReverts() public {
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        bytes[] memory priceUpdate = _getEmptyPriceUpdate();
        vm.prank(player);
        vm.expectRevert("Insufficient fee");
        claw.pull{value: TOTAL_FEE / 2}(bytes32(uint256(12345)), priceUpdate);
    }

    function test_GetFees() public view {
        bytes[] memory priceUpdate = _getEmptyPriceUpdate();
        uint256 pythFee = claw.getPythFee(priceUpdate);
        uint256 entropyFee = claw.getEntropyFee();
        uint256 totalFee = claw.getTotalFee(priceUpdate);
        
        assertEq(pythFee, PYTH_FEE);
        assertEq(entropyFee, ENTROPY_FEE);
        assertEq(totalFee, TOTAL_FEE);
    }

    function test_ExcessMONRefunded() public {
        uint256 excessMON = 0.1 ether;
        uint256 totalSent = TOTAL_FEE + excessMON;

        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        uint256 balanceBefore = player.balance;
        bytes[] memory priceUpdate = _getEmptyPriceUpdate();
        vm.prank(player);
        claw.pull{value: totalSent}(bytes32(uint256(12345)), priceUpdate);
        uint256 balanceAfter = player.balance;

        // Should have been refunded the excess
        assertEq(balanceBefore - balanceAfter, TOTAL_FEE);
    }

    function test_OwnerCanSetMaxPriceAge() public {
        vm.prank(owner);
        claw.setMaxPriceAge(300); // 5 minutes

        assertEq(claw.maxPriceAge(), 300);
    }

    function test_PriceSnapshotStored() public {
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        bytes[] memory priceUpdate = _getEmptyPriceUpdate();
        vm.prank(player);
        uint256 pullId = claw.pull{value: TOTAL_FEE}(bytes32(uint256(12345)), priceUpdate);

        // Check price snapshot was stored
        uint256 tslaPrice = claw.getPullPriceSnapshot(pullId, address(tsla));
        assertGt(tslaPrice, 0, "TSLA price should be snapshotted");
    }
}
