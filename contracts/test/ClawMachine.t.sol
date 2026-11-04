// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ClawMachine} from "../src/ClawMachine.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockStock} from "../src/mocks/MockStock.sol";
import {MockEntropy} from "./MockEntropy.sol";

contract ClawMachineTest is Test {
    uint256 internal constant TSLA_PRICE = 250_000_000; // 250 USD
    uint256 internal constant AAPL_PRICE = 230_000_000; // 230 USD
    uint256 internal constant NVDA_PRICE = 180_000_000; // 180 USD
    uint256 internal constant SPY_PRICE = 650_000_000; // 650 USD
    uint256 internal constant INVENTORY_USD6 = 500_000_000; // 500 USD per stock

    MockUSDC internal usdc;
    MockEntropy internal entropy;
    MockStock internal tsla;
    MockStock internal aapl;
    MockStock internal nvda;
    MockStock internal spy;

    ClawMachine internal machine;

    address[] internal stockTokens;
    uint256[] internal stockPrices;

    address internal constant TREASURY = address(0xBEEF);
    address internal constant PLAYER = address(0xA11CE);
    address internal constant STRANGER = address(0xBAD);

    bytes32 internal constant COMMON_RANDOM = bytes32(uint256(1234));
    bytes32 internal constant LEGENDARY_RANDOM = bytes32(uint256(199));

    function setUp() public {
        usdc = new MockUSDC();
        entropy = new MockEntropy(1); // testnet-like fee: 1 wei

        tsla = new MockStock("Tesla xStock", "TSLAx");
        aapl = new MockStock("Apple xStock", "AAPLx");
        nvda = new MockStock("NVIDIA xStock", "NVDAx");
        spy = new MockStock("SP500 xStock", "SPYx");

        stockTokens.push(address(tsla));
        stockTokens.push(address(aapl));
        stockTokens.push(address(nvda));
        stockTokens.push(address(spy));
        stockPrices.push(TSLA_PRICE);
        stockPrices.push(AAPL_PRICE);
        stockPrices.push(NVDA_PRICE);
        stockPrices.push(SPY_PRICE);

        machine = new ClawMachine(
            address(usdc),
            address(entropy),
            stockTokens,
            TREASURY,
            address(this) // keeper
        );

        _mintInventory(tsla, TSLA_PRICE, INVENTORY_USD6);
        _mintInventory(aapl, AAPL_PRICE, INVENTORY_USD6);
        _mintInventory(nvda, NVDA_PRICE, INVENTORY_USD6);
        _mintInventory(spy, SPY_PRICE, INVENTORY_USD6);

        _seedPrices();

        usdc.mint(PLAYER, 1_000_000_000); // 1000 USDC
        vm.deal(PLAYER, 1_000 ether);
        vm.prank(PLAYER);
        usdc.approve(address(machine), type(uint256).max);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    function _mintInventory(MockStock stock, uint256 price, uint256 usd6) internal {
        stock.mint(address(machine), (usd6 * 1e18) / price);
    }

    function _seedPrices() internal {
        machine.setPrices(stockTokens, stockPrices);
    }

    function _priceOf(address token) internal view returns (uint256) {
        for (uint256 i = 0; i < stockTokens.length; ++i) {
            if (stockTokens[i] == token) return stockPrices[i];
        }
        return 0;
    }

    function _indexOf(address token) internal view returns (uint256) {
        for (uint256 i = 0; i < stockTokens.length; ++i) {
            if (stockTokens[i] == token) return i;
        }
        revert("unknown token");
    }

    function _startIndex(bytes32 random) internal view returns (uint256) {
        return uint256(keccak256(abi.encode(random, uint256(1)))) % stockTokens.length;
    }

    function _pull(address player, uint256 value) internal returns (uint256 pullId) {
        vm.prank(player);
        pullId = machine.pull{value: value}();
    }

    function _resolve(uint256 pullId, bytes32 random) internal {
        uint64 sequenceNumber = machine.getPull(pullId).sequenceNumber;
        entropy.fulfill(sequenceNumber, random);
    }

    function _pullAndResolve(bytes32 random) internal returns (uint256 pullId) {
        pullId = _pull(PLAYER, machine.getFee());
        _resolve(pullId, random);
    }

    /// @dev Sends all but `keepUsd6` worth of a stock out of the machine.
    function _drainStock(MockStock stock, uint256 price, uint256 keepUsd6) internal {
        uint256 keep = (keepUsd6 * 1e18) / price;
        uint256 balance = stock.balanceOf(address(machine));
        if (balance > keep) {
            machine.withdrawStock(address(stock), address(this), balance - keep);
        }
    }

    function _usdValue(address[] memory tokens, uint256[] memory amounts)
        internal
        view
        returns (uint256 total)
    {
        for (uint256 i = 0; i < tokens.length; ++i) {
            total += (amounts[i] * _priceOf(tokens[i])) / 1e18;
        }
    }

    // ---------------------------------------------------------------------
    // Payouts
    // ---------------------------------------------------------------------

    function testCommonPullPaysCommonValueInOneStock() public {
        uint256 fee = machine.getFee();
        vm.expectEmit(true, true, false, true, address(machine));
        emit ClawMachine.PullRequested(1, PLAYER, 1, fee);
        uint256 pullId = _pull(PLAYER, fee);

        _resolve(pullId, COMMON_RANDOM);

        ClawMachine.Pull memory p = machine.getPull(pullId);
        assertEq(uint256(p.status), uint256(ClawMachine.PullStatus.Resolved), "status");
        assertEq(p.player, PLAYER, "player");
        assertFalse(p.legendary, "legendary");
        assertEq(p.valueUsd6, 730_000, "value");
        assertGt(p.resolvedAt, 0, "resolvedAt");

        (address[] memory payoutStocks, uint256[] memory amounts) = machine.getPullPayout(pullId);
        assertEq(payoutStocks.length, 1, "one stock paid");
        assertEq(payoutStocks[0], stockTokens[_startIndex(COMMON_RANDOM)], "start stock");
        assertApproxEqAbs(_usdValue(payoutStocks, amounts), 730_000, 4, "usd value");
        assertEq(IERC20(payoutStocks[0]).balanceOf(PLAYER), amounts[0], "player balance");
    }

    function testLegendaryPullPaysLegendaryValue() public {
        uint256 pullId = _pullAndResolve(LEGENDARY_RANDOM);

        ClawMachine.Pull memory p = machine.getPull(pullId);
        assertTrue(p.legendary, "legendary");
        assertEq(p.valueUsd6, 10_000_000, "value");

        (address[] memory payoutStocks, uint256[] memory amounts) = machine.getPullPayout(pullId);
        assertEq(payoutStocks.length, 1, "one stock paid");
        assertApproxEqAbs(_usdValue(payoutStocks, amounts), 10_000_000, 4, "usd value");
        assertEq(IERC20(payoutStocks[0]).balanceOf(PLAYER), amounts[0], "player balance");
    }

    function testCommonBoundaryOfLegendaryBps() public {
        // 199 is legendary (< 200), 200 is common.
        uint256 legendaryPull = _pullAndResolve(bytes32(uint256(199)));
        assertTrue(machine.getPull(legendaryPull).legendary, "199 legendary");

        uint256 commonPull = _pullAndResolve(bytes32(uint256(200)));
        assertFalse(machine.getPull(commonPull).legendary, "200 common");
    }

    function testPayoutSplitsAcrossStocksWhenFirstIsLow() public {
        uint256 firstIndex = _startIndex(COMMON_RANDOM);
        MockStock first = MockStock(stockTokens[firstIndex]);
        uint256 firstPrice = stockPrices[firstIndex];

        _drainStock(first, firstPrice, 500_000); // leave 0.5 USD

        uint256 pullId = _pullAndResolve(COMMON_RANDOM);

        (address[] memory payoutStocks, uint256[] memory amounts) = machine.getPullPayout(pullId);
        assertEq(payoutStocks.length, 2, "split across two stocks");
        assertEq(payoutStocks[0], address(first), "first stock");
        assertEq(payoutStocks[1], stockTokens[(firstIndex + 1) % stockTokens.length], "next stock");
        assertApproxEqAbs((amounts[0] * firstPrice) / 1e18, 500_000, 2, "first slice");
        assertApproxEqAbs(_usdValue(payoutStocks, amounts), 730_000, 4, "total value");
    }

    function testInventoryShortfallIsPaidInUsdc() public {
        // Request a legendary first, then pull the inventory out from under it.
        uint256 pullId = _pull(PLAYER, machine.getFee());

        for (uint256 i = 0; i < stockTokens.length; ++i) {
            uint256 balance = IERC20(stockTokens[i]).balanceOf(address(machine));
            machine.withdrawStock(stockTokens[i], address(this), balance);
        }
        usdc.mint(address(machine), 100_000_000);

        uint256 playerBefore = usdc.balanceOf(PLAYER);
        _resolve(pullId, LEGENDARY_RANDOM);

        (address[] memory payoutStocks, uint256[] memory amounts) = machine.getPullPayout(pullId);
        assertEq(payoutStocks.length, 0, "no stock paid");
        assertEq(amounts.length, 0, "no amounts");
        assertEq(usdc.balanceOf(PLAYER) - playerBefore, 10_000_000, "usdc shortfall paid");
    }

    // ---------------------------------------------------------------------
    // Reservations and inventory gates
    // ---------------------------------------------------------------------

    function testReservationIsHeldThenReleased() public {
        assertEq(machine.reservedValueUsd6(), 0, "no reservations");

        uint256 pullId = _pull(PLAYER, machine.getFee());
        assertEq(machine.reservedValueUsd6(), 10_000_000, "legendary reserved");

        // Leave only 15 USD of inventory: 15 < reserved(10) + legendary(10).
        _drainAllBut(15_000_000);
        assertFalse(machine.canPull(), "cannot pull while under-reserved");

        _resolve(pullId, COMMON_RANDOM);

        assertEq(machine.reservedValueUsd6(), 0, "reservation released");
        assertTrue(machine.canPull(), "can pull again after release");
    }

    function testCanPullFalseWhenInventoryTooLow() public {
        _drainAllBut(5_000_000);
        assertFalse(machine.canPull(), "inventory below legendary value");

        _mintInventory(tsla, TSLA_PRICE, INVENTORY_USD6);
        _mintInventory(aapl, AAPL_PRICE, INVENTORY_USD6);
        _mintInventory(nvda, NVDA_PRICE, INVENTORY_USD6);
        _mintInventory(spy, SPY_PRICE, INVENTORY_USD6);
        assertTrue(machine.canPull(), "enough inventory");
    }

    function testCanPullFalseWhenPricesAreStale() public {
        assertTrue(machine.canPull(), "fresh prices");

        vm.warp(block.timestamp + machine.maxPriceAge() + 1);
        assertFalse(machine.canPull(), "stale prices");

        _seedPrices();
        assertTrue(machine.canPull(), "refreshed prices");
    }

    function testCanPullFalseWhenAnyStockIsUnpriced() public {
        address[] memory one = new address[](1);
        uint256[] memory zero = new uint256[](1);
        one[0] = address(spy);
        zero[0] = 0;
        machine.setPrices(one, zero);

        assertFalse(machine.canPull(), "unpriced stock blocks pulls");

        _seedPrices();
        assertTrue(machine.canPull(), "repriced");
    }

    function testPartialPriceUpdateDoesNotHideStaleStocks() public {
        vm.warp(1_000_000);
        _seedPrices();
        uint256 seededAt = 1_000_000;

        vm.warp(1_000_000 + machine.maxPriceAge() + 1);

        // Refresh three of the four stocks. The fourth still has inventory and a stale price.
        address[] memory subset = new address[](3);
        uint256[] memory prices = new uint256[](3);
        for (uint256 i = 0; i < 3; ++i) {
            subset[i] = stockTokens[i];
            prices[i] = stockPrices[i];
        }
        machine.setPrices(subset, prices);

        assertFalse(machine.canPull(), "stale un-updated stock blocks pulls");

        (, uint256 oldest) = machine.getPrices();
        assertEq(oldest, seededAt, "getPrices returns oldest timestamp");

        _seedPrices();
        assertTrue(machine.canPull(), "all stocks refreshed");
    }

    function testGetPricesReturnsOldestPerStockTimestamp() public {
        vm.warp(1_000_000);
        _seedPrices();
        uint256 seededAt = 1_000_000;

        vm.warp(1_000_100);

        address[] memory one = new address[](1);
        uint256[] memory prices = new uint256[](1);
        one[0] = address(tsla);
        prices[0] = TSLA_PRICE;
        machine.setPrices(one, prices);

        (, uint256 oldest) = machine.getPrices();
        assertEq(oldest, seededAt, "oldest price wins");

        assertEq(machine.priceUpdatedAt(address(tsla)), block.timestamp, "refreshed stock");
        assertEq(machine.priceUpdatedAt(address(spy)), seededAt, "untouched stock");
    }

    function testCallbackSkipsStockWithStalePrice() public {
        uint256 firstIndex = _startIndex(COMMON_RANDOM);
        MockStock staleStock = MockStock(stockTokens[firstIndex]);

        uint256 pullId = _pull(PLAYER, machine.getFee());
        uint64 sequenceNumber = machine.getPull(pullId).sequenceNumber;

        vm.warp(block.timestamp + machine.maxPriceAge() + 1);

        // Refresh every stock except the one the round-robin walk starts from.
        address[] memory subset = new address[](3);
        uint256[] memory prices = new uint256[](3);
        uint256 cursor = 0;
        for (uint256 i = 0; i < stockTokens.length; ++i) {
            if (i == firstIndex) continue;
            subset[cursor] = stockTokens[i];
            prices[cursor] = stockPrices[i];
            ++cursor;
        }
        machine.setPrices(subset, prices);

        entropy.fulfill(sequenceNumber, COMMON_RANDOM);

        (address[] memory payoutStocks, uint256[] memory amounts) = machine.getPullPayout(pullId);
        assertGt(payoutStocks.length, 0, "fresh stocks paid");
        for (uint256 i = 0; i < payoutStocks.length; ++i) {
            assertTrue(payoutStocks[i] != address(staleStock), "stale stock skipped");
        }
        assertApproxEqAbs(_usdValue(payoutStocks, amounts), 730_000, 8, "value covered");
    }

    function testPullRevertsWhenPaused() public {
        machine.pause();
        assertFalse(machine.canPull(), "paused");

        uint256 fee = machine.getFee();
        vm.prank(PLAYER);
        vm.expectRevert("paused");
        machine.pull{value: fee}();

        machine.unpause();
        _pullAndResolve(COMMON_RANDOM);
    }

    function testPullRevertsWithInsufficientFee() public {
        vm.prank(PLAYER);
        vm.expectRevert("insufficient fee");
        machine.pull{value: 0}();
    }

    function testPullRefundsExcessMon() public {
        entropy.setFee(0.01 ether);
        uint256 fee = machine.getFee();
        uint256 before = PLAYER.balance;

        uint256 pullId = _pull(PLAYER, fee + 0.5 ether);

        assertEq(PLAYER.balance, before - fee, "only fee spent");
        assertEq(address(machine).balance, 0, "machine holds no MON");
        assertEq(address(entropy).balance, fee, "entropy got fee");

        _resolve(pullId, COMMON_RANDOM);
        assertEq(uint256(machine.getPull(pullId).status), uint256(ClawMachine.PullStatus.Resolved));
    }

    // ---------------------------------------------------------------------
    // Owed payouts
    // ---------------------------------------------------------------------

    function testBlockedTransferIsOwedAndWithdrawable() public {
        uint256 firstIndex = _startIndex(COMMON_RANDOM);
        MockStock first = MockStock(stockTokens[firstIndex]);
        uint256 price = stockPrices[firstIndex];
        uint256 expectedAmount = (730_000 * 1e18 + price - 1) / price;

        first.setTransfersBlocked(true);

        uint256 pullId = _pull(PLAYER, machine.getFee());

        vm.expectEmit(true, true, true, true, address(machine));
        emit ClawMachine.PayoutOwed(pullId, PLAYER, address(first), expectedAmount);
        _resolve(pullId, COMMON_RANDOM);

        assertEq(first.balanceOf(PLAYER), 0, "nothing delivered");
        assertEq(machine.owed(PLAYER, address(first)), expectedAmount, "owed recorded");
        assertEq(machine.totalOwed(address(first)), expectedAmount, "owed accounted");

        (address[] memory payoutStocks, uint256[] memory amounts) = machine.getPullPayout(pullId);
        assertEq(payoutStocks.length, 1, "allocation still recorded");
        assertEq(amounts[0], expectedAmount, "allocated amount");

        first.setTransfersBlocked(false);

        vm.prank(PLAYER);
        machine.withdrawOwed();

        assertEq(first.balanceOf(PLAYER), expectedAmount, "delivered on retry");
        assertEq(machine.owed(PLAYER, address(first)), 0, "owed cleared");
        assertEq(machine.totalOwed(address(first)), 0, "owed accounting cleared");
    }

    function testWithdrawOwedKeepsBalanceWhenStillBlocked() public {
        uint256 firstIndex = _startIndex(COMMON_RANDOM);
        MockStock first = MockStock(stockTokens[firstIndex]);

        first.setTransfersBlocked(true);
        _pullAndResolve(COMMON_RANDOM);

        uint256 owedAmount = machine.owed(PLAYER, address(first));
        assertGt(owedAmount, 0, "owed");

        vm.prank(PLAYER);
        machine.withdrawOwed();
        assertEq(machine.owed(PLAYER, address(first)), owedAmount, "still owed");

        first.setTransfersBlocked(false);
        vm.prank(PLAYER);
        machine.withdrawOwed();
        assertEq(machine.owed(PLAYER, address(first)), 0, "cleared");
        assertEq(first.balanceOf(PLAYER), owedAmount, "paid");
    }

    function testUsdcShortfallCanBeOwedAndWithdrawn() public {
        uint256 pullId = _pull(PLAYER, machine.getFee());

        for (uint256 i = 0; i < stockTokens.length; ++i) {
            uint256 balance = IERC20(stockTokens[i]).balanceOf(address(machine));
            machine.withdrawStock(stockTokens[i], address(this), balance);
        }

        // No USDC in the machine: the whole legendary payout becomes owed.
        uint256 machineUsdc = usdc.balanceOf(address(machine));
        machine.withdrawUsdc(address(this), machineUsdc);

        _resolve(pullId, LEGENDARY_RANDOM);

        assertEq(machine.owed(PLAYER, address(usdc)), 10_000_000, "usdc owed");
        assertEq(machine.totalOwed(address(usdc)), 10_000_000, "usdc owed accounted");

        usdc.mint(address(machine), 10_000_000);

        // Owed USDC is not free balance, even though it sits in the contract.
        vm.expectRevert("exceeds free balance");
        machine.withdrawUsdc(address(this), 10_000_000);

        vm.prank(PLAYER);
        machine.withdrawOwed();
        assertEq(machine.owed(PLAYER, address(usdc)), 0, "cleared");
        assertEq(machine.totalOwed(address(usdc)), 0, "accounting cleared");
    }

    function testOwedTokensAreExcludedFromInventoryAndOwnerWithdrawals() public {
        uint256 firstIndex = _startIndex(COMMON_RANDOM);
        MockStock first = MockStock(stockTokens[firstIndex]);
        uint256 price = stockPrices[firstIndex];

        first.setTransfersBlocked(true);
        _pullAndResolve(COMMON_RANDOM);

        uint256 owedAmount = machine.owed(PLAYER, address(first));
        assertGt(owedAmount, 0, "owed");
        assertEq(machine.totalOwed(address(first)), owedAmount, "total owed");

        uint256 owedValue = (owedAmount * price) / 1e18;
        assertApproxEqAbs(
            machine.inventoryValueUsd6(),
            4 * INVENTORY_USD6 - owedValue,
            8,
            "owed inventory excluded"
        );

        uint256 balance = first.balanceOf(address(machine));
        uint256 free = balance - owedAmount;

        first.setTransfersBlocked(false);

        vm.expectRevert("exceeds free balance");
        machine.withdrawStock(address(first), address(this), balance);

        machine.withdrawStock(address(first), address(this), free);
        assertEq(first.balanceOf(address(machine)), owedAmount, "only owed tokens remain");

        vm.prank(PLAYER);
        machine.withdrawOwed();

        assertEq(first.balanceOf(address(machine)), 0, "owed delivered");
        assertEq(machine.totalOwed(address(first)), 0, "accounting cleared");
    }

    // ---------------------------------------------------------------------
    // Entropy callback
    // ---------------------------------------------------------------------

    function testOnlyEntropyCanCallCallback() public {
        vm.expectRevert("Only Entropy can call this function");
        machine._entropyCallback(1, address(0), COMMON_RANDOM);
    }

    function testUnknownSequenceIsIgnored() public {
        entropy.deliver(address(machine), 999, COMMON_RANDOM);
        assertEq(machine.totalPulls(), 0, "nothing resolved");
    }

    function testDuplicateCallbackIsIgnored() public {
        uint256 pullId = _pullAndResolve(COMMON_RANDOM);
        ClawMachine.Pull memory before = machine.getPull(pullId);

        uint64 sequence = before.sequenceNumber;
        entropy.fulfill(sequence, LEGENDARY_RANDOM);

        ClawMachine.Pull memory afterResolve = machine.getPull(pullId);
        assertEq(afterResolve.legendary, before.legendary, "unchanged");
        assertEq(afterResolve.resolvedAt, before.resolvedAt, "unchanged");
        assertEq(machine.totalPulls(), pullId, "no new pull");
    }

    // ---------------------------------------------------------------------
    // Access control
    // ---------------------------------------------------------------------

    function testOnlyKeeperCanSetPrices() public {
        vm.prank(STRANGER);
        vm.expectRevert("not keeper");
        machine.setPrices(stockTokens, stockPrices);

        machine.setKeeper(STRANGER);
        vm.prank(STRANGER);
        machine.setPrices(stockTokens, stockPrices);
    }

    function testSetPricesRejectsUnknownStockAndBadLengths() public {
        address[] memory bad = new address[](1);
        uint256[] memory values = new uint256[](1);
        bad[0] = STRANGER;
        values[0] = 1;
        vm.expectRevert("unknown stock");
        machine.setPrices(bad, values);

        address[] memory two = new address[](2);
        uint256[] memory one = new uint256[](1);
        two[0] = address(tsla);
        two[1] = address(aapl);
        one[0] = 1;
        vm.expectRevert("length mismatch");
        machine.setPrices(two, one);
    }

    function testOwnerOnlyFunctions() public {
        address[] memory one = new address[](1);
        uint256[] memory values = new uint256[](1);
        one[0] = address(tsla);
        values[0] = 1;

        vm.startPrank(STRANGER);

        bytes memory authError =
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, STRANGER);
        vm.expectRevert(authError);
        machine.setKeeper(STRANGER);

        vm.expectRevert(authError);
        machine.setTreasury(STRANGER);

        vm.expectRevert(authError);
        machine.setPullConfig(1, 1, 1, 1);

        vm.expectRevert(authError);
        machine.setCallbackGasLimit(1);

        vm.expectRevert(authError);
        machine.setMaxPriceAge(1);

        vm.expectRevert(authError);
        machine.pause();

        vm.expectRevert(authError);
        machine.withdrawUsdc(STRANGER, 1);

        vm.expectRevert(authError);
        machine.withdrawStock(address(tsla), STRANGER, 1);

        vm.expectRevert("not keeper");
        machine.setPrices(one, values);

        vm.stopPrank();
    }

    function testOwnerSettersApply() public {
        machine.setKeeper(STRANGER);
        assertEq(machine.keeper(), STRANGER);
        machine.setKeeper(address(this));

        machine.setTreasury(STRANGER);
        assertEq(machine.treasury(), STRANGER);
        machine.setTreasury(TREASURY);

        machine.setPullConfig(2_000_000, 1_500_000, 20_000_000, 500);
        assertEq(machine.pullPrice(), 2_000_000);
        assertEq(machine.commonValue(), 1_500_000);
        assertEq(machine.legendaryValue(), 20_000_000);
        assertEq(machine.legendaryBps(), 500);

        machine.setCallbackGasLimit(900_000);
        assertEq(machine.callbackGasLimit(), 900_000);

        machine.setMaxPriceAge(1 days);
        assertEq(machine.maxPriceAge(), 1 days);

        vm.expectRevert("invalid bps");
        machine.setPullConfig(1, 1, 1, 10_001);
    }

    function testLegendaryConfigSnapshotAppliesToPendingPull() public {
        uint256 pullId = _pull(PLAYER, machine.getFee());

        // New config would make the pull common and tiny if it were read at callback time.
        machine.setPullConfig(2_000_000, 1, 1, 0);

        _resolve(pullId, LEGENDARY_RANDOM);

        ClawMachine.Pull memory p = machine.getPull(pullId);
        assertTrue(p.legendary, "snapshot bps");
        assertEq(p.valueUsd6, 10_000_000, "snapshot legendary value");

        (address[] memory payoutStocks, uint256[] memory amounts) = machine.getPullPayout(pullId);
        assertApproxEqAbs(_usdValue(payoutStocks, amounts), 10_000_000, 4, "snapshot payout");
    }

    function testCommonConfigSnapshotAppliesToPendingPull() public {
        uint256 pullId = _pull(PLAYER, machine.getFee());

        // New config would make the pull legendary with a 1 USD payout if read at callback time.
        machine.setPullConfig(2_000_000, 1_000_000, 1_000_000, 10_000);

        _resolve(pullId, COMMON_RANDOM);

        ClawMachine.Pull memory p = machine.getPull(pullId);
        assertFalse(p.legendary, "snapshot bps");
        assertEq(p.valueUsd6, 730_000, "snapshot common value");

        (address[] memory payoutStocks, uint256[] memory amounts) = machine.getPullPayout(pullId);
        assertApproxEqAbs(_usdValue(payoutStocks, amounts), 730_000, 4, "snapshot payout");
    }

    function testOwnerCanWithdrawUsdcAndStock() public {
        usdc.mint(address(machine), 5_000_000);
        uint256 usdcBefore = usdc.balanceOf(TREASURY);
        machine.withdrawUsdc(TREASURY, 1_000_000);
        assertEq(usdc.balanceOf(TREASURY) - usdcBefore, 1_000_000);

        uint256 stockBefore = tsla.balanceOf(TREASURY);
        machine.withdrawStock(address(tsla), TREASURY, 1e18);
        assertEq(tsla.balanceOf(TREASURY) - stockBefore, 1e18);

        vm.expectRevert("unknown stock");
        machine.withdrawStock(STRANGER, TREASURY, 1);
    }

    // ---------------------------------------------------------------------
    // Views and ring buffer
    // ---------------------------------------------------------------------

    function testGetPricesMatchesGetStocksOrder() public view {
        (uint256[] memory prices, uint256 updatedAt) = machine.getPrices();
        address[] memory tokens = machine.getStocks();

        assertEq(tokens.length, 4);
        assertEq(updatedAt, block.timestamp);
        for (uint256 i = 0; i < tokens.length; ++i) {
            assertEq(prices[i], _priceOf(tokens[i]));
        }
    }

    function testRecentPullsNewestFirstCappedAt20() public {
        for (uint256 i = 0; i < 22; ++i) {
            _pullAndResolve(COMMON_RANDOM);
        }
        assertEq(machine.totalPulls(), 22);

        uint256[] memory all = machine.getRecentPulls(100);
        assertEq(all.length, 20, "capped at 20");
        for (uint256 i = 0; i < 20; ++i) {
            assertEq(all[i], 22 - i, "newest first");
        }

        uint256[] memory five = machine.getRecentPulls(5);
        assertEq(five.length, 5);
        assertEq(five[0], 22);
        assertEq(five[4], 18);

        uint256[] memory none = machine.getRecentPulls(0);
        assertEq(none.length, 0);
    }

    function testUnresolvedPullHasEmptyPayout() public {
        uint256 pullId = _pull(PLAYER, machine.getFee());
        (address[] memory stocks_, uint256[] memory amounts) = machine.getPullPayout(pullId);
        assertEq(stocks_.length, 0);
        assertEq(amounts.length, 0);

        ClawMachine.Pull memory p = machine.getPull(pullId);
        assertEq(uint256(p.status), uint256(ClawMachine.PullStatus.Pending));
        assertEq(p.valueUsd6, 0);
    }

    function testCallbackSkipsStockWithRevertingBalance() public {
        RevertingBalanceStock bad = new RevertingBalanceStock();

        address[] memory tokens = new address[](2);
        tokens[0] = address(bad);
        tokens[1] = address(tsla);

        ClawMachine secondMachine =
            new ClawMachine(address(usdc), address(entropy), tokens, TREASURY, address(this));

        uint256[] memory prices = new uint256[](2);
        prices[0] = 100_000_000;
        prices[1] = TSLA_PRICE;
        secondMachine.setPrices(tokens, prices);
        tsla.mint(address(secondMachine), (INVENTORY_USD6 * 1e18) / TSLA_PRICE);

        vm.prank(PLAYER);
        usdc.approve(address(secondMachine), type(uint256).max);

        // Find a random number whose round-robin walk starts at the bad stock.
        bytes32 random;
        for (uint256 i = 0;; ++i) {
            random = bytes32(i);
            if (uint256(keccak256(abi.encode(random, uint256(1)))) % 2 == 0) break;
        }

        uint256 fee = secondMachine.getFee();
        vm.prank(PLAYER);
        uint256 pullId = secondMachine.pull{value: fee}();

        // A reverting balanceOf must not brick the callback.
        entropy.fulfill(secondMachine.getPull(pullId).sequenceNumber, random);

        (address[] memory payoutStocks,) = secondMachine.getPullPayout(pullId);
        assertEq(payoutStocks.length, 1, "bad stock skipped");
        assertEq(payoutStocks[0], address(tsla), "paid from good stock");
        assertEq(
            uint256(secondMachine.getPull(pullId).status),
            uint256(ClawMachine.PullStatus.Resolved),
            "resolved"
        );
    }

    function testInventoryValue() public view {
        uint256 expected = 4 * INVENTORY_USD6;
        assertApproxEqAbs(machine.inventoryValueUsd6(), expected, 16, "inventory value");
    }

    // ---------------------------------------------------------------------
    // Gas
    // ---------------------------------------------------------------------

    function testCallbackGasStaysWellUnderLimit() public {
        uint256 pullId = _pull(PLAYER, machine.getFee());
        uint64 sequence = machine.getPull(pullId).sequenceNumber;

        uint256 gasBefore = gasleft();
        entropy.fulfill(sequence, COMMON_RANDOM);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("callback gas (1 stock)", gasUsed);
        assertLt(gasUsed, machine.callbackGasLimit(), "callback under gas limit");
        assertLt(gasUsed, 400_000, "well under limit");
    }

    function testWorstCaseCallbackGasWithFourStocks() public {
        // Give each stock exactly 3 USD so a legendary pull has to touch all four.
        for (uint256 i = 0; i < stockTokens.length; ++i) {
            _drainStock(MockStock(stockTokens[i]), stockPrices[i], 3_000_000);
        }

        uint256 pullId = _pull(PLAYER, machine.getFee());
        uint64 sequence = machine.getPull(pullId).sequenceNumber;

        uint256 gasBefore = gasleft();
        entropy.fulfill(sequence, LEGENDARY_RANDOM);
        uint256 gasUsed = gasBefore - gasleft();

        (address[] memory payoutStocks,) = machine.getPullPayout(pullId);
        assertEq(payoutStocks.length, 4, "touched all four stocks");

        emit log_named_uint("callback gas (4 stocks)", gasUsed);
        assertLt(gasUsed, machine.callbackGasLimit(), "callback under gas limit");
        assertLt(gasUsed, 600_000, "under limit with margin");
    }

    // ---------------------------------------------------------------------
    // Constructor validation
    // ---------------------------------------------------------------------

    function testConstructorRejectsDuplicateStocks() public {
        address[] memory dupes = new address[](2);
        dupes[0] = address(tsla);
        dupes[1] = address(tsla);

        vm.expectRevert("duplicate stock");
        new ClawMachine(address(usdc), address(entropy), dupes, TREASURY, address(this));
    }

    function testConstructorRejectsTooManyStocks() public {
        address[] memory tooMany = new address[](9);
        for (uint256 i = 0; i < 9; ++i) {
            tooMany[i] = address(uint160(1000 + i));
        }

        vm.expectRevert("invalid stock count");
        new ClawMachine(address(usdc), address(entropy), tooMany, TREASURY, address(this));
    }

    function testConstructorRejectsUsdcAsStock() public {
        address[] memory withUsdc = new address[](2);
        withUsdc[0] = address(tsla);
        withUsdc[1] = address(usdc);

        vm.expectRevert("stock is usdc");
        new ClawMachine(address(usdc), address(entropy), withUsdc, TREASURY, address(this));
    }

    // ---------------------------------------------------------------------
    // Internal helper
    // ---------------------------------------------------------------------

    function _drainAllBut(uint256 keepUsd6) internal {
        // Distribute the retained value over the stocks, proportional to price.
        for (uint256 i = 0; i < stockTokens.length; ++i) {
            _drainStock(MockStock(stockTokens[i]), stockPrices[i], keepUsd6 / stockTokens.length);
        }
    }
}

contract RevertingBalanceStock is MockStock {
    constructor() MockStock("Broken xStock", "BROKEN") {}

    function balanceOf(address) public view override returns (uint256) {
        revert("balanceOf reverted");
    }
}
