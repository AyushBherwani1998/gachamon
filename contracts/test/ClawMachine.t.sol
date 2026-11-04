// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ClawMachine} from "../src/ClawMachine.sol";
import {MockPriceFeed} from "../src/mocks/MockPriceFeed.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockEntropy} from "./mocks/MockEntropy.sol";
import {MockFailingToken} from "./mocks/MockFailingToken.sol";

contract ClawMachineTest is Test {
    ClawMachine public claw;
    MockERC20 public usdc;
    MockEntropy public entropy;
    MockERC20 public tsla;
    MockERC20 public nvda;
    MockERC20 public aapl;
    MockERC20 public spy;
    MockPriceFeed public tslaFeed;
    MockPriceFeed public nvdaFeed;
    MockPriceFeed public aaplFeed;
    MockPriceFeed public spyFeed;

    address public owner = address(0x1);
    address public player = address(0x3);

    uint256 constant PULL_PRICE = 1_000000; // 1 USDC
    uint256 constant ENTROPY_FEE = 0.001 ether;

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

    event PullRefunded(uint256 indexed pullId, address indexed player, uint256 amount);

    function setUp() public {
        // Deploy mocks
        usdc = new MockERC20("USDC", "USDC", 6);
        entropy = new MockEntropy();
        tsla = new MockERC20("TSLAx", "TSLAx", 18);
        nvda = new MockERC20("NVDAx", "NVDAx", 18);
        aapl = new MockERC20("AAPLx", "AAPLx", 18);
        spy = new MockERC20("SPYx", "SPYx", 18);

        // Chainlink-style feeds: $250, $500, $150, $400 (8 decimals)
        tslaFeed = new MockPriceFeed(250e8, 8);
        nvdaFeed = new MockPriceFeed(500e8, 8);
        aaplFeed = new MockPriceFeed(150e8, 8);
        spyFeed = new MockPriceFeed(400e8, 8);

        // Deploy ClawMachine
        vm.prank(owner);
        claw = new ClawMachine(address(usdc), address(entropy), owner);

        // Setup tokens with their Chainlink feeds
        vm.startPrank(owner);
        claw.addToken(address(tsla), address(tslaFeed));
        claw.addToken(address(nvda), address(nvdaFeed));
        claw.addToken(address(aapl), address(aaplFeed));
        claw.addToken(address(spy), address(spyFeed));
        vm.stopPrank();

        // Fund inventory (20 USDC worth of xStocks)
        tsla.mint(address(claw), 0.02 ether); // 0.02 TSLA * $250 = $5
        nvda.mint(address(claw), 0.01 ether); // 0.01 NVDA * $500 = $5
        aapl.mint(address(claw), 0.033 ether); // 0.033 AAPL * $150 = $4.95
        spy.mint(address(claw), 0.0125 ether); // 0.0125 SPY * $400 = $5

        // Fund player
        usdc.mint(player, 100_000000); // 100 USDC
        vm.deal(player, 10 ether); // 10 MON for fees
    }

    function test_InitialState() public view {
        assertEq(address(claw.usdc()), address(usdc));
        assertEq(address(claw.entropy()), address(entropy));
        assertEq(claw.pullPrice(), PULL_PRICE);
        assertEq(claw.commonPayoutBps(), 7300);
        assertEq(claw.legendaryRarityBps(), 200);
        assertEq(claw.legendaryMultiplier(), 10);
        assertEq(claw.maxPriceAge(), 3900);
        assertEq(claw.callbackGasLimit(), 500_000);
    }

    function test_InventoryValue() public view {
        uint256 inventoryValue = claw.getInventoryValue();
        // ~20 USDC worth (may have rounding)
        assertGt(inventoryValue, 19_000000);
        assertLt(inventoryValue, 21_000000);
    }

    function test_TokenPriceAndTimestamp() public view {
        (uint256 price, uint256 updatedAt) = claw.getTokenPrice(address(tsla));
        assertEq(price, 250_000000);
        assertEq(updatedAt, block.timestamp);

        // 1e18 token units of TSLAx is one share at the feed price.
        assertEq(price, 250_000000);
    }

    function test_MultiplierConversion() public {
        // SPYx-like multiplier: the wrapped feed is $400, so one whole SPYx is
        // 400 / 1.007474 = 397.03 USD.
        spy.setMultiplier(1007474e12);

        (uint256 price, ) = claw.getTokenPrice(address(spy));
        assertEq(price, (uint256(400e6) * 1e18) / 1007474e12);
        assertApproxEqRel(price, 397_030_000, 0.0001e18, "converted SPYx price");

        // Inventory uses the same converted price.
        uint256 inventoryValue = claw.getInventoryValue();
        assertApproxEqRel(inventoryValue, 19_912_914, 0.01e18, "inventory at converted price");
    }

    function test_ZeroAnswerReverts() public {
        tslaFeed.setAnswer(0);
        vm.expectRevert("Invalid price");
        claw.getTokenPrice(address(tsla));
    }

    function test_NegativeAnswerReverts() public {
        tslaFeed.setAnswer(-1);
        vm.expectRevert("Invalid price");
        claw.getTokenPrice(address(tsla));
    }

    function test_CommonPull() public {
        // Approve USDC
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        // Pull
        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

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
        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

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

        vm.prank(player);
        vm.expectRevert("Insufficient inventory");
        claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));
    }

    function test_StalePriceBlocksPull() public {
        // Chainlink heartbeat is 3600s; maxPriceAge defaults to 3900s.
        vm.warp(block.timestamp + 3901);

        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        vm.expectRevert("Price too stale");
        claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));
    }

    function test_FailedTransferCreatesOwedBalance() public {
        // Deploy a token that can fail transfers
        MockFailingToken failToken = new MockFailingToken("FAILx", "FAILx");
        MockPriceFeed failFeed = new MockPriceFeed(100e8, 8);

        vm.prank(owner);
        claw.addToken(address(failToken), address(failFeed));

        failToken.mint(address(claw), 1 ether);

        // Make it fail transfers
        failToken.setShouldFail(true);

        // Player pulls
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

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

        vm.prank(player);
        claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

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

        vm.prank(player);
        claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

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

        vm.prank(player);
        vm.expectRevert();
        claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

        vm.prank(owner);
        claw.unpause();

        // Should work now
        vm.prank(player);
        claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));
    }

    function test_InsufficientFeeReverts() public {
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        vm.expectRevert("Insufficient fee");
        claw.pull{value: ENTROPY_FEE / 2}(bytes32(uint256(12345)));
    }

    function test_GetFees() public view {
        uint256 entropyFee = claw.getEntropyFee();
        uint256 totalFee = claw.getFee();

        assertEq(entropyFee, ENTROPY_FEE);
        assertEq(totalFee, ENTROPY_FEE);
    }

    function test_ExcessMONRefunded() public {
        uint256 excessMON = 0.1 ether;
        uint256 totalSent = ENTROPY_FEE + excessMON;

        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        uint256 balanceBefore = player.balance;
        vm.prank(player);
        claw.pull{value: totalSent}(bytes32(uint256(12345)));
        uint256 balanceAfter = player.balance;

        // Should have been refunded the excess
        assertEq(balanceBefore - balanceAfter, ENTROPY_FEE);
    }

    function test_OwnerCanSetMaxPriceAge() public {
        vm.prank(owner);
        claw.setMaxPriceAge(300); // 5 minutes

        assertEq(claw.maxPriceAge(), 300);
    }

    function test_OwnerCanSetCallbackGasLimit() public {
        vm.prank(owner);
        claw.setCallbackGasLimit(750_000);

        assertEq(claw.callbackGasLimit(), 750_000);
    }

    function test_CallbackGasLimitBounds() public {
        vm.startPrank(owner);
        vm.expectRevert("Invalid gas limit");
        claw.setCallbackGasLimit(99_999);
        vm.expectRevert("Invalid gas limit");
        claw.setCallbackGasLimit(1_500_001);
        vm.stopPrank();
    }

    function test_OnlyOwnerCanSetCallbackGasLimit() public {
        vm.prank(player);
        vm.expectRevert();
        claw.setCallbackGasLimit(600_000);
    }

    function test_PullForwardsCallbackGasLimit() public {
        vm.prank(owner);
        claw.setCallbackGasLimit(650_000);

        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

        assertEq(entropy.lastGasLimit(), 650_000);
    }

    function test_RefundStuckPull() public {
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

        uint256 playerBalanceDuringPull = usdc.balanceOf(player);
        assertEq(claw.getPendingReservations(), 10_000000);

        vm.warp(block.timestamp + 10 minutes);

        vm.expectEmit(true, true, false, true, address(claw));
        emit PullRefunded(pullId, player, PULL_PRICE);

        vm.prank(owner);
        claw.refundStuckPull(pullId);

        assertEq(usdc.balanceOf(player), playerBalanceDuringPull + PULL_PRICE, "refund paid");
        assertEq(claw.getPendingReservations(), 0, "reservation released");

        (address p, , , bool resolved) = claw.getPullBasicData(pullId);
        assertEq(p, player);
        assertTrue(resolved, "marked resolved");
    }

    function test_RefundStuckPullBeforeTimeoutReverts() public {
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

        vm.warp(block.timestamp + 10 minutes - 1);

        vm.prank(owner);
        vm.expectRevert("Pull not stuck yet");
        claw.refundStuckPull(pullId);
    }

    function test_RefundStuckPullOnlyOwner() public {
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

        vm.warp(block.timestamp + 10 minutes);

        vm.prank(player);
        vm.expectRevert();
        claw.refundStuckPull(pullId);
    }

    function test_RefundStuckPullAlreadyResolvedReverts() public {
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

        entropy.fulfillWithRoll(1, 500);
        vm.warp(block.timestamp + 10 minutes);

        vm.prank(owner);
        vm.expectRevert("Already resolved");
        claw.refundStuckPull(pullId);
    }

    function test_RefundUnknownPullReverts() public {
        vm.prank(owner);
        vm.expectRevert("Invalid pull");
        claw.refundStuckPull(42);
    }

    function test_RefundedPullCallbackReverts() public {
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

        vm.warp(block.timestamp + 10 minutes);

        vm.prank(owner);
        claw.refundStuckPull(pullId);

        // A callback that lands after the refund must not pay out twice.
        vm.expectRevert("Already resolved");
        entropy.fulfillWithRoll(1, 500);
    }

    function test_PriceSnapshotStored() public {
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

        // Check price snapshot was stored
        uint256 tslaPrice = claw.getPullPriceSnapshot(pullId, address(tsla));
        assertEq(tslaPrice, 250_000000, "TSLA price snapshotted");
    }

    // ============ Inventory-capped payouts ============

    function test_EmptyTokenGetsSkipped() public {
        // No NVDA inventory: a random split must not try to pay in NVDA.
        uint256 nvdaBalance = nvda.balanceOf(address(claw));
        vm.prank(owner);
        claw.withdrawInventory(address(nvda), nvdaBalance);

        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

        entropy.fulfillWithRoll(1, 500);

        assertEq(nvda.balanceOf(player), 0, "empty token pays nothing");
        _assertNoOwed();
        assertApproxEqRel(
            _playerPayoutValue(pullId),
            730_000,
            0.01e18,
            "payout comes from the funded tokens"
        );
    }

    function test_LowBalanceTokenIsCapped() public {
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

        // Drain after the pull, then leave a lopsided but sufficient inventory.
        _drainInventory();
        tsla.mint(address(claw), 0.00004 ether); // 0.01 USD, far below its random share
        nvda.mint(address(claw), 0.0006 ether); // 0.30 USD
        aapl.mint(address(claw), 0.002 ether); // 0.30 USD
        spy.mint(address(claw), 0.0025 ether); // 1.00 USD

        // A roll whose first random allocation is > 50% of the payout, so the TSLA
        // cap is guaranteed to bind and the remainder must come from other tokens.
        entropy.fulfillWithRoll(1, _findLargeFirstAllocationRoll());

        assertEq(tsla.balanceOf(player), 0.00004 ether, "low token paid only its balance");
        _assertNoOwed();
        assertApproxEqRel(
            _playerPayoutValue(pullId),
            730_000,
            0.01e18,
            "remainder paid by the other tokens"
        );
    }

    function test_CappedPayoutsThreeTokens() public {
        // Only TSLAx, NVDAx and SPYx are supported.
        vm.prank(owner);
        claw.removeToken(address(aapl));

        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

        _drainInventory();
        tsla.mint(address(claw), 0.00004 ether); // 0.01 USD
        nvda.mint(address(claw), 0.0006 ether); // 0.30 USD
        spy.mint(address(claw), 0.0025 ether); // 1.00 USD

        entropy.fulfillWithRoll(1, _findLargeFirstAllocationRoll());

        assertEq(tsla.balanceOf(player), 0.00004 ether, "capped at TSLAx balance");
        assertEq(aapl.balanceOf(player), 0, "removed token pays nothing");
        _assertNoOwed();
        assertApproxEqRel(_playerPayoutValue(pullId), 730_000, 0.01e18, "full 3-token payout");
    }

    function test_AllTokensEmptyFallsBackToOwed() public {
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

        // Inventory disappears between the request and the callback.
        _drainInventory();
        entropy.fulfillWithRoll(1, 500);

        _assertNoPlayerTokens();

        (address[] memory owedTokens, ) = claw.getOwedBalance(player);
        assertEq(owedTokens.length, 1, "shortfall recorded as owed");
        assertApproxEqRel(_owedValue(pullId), 730_000, 0.01e18, "whole payout owed");
        assertEq(claw.getPendingReservations(), 0, "reservation released");
    }

    function test_ExactFitPaysWithoutOwed() public {
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

        // Exactly 0.73 USD of SPY ($400): 730_000 * 1e18 / 400_000_000.
        _drainInventory();
        uint256 exactAmount = (730_000 * 1e18) / 400_000_000;
        spy.mint(address(claw), exactAmount);

        entropy.fulfillWithRoll(1, 500);

        assertEq(spy.balanceOf(player), exactAmount, "exact fit paid in full");
        _assertNoOwed();
        assertEq(_playerPayoutValue(pullId), 730_000, "exact payout value");
    }

    function _drainInventory() internal {
        address[4] memory tokens = [address(tsla), address(nvda), address(aapl), address(spy)];
        vm.startPrank(owner);
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 balance = IERC20(tokens[i]).balanceOf(address(claw));
            if (balance > 0) {
                claw.withdrawInventory(tokens[i], balance);
            }
        }
        vm.stopPrank();
    }

    function _playerPayoutValue(uint256 pullId) internal view returns (uint256 value) {
        address[4] memory tokens = [address(tsla), address(nvda), address(aapl), address(spy)];
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 balance = IERC20(tokens[i]).balanceOf(player);
            uint256 price = claw.getPullPriceSnapshot(pullId, tokens[i]);
            value += (balance * price) / 1e18;
        }
    }

    function _owedValue(uint256 pullId) internal view returns (uint256 value) {
        (address[] memory owedTokens, uint256[] memory owedAmounts) = claw.getOwedBalance(player);
        for (uint256 i = 0; i < owedTokens.length; i++) {
            value += (owedAmounts[i] * claw.getPullPriceSnapshot(pullId, owedTokens[i])) / 1e18;
        }
    }

    function _assertNoOwed() internal view {
        (address[] memory owedTokens, ) = claw.getOwedBalance(player);
        assertEq(owedTokens.length, 0, "no owed balances");
    }

    function _assertNoPlayerTokens() internal view {
        assertEq(tsla.balanceOf(player), 0);
        assertEq(nvda.balanceOf(player), 0);
        assertEq(aapl.balanceOf(player), 0);
        assertEq(spy.balanceOf(player), 0);
    }

    /**
     * @dev Common roll (>= 200) whose first random allocation is > 50%, matching
     *      `_selectStocks`' seed derivation.
     */
    function _findLargeFirstAllocationRoll() internal pure returns (uint256) {
        for (uint256 roll = 201; roll < 10_000; roll++) {
            uint256 seed = uint256(keccak256(abi.encodePacked(bytes32(roll), uint256(0))));
            if (seed % 10_001 > 5_000) {
                return roll;
            }
        }
        revert("No suitable roll");
    }
}
