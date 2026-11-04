// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {ClawMachine} from "../src/ClawMachine.sol";
import {IEntropyV2} from "../src/pyth/IEntropyV2.sol";

/// @dev Plain contract recipient used to check that xStocks can be sent to contracts.
contract StockReceiver {}

/// @notice Zero-funds mainnet fork proof that real xStocks flow through the payout path.
/// @dev    Run with: FORK=1 forge test --match-path test/XStocksFork.t.sol -vv
///         or: make test-xstocks-fork
///         The test only uses deal()/vm.deal(), so no real funds are needed.
///         If deal() cannot find proxy storage, it falls back to transferring from a real
///         holder located through recent Transfer logs.
contract XStocksForkTest is Test {
    address internal constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address internal constant ENTROPY = 0xD458261E832415CFd3BAE5E416FdF3230ce6F134;

    address internal constant TSLAX = 0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0;
    address internal constant NVDAX = 0xc845b2894dBddd03858fd2D643B4eF725fE0849d;
    address internal constant SPYX = 0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48;

    address internal constant PLAYER = address(0xA11CE);

    /// @dev Real xStocks issuer/vault (contract creator) with a large on-chain balance.
    ///      deal() cannot write these rebasing-token balances, so the test transfers from here.
    address internal constant STOCK_HOLDER = 0x5F7A4c11bde4f218f0025Ef444c369d838ffa2aD;
    bytes32 internal constant COMMON_RANDOM = bytes32(uint256(1234));

    function testRealXStocksPayout() public {
        if (!vm.envExists("FORK")) {
            vm.skip(true);
        }

        string memory rpc = vm.envOr("MONAD_RPC", string("https://rpc.monad.xyz"));
        vm.createSelectFork(rpc);

        address[] memory stocks = new address[](3);
        stocks[0] = TSLAX;
        stocks[1] = NVDAX;
        stocks[2] = SPYX;

        uint256[] memory prices = new uint256[](3);
        prices[0] = 250_000_000; // TSLAx 250 USD
        prices[1] = 180_000_000; // NVDAx 180 USD
        prices[2] = 650_000_000; // SPYx 650 USD

        for (uint256 i = 0; i < stocks.length; ++i) {
            assertEq(IERC20Metadata(stocks[i]).decimals(), 18, "xStock decimals");
        }

        ClawMachine machine = new ClawMachine(USDC, ENTROPY, stocks, address(this), address(this));
        machine.setPrices(stocks, prices);

        // Fund the machine with real token balances, without buying anything.
        // deal() cannot write these rebasing xStock balances (stdStorage checked_write fails),
        // so move real tokens from the issuer/vault holder instead.
        for (uint256 i = 0; i < stocks.length; ++i) {
            uint256 amount = (500_000_000 * 1e18) / prices[i];
            _fund(address(machine), stocks[i], amount);
            assertApproxEqAbs(IERC20(stocks[i]).balanceOf(address(machine)), amount, 2, "inventory");
        }

        // Fund the player with real USDC and enough MON for the real entropy fee.
        deal(USDC, PLAYER, 100_000_000, true);
        uint256 fee = machine.getFee();
        vm.deal(PLAYER, fee + 1 ether);

        vm.prank(PLAYER);
        IERC20(USDC).approve(address(machine), 1_000_000);

        assertTrue(machine.canPull(), "canPull");

        vm.prank(PLAYER);
        uint256 pullId = machine.pull{value: fee}();

        uint64 sequenceNumber = machine.getPull(pullId).sequenceNumber;
        address provider = IEntropyV2(ENTROPY).getDefaultProvider();

        // Simulate the real Entropy callback.
        vm.prank(ENTROPY);
        machine._entropyCallback(sequenceNumber, provider, COMMON_RANDOM);

        ClawMachine.Pull memory p = machine.getPull(pullId);
        assertEq(uint256(p.status), uint256(ClawMachine.PullStatus.Resolved), "resolved");
        assertEq(p.valueUsd6, 730_000, "common value");

        (address[] memory paidStocks, uint256[] memory amounts) = machine.getPullPayout(pullId);
        assertEq(paidStocks.length, 1, "one stock");
        assertGt(amounts[0], 0, "amount");

        assertEq(machine.owed(PLAYER, paidStocks[0]), 0, "not owed");
        assertApproxEqAbs(
            IERC20(paidStocks[0]).balanceOf(PLAYER), amounts[0], 2, "player received real xStock"
        );

        // A real xStock transfer to a contract recipient must also work.
        StockReceiver receiver = new StockReceiver();
        uint256 half = amounts[0] / 2;
        vm.prank(PLAYER);
        IERC20(paidStocks[0]).transfer(address(receiver), half);
        assertApproxEqAbs(
            IERC20(paidStocks[0]).balanceOf(address(receiver)), half, 2, "contract recipient"
        );

        emit log_named_address("paid stock", paidStocks[0]);
        emit log_named_uint("paid amount", amounts[0]);
        emit log_named_uint("entropy sequence", sequenceNumber);
        emit log_named_uint("entropy fee", fee);
    }

    /// @dev Try deal() first; these xStocks are rebasing/share tokens, so it usually fails.
    function _fund(address to, address token, uint256 amount) internal {
        try this.fundWithDeal(token, to, amount) {
            return;
        } catch {}

        // Real-holder fallback: the issuer/vault holds the supply.
        assertGe(IERC20(token).balanceOf(STOCK_HOLDER), amount, "issuer has enough inventory");
        vm.prank(STOCK_HOLDER);
        IERC20(token).transfer(to, amount);
    }

    function fundWithDeal(address token, address to, uint256 amount) external {
        deal(token, to, amount, true);
    }
}
