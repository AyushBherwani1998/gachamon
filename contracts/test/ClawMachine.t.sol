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
        // Remove other tokens so failing token is guaranteed to be selected
        vm.startPrank(owner);
        claw.removeToken(address(tsla));
        claw.removeToken(address(nvda));
        claw.removeToken(address(aapl));
        claw.removeToken(address(spy));
        vm.stopPrank();

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

        // Should have owed balance for failToken
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
        
        // Should have received owed tokens
        assertTrue(balanceAfter > balanceBefore, "Balance should increase");
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

        // With multi-token selection, a common pull picks 2-3 tokens randomly
        // Verify at least 2 tokens were paid out
        uint256 tokensUsed = 0;
        if (tsla.balanceOf(player) > 0) tokensUsed++;
        if (nvda.balanceOf(player) > 0) tokensUsed++;
        if (spy.balanceOf(player) > 0) tokensUsed++;
        
        assertGe(tokensUsed, 2, "At least 2 tokens should be paid");
        assertEq(aapl.balanceOf(player), 0, "removed token pays nothing");
        _assertNoOwed();
        assertApproxEqRel(_playerPayoutValue(pullId), 730_000, 0.02e18, "full 3-token payout");
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

    // ============ Multi-token stock pull tests ============

    function test_CommonPullYieldsMultipleTokens() public {
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

        entropy.fulfillWithRoll(1, 500);

        // Count distinct tokens received
        uint256 distinctTokens = 0;
        if (tsla.balanceOf(player) > 0) distinctTokens++;
        if (nvda.balanceOf(player) > 0) distinctTokens++;
        if (aapl.balanceOf(player) > 0) distinctTokens++;
        if (spy.balanceOf(player) > 0) distinctTokens++;

        assertGe(distinctTokens, 2, "Common pull should yield at least 2 distinct tokens");
        
        // Verify total payout value
        _assertNoOwed();
        assertApproxEqRel(_playerPayoutValue(pullId), 730_000, 0.02e18, "Common payout value");
    }

    function test_LegendaryPullUsesAllTokens() public {
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

        // Legendary roll (< 200)
        entropy.fulfillWithRoll(1, 50);

        // Count tokens received - should be all 4 tokens with inventory
        uint256 distinctTokens = 0;
        if (tsla.balanceOf(player) > 0) distinctTokens++;
        if (nvda.balanceOf(player) > 0) distinctTokens++;
        if (aapl.balanceOf(player) > 0) distinctTokens++;
        if (spy.balanceOf(player) > 0) distinctTokens++;

        assertEq(distinctTokens, 4, "Legendary pull should use all tokens with balance");
        
        // Verify total payout value (10 USDC for legendary)
        _assertNoOwed();
        assertApproxEqRel(_playerPayoutValue(pullId), 10_000000, 0.02e18, "Legendary payout value");
    }

    function test_DistributionVariesAcrossDifferentSeeds() public {
        // First pull
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        uint256 pullId1 = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(11111)));

        entropy.fulfillWithRoll(1, 500);

        uint256 tsla1 = tsla.balanceOf(player);
        uint256 nvda1 = nvda.balanceOf(player);
        uint256 aapl1 = aapl.balanceOf(player);
        uint256 spy1 = spy.balanceOf(player);

        // Refill inventory for second pull
        vm.startPrank(owner);
        tsla.mint(address(claw), 0.02 ether);
        nvda.mint(address(claw), 0.01 ether);
        aapl.mint(address(claw), 0.033 ether);
        spy.mint(address(claw), 0.0125 ether);
        vm.stopPrank();

        // Second pull with different seed
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        claw.pull{value: ENTROPY_FEE}(bytes32(uint256(99999)));

        entropy.fulfillWithRoll(2, 1500);

        uint256 tsla2 = tsla.balanceOf(player) - tsla1;
        uint256 nvda2 = nvda.balanceOf(player) - nvda1;
        uint256 aapl2 = aapl.balanceOf(player) - aapl1;
        uint256 spy2 = spy.balanceOf(player) - spy1;

        // At least one token distribution should differ significantly
        bool distributionDiffers = 
            _percentDiff(tsla1, tsla2) > 10 ||
            _percentDiff(nvda1, nvda2) > 10 ||
            _percentDiff(aapl1, aapl2) > 10 ||
            _percentDiff(spy1, spy2) > 10;

        assertTrue(distributionDiffers, "Distribution should vary with different random seeds");
    }

    function test_SingleTokenInventoryFallback() public {
        // Only SPY has inventory
        vm.startPrank(owner);
        claw.withdrawInventory(address(tsla), tsla.balanceOf(address(claw)));
        claw.withdrawInventory(address(nvda), nvda.balanceOf(address(claw)));
        claw.withdrawInventory(address(aapl), aapl.balanceOf(address(claw)));
        vm.stopPrank();

        // Mint enough SPY to handle a pull
        spy.mint(address(claw), 0.05 ether); // ~$20 worth

        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

        entropy.fulfillWithRoll(1, 500);

        // Should have paid only in SPY
        assertGt(spy.balanceOf(player), 0, "Should receive SPY");
        assertEq(tsla.balanceOf(player), 0, "No TSLA");
        assertEq(nvda.balanceOf(player), 0, "No NVDA");
        assertEq(aapl.balanceOf(player), 0, "No AAPL");
        
        _assertNoOwed();
        assertApproxEqRel(_playerPayoutValue(pullId), 730_000, 0.02e18, "Full payout in single token");
    }

    function test_MultiTokenPayoutTotalValueCorrect() public {
        // Test multiple pulls to ensure total value consistency
        uint256[4] memory prevBalances;
        
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(player);
            usdc.approve(address(claw), PULL_PRICE);

            vm.prank(player);
            uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(1000 + i)));

            entropy.fulfillWithRoll(uint64(i + 1), 300 + i * 100);

            // Calculate incremental value from this pull only
            uint256 incrementalValue = 0;
            address[4] memory tokens = [address(tsla), address(nvda), address(aapl), address(spy)];
            for (uint256 j = 0; j < 4; j++) {
                uint256 newBalance = IERC20(tokens[j]).balanceOf(player);
                uint256 deltaBalance = newBalance - prevBalances[j];
                prevBalances[j] = newBalance;
                
                uint256 price = claw.getPullPriceSnapshot(pullId, tokens[j]);
                incrementalValue += (deltaBalance * price) / 1e18;
            }
            
            assertApproxEqRel(incrementalValue, 730_000, 0.02e18, "Common payout value correct");

            // Refill inventory
            vm.startPrank(owner);
            tsla.mint(address(claw), 0.02 ether);
            nvda.mint(address(claw), 0.01 ether);
            aapl.mint(address(claw), 0.033 ether);
            spy.mint(address(claw), 0.0125 ether);
            vm.stopPrank();
        }
    }

    function test_LegendaryMultiTokenPayout() public {
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(77777)));

        // Legendary roll
        entropy.fulfillWithRoll(1, 100);

        // All tokens should have been used
        uint256 tokensUsed = 0;
        if (tsla.balanceOf(player) > 0) tokensUsed++;
        if (nvda.balanceOf(player) > 0) tokensUsed++;
        if (aapl.balanceOf(player) > 0) tokensUsed++;
        if (spy.balanceOf(player) > 0) tokensUsed++;

        assertEq(tokensUsed, 4, "Legendary should distribute across all available tokens");
        _assertNoOwed();
        assertApproxEqRel(_playerPayoutValue(pullId), 10_000000, 0.02e18, "Legendary payout value");
    }

    function test_MultiTokenWithInventoryCaps() public {
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(55555)));

        // Set up lopsided inventory after pull request but before callback
        _drainInventory();
        tsla.mint(address(claw), 0.0004 ether); // $0.10
        nvda.mint(address(claw), 0.0004 ether); // $0.20
        aapl.mint(address(claw), 0.003 ether);  // $0.45
        spy.mint(address(claw), 0.0025 ether);  // $1.00

        entropy.fulfillWithRoll(1, 600);

        _assertNoOwed();
        assertApproxEqRel(_playerPayoutValue(pullId), 730_000, 0.02e18, "Payout respects caps and redistributes");
    }

    function _percentDiff(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0 && b == 0) return 0;
        if (a == 0 || b == 0) return 100;
        uint256 diff = a > b ? a - b : b - a;
        return (diff * 100) / (a > b ? a : b);
    }

    function _totalPlayerTokenBalance() internal view returns (uint256) {
        return tsla.balanceOf(player) + nvda.balanceOf(player) + 
               aapl.balanceOf(player) + spy.balanceOf(player);
    }

    // ============ Gas measurement tests ============

    function test_GasMeasurement_CommonPull() public {
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

        uint256 gasBefore = gasleft();
        entropy.fulfillWithRoll(1, 500); // Common pull
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("Common pull callback gas", gasUsed);
        
        // Verify it fits within reasonable limits (Monad cold access is 10,100)
        assertLt(gasUsed, 500_000, "Common callback should fit in 500k gas");
    }

    function test_GasMeasurement_LegendaryPull() public {
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

        uint256 gasBefore = gasleft();
        entropy.fulfillWithRoll(1, 50); // Legendary pull
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("Legendary pull callback gas", gasUsed);
        
        // Verify it fits within reasonable limits
        assertLt(gasUsed, 500_000, "Legendary callback should fit in 500k gas");
    }
}

/// @dev Regression coverage for remainder redistribution across unselected tokens.
contract ClawMachineRedistributionTest is Test {
    ClawMachine public claw;
    MockERC20 public usdc;
    MockEntropy public entropy;
    MockERC20 public tsla;
    MockERC20 public nvda;
    MockERC20 public spy;
    MockERC20 public qqq;
    MockERC20 public spcx;
    MockPriceFeed public tslaFeed;
    MockPriceFeed public nvdaFeed;
    MockPriceFeed public spyFeed;
    MockPriceFeed public qqqFeed;
    MockPriceFeed public spcxFeed;

    address public owner = address(0x1);
    address public player = address(0x3);

    uint256 constant PULL_PRICE = 1_000000;
    uint256 constant ENTROPY_FEE = 0.001 ether;

    function setUp() public {
        usdc = new MockERC20("USDC", "USDC", 6);
        entropy = new MockEntropy();
        tsla = new MockERC20("TSLAx", "TSLAx", 18);
        nvda = new MockERC20("NVDAx", "NVDAx", 18);
        spy = new MockERC20("SPYx", "SPYx", 18);
        qqq = new MockERC20("QQQx", "QQQx", 18);
        spcx = new MockERC20("SPCXx", "SPCXx", 18);

        tslaFeed = new MockPriceFeed(250e8, 8);
        nvdaFeed = new MockPriceFeed(500e8, 8);
        spyFeed = new MockPriceFeed(400e8, 8);
        qqqFeed = new MockPriceFeed(300e8, 8);
        spcxFeed = new MockPriceFeed(100e8, 8);

        vm.prank(owner);
        claw = new ClawMachine(address(usdc), address(entropy), owner);

        vm.startPrank(owner);
        claw.addToken(address(tsla), address(tslaFeed));
        claw.addToken(address(nvda), address(nvdaFeed));
        claw.addToken(address(spy), address(spyFeed));
        claw.addToken(address(qqq), address(qqqFeed));
        claw.addToken(address(spcx), address(spcxFeed));
        vm.stopPrank();

        // Enough inventory to pass the pre-pull check.
        tsla.mint(address(claw), 0.02 ether);
        nvda.mint(address(claw), 0.01 ether);
        spy.mint(address(claw), 0.0125 ether);

        usdc.mint(player, 100_000000);
        vm.deal(player, 10 ether);
    }

    /// @notice The selected tokens are capped, so the payout must come from an
    ///         unselected token instead of becoming an IOU on an empty one.
    function test_RemainderUsesUnselectedTokenWithCapacity() public {
        vm.prank(player);
        usdc.approve(address(claw), PULL_PRICE);

        vm.prank(player);
        uint256 pullId = claw.pull{value: ENTROPY_FEE}(bytes32(uint256(12345)));

        // Lopsided inventory after the request: TSLA $0.05, NVDA $8, SPY $0.04,
        // QQQ $0 and SPCX $0. The selected TSLA + SPY cannot cover $0.73.
        _drainInventory();
        tsla.mint(address(claw), 0.0002 ether); // $0.05
        nvda.mint(address(claw), 0.016 ether); // $8.00
        spy.mint(address(claw), 0.0001 ether); // $0.04

        // Force the selection to include TSLA and SPY but not NVDA.
        entropy.fulfillRequest(1, bytes32(_findTslaSpySelectionSeed()));

        (address[] memory owedTokens, ) = claw.getOwedBalance(player);
        assertEq(owedTokens.length, 0, "full inventory must not create an IOU");

        assertEq(tsla.balanceOf(player), 0.0002 ether, "TSLA paid up to capacity");
        assertEq(spy.balanceOf(player), 0.0001 ether, "SPY paid up to capacity");
        assertEq(nvda.balanceOf(player), 0.00128 ether, "NVDA covered the remainder");
        assertEq(qqq.balanceOf(player), 0, "empty QQQx pays nothing");
        assertEq(spcx.balanceOf(player), 0, "empty SPCXx pays nothing");

        uint256 payoutValue = tsla.balanceOf(player) * claw.getPullPriceSnapshot(pullId, address(tsla)) / 1e18
            + nvda.balanceOf(player) * claw.getPullPriceSnapshot(pullId, address(nvda)) / 1e18
            + spy.balanceOf(player) * claw.getPullPriceSnapshot(pullId, address(spy)) / 1e18;
        assertEq(payoutValue, 730_000, "player receives the full payout value");
    }

    function _drainInventory() internal {
        address[5] memory tokens = [address(tsla), address(nvda), address(spy), address(qqq), address(spcx)];
        vm.startPrank(owner);
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 balance = IERC20(tokens[i]).balanceOf(address(claw));
            if (balance > 0) {
                claw.withdrawInventory(tokens[i], balance);
            }
        }
        vm.stopPrank();
    }

    /// @dev Mirrors `_selectTokensForPull` for the three funded tokens and returns
    ///      a random number whose common selection is exactly TSLA + SPY.
    function _findTslaSpySelectionSeed() internal pure returns (uint256) {
        for (uint256 r = 200; r < 10_000; r++) {
            bytes32 randomNumber = bytes32(r);
            uint256 targetCount = 2 + (uint256(keccak256(abi.encode(randomNumber, "count"))) % 2);
            if (targetCount != 2) continue;

            uint256[3] memory availableIndices = [uint256(0), 1, 2];
            bool[3] memory picked;
            for (uint256 i = 0; i < targetCount; i++) {
                bytes32 pickSeed = keccak256(abi.encode(randomNumber, "pick", i));
                uint256 pickIdx = uint256(pickSeed) % (3 - i);
                picked[availableIndices[pickIdx]] = true;
                availableIndices[pickIdx] = availableIndices[3 - i - 1];
            }

            if (picked[0] && !picked[1] && picked[2]) return r;
        }
        revert("No suitable random number");
    }
}
