// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

import {ClawMachine} from "../src/ClawMachine.sol";

/// @notice Deploys ClawMachine on Monad mainnet with the verified USDC and xStock addresses.
/// @dev    No tokens are transferred. Fund inventory by sending xStocks to the machine.
///         The stock list comes from the STOCKS env var (comma separated addresses).
///         AAPLx has no usable liquidity on Monad today, so it is not in the default list.
///
///         forge script script/DeployMainnet.s.sol --rpc-url monad --account deployer --broadcast
contract DeployMainnet is Script {
    address internal constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address internal constant ENTROPY = 0xD458261E832415CFd3BAE5E416FdF3230ce6F134;

    address internal constant TSLAX = 0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0;
    address internal constant AAPLX = 0x9d275685dC284C8eB1C79f6ABA7a63Dc75ec890a;
    address internal constant NVDAX = 0xc845b2894dBddd03858fd2D643B4eF725fE0849d;
    address internal constant SPYX = 0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48;

    string internal constant DEFAULT_STOCKS =
        "0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0,0xc845b2894dBddd03858fd2D643B4eF725fE0849d,0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48";

    function run() external returns (ClawMachine machine) {
        address deployer = msg.sender;
        address keeper = vm.envOr("KEEPER", deployer);
        address treasury = vm.envOr("TREASURY", deployer);
        address[] memory stocks = _parseStocks(vm.envOr("STOCKS", DEFAULT_STOCKS));

        vm.startBroadcast();
        machine = new ClawMachine(USDC, ENTROPY, stocks, treasury, keeper);
        vm.stopBroadcast();

        console.log("USDC:", USDC);
        console.log("Entropy:", ENTROPY);
        for (uint256 i = 0; i < stocks.length; ++i) {
            console.log(_symbolOf(stocks[i]), stocks[i]);
        }
        console.log("ClawMachine:", address(machine));
        console.log("keeper:", keeper);
        console.log("treasury:", treasury);
        console.log("");
        console.log("Remember: fund the machine with xStocks and call setPrices from the keeper.");
        console.log("");
        console.log("ClawMachine constructor args (ABI encoded, no 0x):");
        console.logBytes(abi.encode(USDC, ENTROPY, stocks, treasury, keeper));

        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            _writeDeployment(address(machine), stocks, keeper, treasury, deployer);
        } else {
            console.log("");
            console.log("Dry run: not writing deployments/monad-mainnet.json");
        }
    }

    /// @dev Comma separated address list, e.g. "0xabc...,0xdef...". Spaces are ignored.
    function _parseStocks(string memory csv) internal pure returns (address[] memory stocks) {
        bytes memory data = bytes(csv);
        uint256 count = 1;
        for (uint256 i = 0; i < data.length; ++i) {
            if (data[i] == ",") ++count;
        }

        stocks = new address[](count);
        uint256 index = 0;
        uint256 start = 0;

        for (uint256 i = 0; i <= data.length; ++i) {
            if (i == data.length || data[i] == ",") {
                uint256 end = i;
                while (start < end && data[start] == 0x20) ++start;
                while (end > start && data[end - 1] == 0x20) --end;
                require(end > start, "empty entry in STOCKS");

                bytes memory chunk = new bytes(end - start);
                for (uint256 j = start; j < end; ++j) {
                    chunk[j - start] = data[j];
                }
                stocks[index++] = vm.parseAddress(string(chunk));
                start = i + 1;
            }
        }

        require(stocks.length > 0 && stocks.length <= 8, "invalid STOCKS length");
    }

    function _symbolOf(address stock) internal pure returns (string memory) {
        if (stock == TSLAX) return "TSLAx";
        if (stock == AAPLX) return "AAPLx";
        if (stock == NVDAX) return "NVDAx";
        if (stock == SPYX) return "SPYx";
        return "UNKNOWN";
    }

    function _writeDeployment(
        address machine,
        address[] memory stocks,
        address keeper,
        address treasury,
        address deployer
    ) internal {
        string[] memory symbols = new string[](stocks.length);
        for (uint256 i = 0; i < stocks.length; ++i) {
            symbols[i] = _symbolOf(stocks[i]);
        }

        string memory obj = "monad-mainnet";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "usdc", USDC);
        vm.serializeAddress(obj, "clawMachine", machine);
        vm.serializeAddress(obj, "entropy", ENTROPY);
        vm.serializeAddress(obj, "deployer", deployer);
        vm.serializeAddress(obj, "treasury", treasury);
        vm.serializeAddress(obj, "keeper", keeper);
        vm.serializeString(obj, "symbols", symbols);
        vm.serializeAddress(obj, "stocks", stocks);
        string memory json = vm.serializeUint(obj, "deployedAt", block.timestamp);

        vm.createDir("deployments", true);
        vm.writeJson(json, "deployments/monad-mainnet.json");
        console.log("");
        console.log("Wrote deployments/monad-mainnet.json");
    }
}
