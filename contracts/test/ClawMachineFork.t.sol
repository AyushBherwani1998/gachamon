// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {ClawMachine} from "../src/ClawMachine.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/**
 * @title ClawMachineForkTest
 * @notice Fork tests against Monad mainnet
 * @dev Run with: MONAD_RPC=https://rpc.monad.xyz forge test --match-contract ClawMachineForkTest
 *
 *      The full-pull tests additionally need a real Hermes update (see script/pyth-update.sh):
 *        source <(script/pyth-update.sh)
 *        MONAD_RPC=https://rpc.monad.xyz forge test --match-test test_Fork_FullPull -vv
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

    // A mainnet account holding MON, USDC and TSLAx. Used as inventory source and player.
    address constant ACTOR = 0xb2dC0a93841Ac49Ce0664e45D6575BA31AEA7C0e;

    // Pyth feed IDs
    bytes32 constant TSLA_FEED_ID = 0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1;
    bytes32 constant NVDA_FEED_ID = 0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593;
    bytes32 constant AAPL_FEED_ID = 0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688;
    bytes32 constant SPY_FEED_ID = 0x19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5;

    bytes32 constant PULL_REQUESTED_TOPIC =
        keccak256("PullRequested(uint256,address,uint64,uint256)");
    bytes32 constant PULL_RESOLVED_TOPIC =
        keccak256("PullResolved(uint256,address,bool,address[],uint256[])");

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

    /**
     * @notice Full common pull through the real Pyth price feed and real Entropy request.
     * @dev The provider reveal is simulated by calling _entropyCallback as the Entropy contract,
     *      which is the only way to exercise the payout path on a static fork.
     */
    function test_Fork_FullPull_RealPythAndEntropy() public {
        if (!vm.envExists("PYTH_UPDATE_HEX")) {
            vm.skip(true);
            return;
        }

        _warpToPublishTime();

        // The machine only supports TSLAx, matching mainnet entitlement.
        vm.prank(owner);
        claw.removeToken(AAPLx);
        vm.prank(owner);
        claw.removeToken(NVDAx);
        vm.prank(owner);
        claw.removeToken(SPYx);

        // The actor holds ~9 USD of TSLAx, below the 10 USD reserved by the default 10x
        // legendary. Use 5x for the fork test so the real inventory covers the reservation.
        vm.prank(owner);
        claw.setParameters(1_000_000, 7300, 200, 5);

        bytes[] memory updates = new bytes[](1);
        updates[0] = vm.parseBytes(vm.envString("PYTH_UPDATE_HEX"));

        // Move the actor's TSLAx into the machine as inventory.
        uint256 inventory = IERC20(TSLAx).balanceOf(ACTOR);
        assertGt(inventory, 0, "actor has TSLAx");
        vm.prank(ACTOR);
        IERC20(TSLAx).transfer(address(claw), inventory);
        console.log("Inventory TSLAx:", inventory);

        // Pull as the actor.
        vm.prank(ACTOR);
        IERC20(USDC).approve(address(claw), type(uint256).max);

        uint256 fee = claw.getTotalFee(updates);
        console.log("Total fee (MON):", fee);

        uint256 balanceBefore = IERC20(TSLAx).balanceOf(ACTOR);
        bytes32 userRandomNumber = keccak256("common-pull");

        vm.recordLogs();
        vm.prank(ACTOR);
        uint256 pullId = claw.pull{value: fee}(userRandomNumber, updates);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(pullId, 0, "first pull id");
        _assertPullRequested(logs, pullId);

        (, uint64 sequenceNumber, , ) = claw.getPullBasicData(pullId);
        assertGt(sequenceNumber, 0, "sequence number");

        // Simulate the Entropy provider callback with a common roll.
        bytes32 randomNumber = bytes32(uint256(1_234));
        vm.recordLogs();
        uint256 callbackGas = _runCallback(sequenceNumber, randomNumber);
        Vm.Log[] memory callbackLogs = vm.getRecordedLogs();
        console.log("Callback gas used:", callbackGas);

        // Resolution state
        (address player, , , bool resolved) = claw.getPullBasicData(pullId);
        assertEq(player, ACTOR, "player");
        assertTrue(resolved, "resolved");
        assertEq(claw.getPendingReservations(), 0, "reservation released");

        // Payout is 73% of the pull price, converted at the pull-time snapshot price.
        uint256 snapshotPrice = claw.getPullPriceSnapshot(pullId, TSLAx);
        uint256 expectedAmount = (claw.pullPrice() * claw.commonPayoutBps() / 10_000) * 1e18
            / snapshotPrice;
        uint256 received = IERC20(TSLAx).balanceOf(ACTOR) - balanceBefore;

        console.log("Snapshot price (USDC per 1e18):", snapshotPrice);
        console.log("Expected TSLAx:", expectedAmount);
        console.log("Received TSLAx:", received);
        assertApproxEqRel(received, expectedAmount, 0.01e18, "common payout within 1%");

        _assertPullResolved(callbackLogs, pullId, false);
    }

    /**
     * @notice Full legendary pull with 5x multiplier so the ~9 USD inventory covers it.
     */
    function test_Fork_LegendaryPull() public {
        if (!vm.envExists("PYTH_UPDATE_HEX")) {
            vm.skip(true);
            return;
        }

        _warpToPublishTime();

        vm.prank(owner);
        claw.removeToken(AAPLx);
        vm.prank(owner);
        claw.removeToken(NVDAx);
        vm.prank(owner);
        claw.removeToken(SPYx);

        // 5x keeps the legendary payout inside the actor's inventory.
        vm.prank(owner);
        claw.setParameters(1_000_000, 7300, 200, 5);

        bytes[] memory updates = new bytes[](1);
        updates[0] = vm.parseBytes(vm.envString("PYTH_UPDATE_HEX"));

        uint256 inventory = IERC20(TSLAx).balanceOf(ACTOR);
        assertGt(inventory, 0, "actor has TSLAx");
        vm.prank(ACTOR);
        IERC20(TSLAx).transfer(address(claw), inventory);

        vm.prank(ACTOR);
        IERC20(USDC).approve(address(claw), type(uint256).max);

        uint256 fee = claw.getTotalFee(updates);
        uint256 balanceBefore = IERC20(TSLAx).balanceOf(ACTOR);

        // uint256 % 10000 == 42, below the 200 bps legendary threshold.
        bytes32 randomNumber = bytes32(uint256(42));

        vm.prank(ACTOR);
        uint256 pullId = claw.pull{value: fee}(keccak256("legendary-pull"), updates);

        (, uint64 sequenceNumber, , ) = claw.getPullBasicData(pullId);
        vm.recordLogs();
        uint256 callbackGas = _runCallback(sequenceNumber, randomNumber);
        Vm.Log[] memory callbackLogs = vm.getRecordedLogs();
        console.log("Callback gas used:", callbackGas);

        uint256 snapshotPrice = claw.getPullPriceSnapshot(pullId, TSLAx);
        uint256 expectedAmount = (claw.pullPrice() * claw.legendaryMultiplier()) * 1e18
            / snapshotPrice;
        uint256 received = IERC20(TSLAx).balanceOf(ACTOR) - balanceBefore;

        console.log("Snapshot price (USDC per 1e18):", snapshotPrice);
        console.log("Expected TSLAx:", expectedAmount);
        console.log("Received TSLAx:", received);
        assertApproxEqRel(received, expectedAmount, 0.01e18, "legendary payout within 1%");
        assertEq(claw.getPendingReservations(), 0, "reservation released");

        _assertPullResolved(callbackLogs, pullId, true);
    }

    // ============ Helpers ============

    function _warpToPublishTime() internal {
        uint256 publishTime = vm.envOr("PYTH_PUBLISH_TIME", uint256(0));
        if (publishTime != 0) {
            vm.warp(publishTime + 5);
        }
    }

    function _runCallback(uint64 sequenceNumber, bytes32 randomNumber)
        internal
        returns (uint256 gasUsed)
    {
        uint256 gasBefore = gasleft();
        uint32 gasLimit = claw.callbackGasLimit();
        address provider = claw.entropyProvider();
        vm.prank(PYTH_ENTROPY);
        claw._entropyCallback{gas: gasLimit}(sequenceNumber, provider, randomNumber);
        gasUsed = gasBefore - gasleft();
    }

    function _assertPullRequested(Vm.Log[] memory logs, uint256 pullId) internal view {
        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(claw) && logs[i].topics[0] == PULL_REQUESTED_TOPIC) {
                assertEq(uint256(logs[i].topics[1]), pullId, "PullRequested pull id");
                found = true;
            }
        }
        assertTrue(found, "PullRequested emitted");
    }

    function _assertPullResolved(Vm.Log[] memory logs, uint256 pullId, bool legendary)
        internal
        view
    {
        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter != address(claw)) continue;
            if (logs[i].topics[0] != PULL_RESOLVED_TOPIC) continue;
            if (uint256(logs[i].topics[1]) != pullId) continue;

            assertEq(address(uint160(uint256(logs[i].topics[2]))), ACTOR, "PullResolved player");

            (bool resolvedLegendary, address[] memory stocks, uint256[] memory amounts) =
                abi.decode(logs[i].data, (bool, address[], uint256[]));

            assertEq(resolvedLegendary, legendary, "PullResolved legendary flag");
            assertEq(stocks.length, 1, "one stock");
            assertEq(stocks[0], TSLAx, "TSLAx paid");
            assertGt(amounts[0], 0, "payout amount");
            found = true;
        }
        assertTrue(found, "PullResolved emitted");
    }
}
