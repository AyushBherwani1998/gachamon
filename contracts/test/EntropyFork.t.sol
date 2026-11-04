// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";

import {ClawMachine} from "../src/ClawMachine.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockStock} from "../src/mocks/MockStock.sol";
import {IEntropyV2} from "../src/pyth/IEntropyV2.sol";

/// @notice Live integration check against the deployed Monad testnet Entropy V2 contract.
/// @dev    Gated because it needs network access. Run with:
///         FORK_TEST=true forge test --match-path test/EntropyFork.t.sol -vv
///
///         This validates the real `requestV2` path (fee lookup, request, sequence number).
///         The provider's reveal/callback happens in a later block and cannot be simulated
///         on a static fork, so the pull is expected to stay Pending here.
contract EntropyForkTest is Test {
    // Live Monad testnet Entropy V2 deployment (mainnet uses 0xD458...).
    address internal constant TESTNET_ENTROPY = 0x825c0390f379C631f3Cf11A82a37D20BddF93c07;

    address internal constant PLAYER = address(0xA11CE);

    function testForkPullRequestsLiveEntropy() public {
        if (!vm.envOr("FORK_TEST", false)) {
            vm.skip(true);
        }

        string memory rpc = vm.envOr("MONAD_TESTNET_RPC", string("https://testnet-rpc.monad.xyz"));
        vm.createSelectFork(rpc);

        address provider = IEntropyV2(TESTNET_ENTROPY).getDefaultProvider();
        assertTrue(provider != address(0), "default provider");
        assertGt(IEntropyV2(TESTNET_ENTROPY).getFeeV2(800_000), 0, "live fee");

        MockUSDC usdc = new MockUSDC();
        MockStock tsla = new MockStock("Tesla xStock", "TSLAx");
        MockStock aapl = new MockStock("Apple xStock", "AAPLx");
        MockStock nvda = new MockStock("NVIDIA xStock", "NVDAx");
        MockStock spy = new MockStock("SP500 xStock", "SPYx");

        address[] memory stocks = new address[](4);
        stocks[0] = address(tsla);
        stocks[1] = address(aapl);
        stocks[2] = address(nvda);
        stocks[3] = address(spy);

        ClawMachine machine =
            new ClawMachine(address(usdc), TESTNET_ENTROPY, stocks, address(this), address(this));

        uint256[] memory prices = new uint256[](4);
        prices[0] = 250_000_000;
        prices[1] = 230_000_000;
        prices[2] = 180_000_000;
        prices[3] = 650_000_000;
        machine.setPrices(stocks, prices);

        for (uint256 i = 0; i < stocks.length; ++i) {
            MockStock(stocks[i]).mint(address(machine), (500_000_000 * 1e18) / prices[i]);
        }

        usdc.mint(PLAYER, 100_000_000);
        vm.deal(PLAYER, 1 ether);
        vm.prank(PLAYER);
        usdc.approve(address(machine), type(uint256).max);

        assertTrue(machine.canPull(), "canPull");

        uint256 fee = machine.getFee();
        assertGt(fee, 0, "fee > 0");

        vm.prank(PLAYER);
        uint256 pullId = machine.pull{value: fee}();

        ClawMachine.Pull memory p = machine.getPull(pullId);
        assertEq(uint256(p.status), uint256(ClawMachine.PullStatus.Pending), "pending");
        assertGt(p.sequenceNumber, 0, "real entropy sequence number");
        assertEq(usdc.balanceOf(address(machine)), 1_000_000, "pull price taken");
        assertEq(machine.reservedValueUsd6(), 10_000_000, "reserved");

        emit log_named_uint("entropy sequence", p.sequenceNumber);
        emit log_named_uint("fee paid", fee);
    }
}
