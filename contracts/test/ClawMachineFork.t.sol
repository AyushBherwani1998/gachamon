// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {ClawMachine} from "../src/ClawMachine.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IAggregatorV3} from "../src/interfaces/IAggregatorV3.sol";
import {IXStock} from "../src/interfaces/IXStock.sol";

/**
 * @title ClawMachineForkTest
 * @notice Fork tests against Monad mainnet using the real Chainlink feeds and Entropy.
 * @dev Run with:
 *        MONAD_RPC=https://rpc.monad.xyz forge test --match-contract ClawMachineForkTest -vv
 */
contract ClawMachineForkTest is Test {
    // Monad mainnet addresses
    address constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address constant PYTH_ENTROPY = 0xD458261E832415CFd3BAE5E416FdF3230ce6F134;

    address constant TSLAx = 0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0;
    address constant NVDAx = 0xc845b2894dBddd03858fd2D643B4eF725fE0849d;
    address constant SPYx = 0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48;

    // Chainlink w<token>-USD proxies
    address constant TSLA_FEED = 0xE42022cCe1913626AE4297B99291d3Ba24Cc9281;
    address constant NVDA_FEED = 0x03ffa4673c060339E6a8E5Ba1a12B3301c966bf0;
    address constant SPY_FEED = 0x2e2dA5717eDE960F8b77Af4cFcBDC4Ca3099006D;

    // A mainnet account holding MON, USDC and the three xStocks. Used as the player
    // and as the inventory source.
    address constant ACTOR = 0xb2dC0a93841Ac49Ce0664e45D6575BA31AEA7C0e;

    bytes32 constant PULL_RESOLVED_TOPIC =
        keccak256("PullResolved(uint256,address,bool,address[],uint256[])");

    ClawMachine public claw;
    address public owner = address(0x1);

    function setUp() public {
        string memory rpcUrl = vm.envOr("MONAD_RPC", string(""));
        if (bytes(rpcUrl).length == 0) {
            vm.skip(true);
            return;
        }

        vm.createSelectFork(rpcUrl);

        vm.prank(owner);
        claw = new ClawMachine(USDC, PYTH_ENTROPY, owner);

        vm.startPrank(owner);
        claw.addToken(TSLAx, TSLA_FEED);
        claw.addToken(NVDAx, NVDA_FEED);
        claw.addToken(SPYx, SPY_FEED);
        vm.stopPrank();
    }

    function test_Fork_ContractDeployment() public view {
        assertEq(address(claw.usdc()), USDC);
        assertEq(address(claw.entropy()), PYTH_ENTROPY);
        assertEq(claw.maxPriceAge(), 3900);
        assertEq(claw.callbackGasLimit(), 500_000);
    }

    function test_Fork_TokenMetadata() public view {
        assertEq(IERC20Metadata(USDC).decimals(), 6, "USDC decimals");
        assertEq(IERC20Metadata(TSLAx).decimals(), 18, "TSLAx decimals");
        assertEq(IERC20Metadata(NVDAx).decimals(), 18, "NVDAx decimals");
        assertEq(IERC20Metadata(SPYx).decimals(), 18, "SPYx decimals");

        assertEq(IAggregatorV3(TSLA_FEED).decimals(), 8, "TSLA feed decimals");
        assertEq(IAggregatorV3(NVDA_FEED).decimals(), 8, "NVDA feed decimals");
        assertEq(IAggregatorV3(SPY_FEED).decimals(), 8, "SPY feed decimals");

        console.log("TSLAx multiplier:", IXStock(TSLAx).multiplier());
        console.log("NVDAx multiplier:", IXStock(NVDAx).multiplier());
        console.log("SPYx multiplier:", IXStock(SPYx).multiplier());
    }

    function test_Fork_EntropyFee() public view {
        uint256 fee = claw.getEntropyFee();
        console.log("Entropy fee (MON):", fee);
        assertGt(fee, 0, "Fee should be > 0");
        assertEq(claw.getFee(), fee, "getFee matches Entropy fee");
    }

    function test_Fork_ContractAddresses() public view {
        (address tslaFeed, , bool supported) = claw.tokenInfo(TSLAx);
        assertTrue(supported, "TSLAx should be supported");
        assertEq(tslaFeed, TSLA_FEED, "TSLA feed should match");

        address[] memory tokens = claw.getSupportedTokens();
        assertEq(tokens.length, 3, "three tokens");
        assertEq(tokens[0], TSLAx);
        assertEq(tokens[1], NVDAx);
        assertEq(tokens[2], SPYx);
    }

    function test_Fork_GetTokenPrice() public view {
        (uint256 price, uint256 updatedAt) = claw.getTokenPrice(TSLAx);
        assertGt(price, 0, "price > 0");
        assertGt(updatedAt, 0, "updatedAt > 0");

        (, int256 answer, , uint256 feedUpdatedAt, ) =
            IAggregatorV3(TSLA_FEED).latestRoundData();
        uint256 expected = ((uint256(answer) * 1e6) / 1e8) * 1e18
            / IXStock(TSLAx).multiplier();

        console.log("TSLA price (USDC per TSLAx):", price);
        console.log("TSLA feed answer:", uint256(answer));
        assertEq(price, expected, "price conversion");
        assertEq(updatedAt, feedUpdatedAt, "updatedAt passthrough");
    }

    function test_Fork_FullPull_RealChainlinkAndEntropy() public {
        _fundInventory();

        vm.prank(ACTOR);
        IERC20(USDC).approve(address(claw), type(uint256).max);

        uint256 fee = claw.getFee();
        console.log("Total fee (MON):", fee);

        uint256[3] memory before = _playerBalances();
        vm.prank(ACTOR);
        uint256 pullId = claw.pull{value: fee}(keccak256("common-pull"));

        (, uint64 sequenceNumber, , ) = claw.getPullBasicData(pullId);

        // Simulate the Entropy provider reveal with a common roll.
        vm.recordLogs();
        uint256 callbackGas = _runCallback(sequenceNumber, bytes32(uint256(1_234)));
        Vm.Log[] memory callbackLogs = vm.getRecordedLogs();
        console.log("Callback gas used:", callbackGas);

        assertEq(pullId, 0, "first pull id");
        assertEq(claw.getPendingReservations(), 0, "reservation released");

        uint256 payoutValue = _payoutValue(pullId, before);
        _logReceived(before);
        console.log("Payout value (USDC 6dp):", payoutValue);
        assertApproxEqRel(payoutValue, 730_000, 0.01e18, "common payout within 1%");

        _assertPullResolved(callbackLogs, pullId, false);
    }

    function test_Fork_LegendaryPull() public {
        _fundInventory();

        vm.prank(ACTOR);
        IERC20(USDC).approve(address(claw), type(uint256).max);

        uint256 fee = claw.getFee();
        uint256[3] memory before = _playerBalances();

        // 42 < legendaryRarityBps (200) => legendary at the default 10x.
        vm.prank(ACTOR);
        uint256 pullId = claw.pull{value: fee}(bytes32(uint256(42)));

        (, uint64 sequenceNumber, , ) = claw.getPullBasicData(pullId);

        vm.recordLogs();
        uint256 callbackGas = _runCallback(sequenceNumber, bytes32(uint256(42)));
        Vm.Log[] memory callbackLogs = vm.getRecordedLogs();
        console.log("Callback gas used:", callbackGas);

        assertEq(claw.getPendingReservations(), 0, "reservation released");
        uint256 payoutValue = _payoutValue(pullId, before);
        _logReceived(before);
        console.log("Payout value (USDC 6dp):", payoutValue);
        assertApproxEqRel(payoutValue, 10_000_000, 0.01e18, "legendary 10x payout within 1%");

        _assertPullResolved(callbackLogs, pullId, true);
    }

    // ============ Helpers ============

    function _fundInventory() internal {
        vm.startPrank(ACTOR);
        IERC20(TSLAx).transfer(address(claw), IERC20(TSLAx).balanceOf(ACTOR));
        IERC20(NVDAx).transfer(address(claw), IERC20(NVDAx).balanceOf(ACTOR));
        IERC20(SPYx).transfer(address(claw), IERC20(SPYx).balanceOf(ACTOR));
        vm.stopPrank();
    }

    function _playerBalances() internal view returns (uint256[3] memory balances) {
        balances[0] = IERC20(TSLAx).balanceOf(ACTOR);
        balances[1] = IERC20(NVDAx).balanceOf(ACTOR);
        balances[2] = IERC20(SPYx).balanceOf(ACTOR);
    }

    function _payoutValue(uint256 pullId, uint256[3] memory before)
        internal
        view
        returns (uint256 value)
    {
        address[3] memory tokens = [TSLAx, NVDAx, SPYx];
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 balance = IERC20(tokens[i]).balanceOf(ACTOR);
            uint256 received = balance > before[i] ? balance - before[i] : 0;
            uint256 price = claw.getPullPriceSnapshot(pullId, tokens[i]);
            value += (received * price) / 1e18;
        }
    }

    function _logReceived(uint256[3] memory before) internal view {
        console.log("TSLAx received:", IERC20(TSLAx).balanceOf(ACTOR) - before[0]);
        console.log("NVDAx received:", IERC20(NVDAx).balanceOf(ACTOR) - before[1]);
        console.log("SPYx received:", IERC20(SPYx).balanceOf(ACTOR) - before[2]);
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

            (bool resolvedLegendary, , ) =
                abi.decode(logs[i].data, (bool, address[], uint256[]));

            assertEq(resolvedLegendary, legendary, "PullResolved legendary flag");
            found = true;
        }
        assertTrue(found, "PullResolved emitted");
    }
}
