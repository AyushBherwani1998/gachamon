// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";

import {ClawMachine} from "../src/ClawMachine.sol";

/// @notice Deploys ClawMachine on Monad mainnet with the verified USDC and xStock addresses.
/// @dev    No tokens are transferred. Fund inventory by sending xStocks to the machine.
///         Run with: forge script script/DeployMainnet.s.sol --rpc-url monad --account deployer --broadcast
contract DeployMainnet is Script {
    address internal constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address internal constant ENTROPY = 0xD458261E832415CFd3BAE5E416FdF3230ce6F134;

    address internal constant TSLAX = 0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0;
    address internal constant AAPLX = 0x9d275685dC284C8eB1C79f6ABA7a63Dc75ec890a;
    address internal constant NVDAX = 0xc845b2894dBddd03858fd2D643B4eF725fE0849d;
    address internal constant SPYX = 0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48;

    function run() external returns (ClawMachine machine) {
        address deployer = msg.sender;
        address keeper = vm.envOr("KEEPER", deployer);
        address treasury = vm.envOr("TREASURY", deployer);

        address[] memory stocks = new address[](4);
        stocks[0] = TSLAX;
        stocks[1] = AAPLX;
        stocks[2] = NVDAX;
        stocks[3] = SPYX;

        vm.startBroadcast();
        machine = new ClawMachine(USDC, ENTROPY, stocks, treasury, keeper);
        vm.stopBroadcast();

        console.log("USDC:", USDC);
        console.log("TSLAx:", TSLAX);
        console.log("AAPLx:", AAPLX);
        console.log("NVDAx:", NVDAX);
        console.log("SPYx:", SPYX);
        console.log("ClawMachine:", address(machine));
        console.log("keeper:", keeper);
        console.log("treasury:", treasury);
        console.log("");
        console.log("ClawMachine constructor args (ABI encoded, no 0x):");
        console.logBytes(abi.encode(USDC, ENTROPY, stocks, treasury, keeper));

        _writeDeployment(address(machine), stocks, keeper, treasury, deployer);
    }

    function _writeDeployment(
        address machine,
        address[] memory stocks,
        address keeper,
        address treasury,
        address deployer
    ) internal {
        string[] memory symbols = new string[](4);
        symbols[0] = "TSLAx";
        symbols[1] = "AAPLx";
        symbols[2] = "NVDAx";
        symbols[3] = "SPYx";

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
