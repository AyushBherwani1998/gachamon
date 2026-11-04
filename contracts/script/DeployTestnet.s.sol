// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";

import {ClawMachine} from "../src/ClawMachine.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {MockStock} from "../src/mocks/MockStock.sol";

/// @notice Deploys the full testnet stack: MockUSDC, four MockStocks, ClawMachine.
/// @dev    Run with: forge script script/DeployTestnet.s.sol --rpc-url monad_testnet --account deployer --broadcast
contract DeployTestnet is Script {
    /// @dev Pyth Entropy V2 on Monad testnet. Note: this is a different deployment from
    ///      mainnet (0xD458...), verified live on 2026-11-04. The default provider on
    ///      testnet is 0x6CC14824Ea2918f5De5C2f75A9Da968ad4BD6344.
    address internal constant ENTROPY = 0x825c0390f379C631f3Cf11A82a37D20BddF93c07;

    uint256 internal constant TSLA_PRICE = 250_000_000; // 250 USD
    uint256 internal constant AAPL_PRICE = 230_000_000; // 230 USD
    uint256 internal constant NVDA_PRICE = 180_000_000; // 180 USD
    uint256 internal constant SPY_PRICE = 650_000_000; // 650 USD

    /// @dev Roughly 500 USD of each stock is minted into the machine.
    uint256 internal constant SEED_VALUE_USD6 = 500_000_000;

    function run() external returns (ClawMachine machine) {
        address deployer = msg.sender;

        vm.startBroadcast();

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

        uint256[] memory prices = new uint256[](4);
        prices[0] = TSLA_PRICE;
        prices[1] = AAPL_PRICE;
        prices[2] = NVDA_PRICE;
        prices[3] = SPY_PRICE;

        machine = new ClawMachine(address(usdc), ENTROPY, stocks, deployer, deployer);

        // Keeper is the deployer on testnet.
        machine.setPrices(stocks, prices);
        machine.setMaxPriceAge(7 days);

        tsla.mint(address(machine), (SEED_VALUE_USD6 * 1e18) / TSLA_PRICE);
        aapl.mint(address(machine), (SEED_VALUE_USD6 * 1e18) / AAPL_PRICE);
        nvda.mint(address(machine), (SEED_VALUE_USD6 * 1e18) / NVDA_PRICE);
        spy.mint(address(machine), (SEED_VALUE_USD6 * 1e18) / SPY_PRICE);

        vm.stopBroadcast();

        _log("MockUSDC", address(usdc));
        _log("TSLAx", address(tsla));
        _log("AAPLx", address(aapl));
        _log("NVDAx", address(nvda));
        _log("SPYx", address(spy));
        _log("ClawMachine", address(machine));

        console.log("");
        console.log("ClawMachine constructor args (ABI encoded, no 0x):");
        console.logBytes(abi.encode(address(usdc), ENTROPY, stocks, deployer, deployer));

        _writeDeployment(address(usdc), address(machine), stocks, prices, deployer);
    }

    function _writeDeployment(
        address usdc,
        address machine,
        address[] memory stocks,
        uint256[] memory prices,
        address deployer
    ) internal {
        string[] memory symbols = new string[](4);
        symbols[0] = "TSLAx";
        symbols[1] = "AAPLx";
        symbols[2] = "NVDAx";
        symbols[3] = "SPYx";

        string memory obj = "monad-testnet";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "usdc", usdc);
        vm.serializeAddress(obj, "clawMachine", machine);
        vm.serializeAddress(obj, "entropy", ENTROPY);
        vm.serializeAddress(obj, "deployer", deployer);
        vm.serializeAddress(obj, "treasury", deployer);
        vm.serializeAddress(obj, "keeper", deployer);
        vm.serializeString(obj, "symbols", symbols);
        vm.serializeAddress(obj, "stocks", stocks);
        vm.serializeUint(obj, "pricesUsd6", prices);
        string memory json = vm.serializeUint(obj, "deployedAt", block.timestamp);

        vm.createDir("deployments", true);
        vm.writeJson(json, "deployments/monad-testnet.json");
        console.log("");
        console.log("Wrote deployments/monad-testnet.json");
    }

    function _log(string memory label, address value) internal pure {
        console.log(string.concat(label, ":"), value);
    }
}
