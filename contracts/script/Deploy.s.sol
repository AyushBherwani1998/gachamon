// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

import {ClawMachine} from "../src/ClawMachine.sol";

/**
 * @title Deploy
 * @notice Deploys ClawMachine on Monad mainnet (chain 143).
 *
 * @dev The broadcaster is the owner. No key is read from the environment; pass it with
 *      --private-key, --account or --ledger:
 *
 *      forge script script/Deploy.s.sol --rpc-url monad --account deployer --broadcast \
 *        --verify --verifier sourcify \
 *        --verifier-url https://sourcify-api-monad.blockvision.org/
 *
 *      Optional env:
 *        STOCKS=TSLAx,NVDAx,SPYx     comma-separated subset of
 *                                    TSLAx,NVDAx,SPYx,QQQx,SPCXx
 *        LEGENDARY_MULTIPLIER=5      keep the other defaults, change only the multiplier
 *        CALLBACK_GAS_LIMIT=500000   gas forwarded to the Entropy callback
 *
 *      Prices come from Chainlink AggregatorV3 proxies. The feeds price the wrapped,
 *      non-rebasing xStock; the machine converts with each token's multiplier().
 */
contract Deploy is Script {
    // Monad mainnet (chain 143)
    address internal constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address internal constant PYTH_ENTROPY = 0xD458261E832415CFd3BAE5E416FdF3230ce6F134;

    // Rebasing xStocks the machine holds and pays out
    address internal constant TSLAX = 0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0;
    address internal constant NVDAX = 0xc845b2894dBddd03858fd2D643B4eF725fE0849d;
    address internal constant SPYX = 0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48;
    address internal constant QQQX = 0xa753A7395cAe905Cd615Da0B82A53E0560f250af;
    address internal constant SPCXX = 0x68fa48B1C2FE52b3D776E1953e0E782b5044Ce28;

    // Chainlink w<token>-USD proxies (8 decimals)
    address internal constant TSLA_FEED = 0xE42022cCe1913626AE4297B99291d3Ba24Cc9281;
    address internal constant NVDA_FEED = 0x03ffa4673c060339E6a8E5Ba1a12B3301c966bf0;
    address internal constant SPY_FEED = 0x2e2dA5717eDE960F8b77Af4cFcBDC4Ca3099006D;
    address internal constant QQQ_FEED = 0x7CA45B17D8D43059a222dEC5d991B613F61c02d9;
    address internal constant SPCX_FEED = 0x7577154038de77668d0188baF47707EDcd86d0b3;

    function run() external returns (ClawMachine claw) {
        address deployer = msg.sender;
        require(block.chainid == 143, "Must deploy on Monad mainnet (chain 143)");

        string[] memory symbols = _parseSymbols(vm.envOr("STOCKS", string("TSLAx,NVDAx,SPYx")));
        uint256 legendaryMultiplier = vm.envOr("LEGENDARY_MULTIPLIER", uint256(0));
        uint256 callbackGasLimit = vm.envOr("CALLBACK_GAS_LIMIT", uint256(0));

        console.log("Deploying from:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Stocks:", vm.envOr("STOCKS", string("TSLAx,NVDAx,SPYx")));

        vm.startBroadcast();

        claw = new ClawMachine(USDC, PYTH_ENTROPY, deployer);

        for (uint256 i = 0; i < symbols.length; i++) {
            claw.addToken(_tokenFor(symbols[i]), _feedFor(symbols[i]));
        }

        if (legendaryMultiplier != 0) {
            require(legendaryMultiplier <= type(uint16).max, "Multiplier too large");
            claw.setParameters(
                claw.pullPrice(),
                claw.commonPayoutBps(),
                claw.legendaryRarityBps(),
                uint16(legendaryMultiplier)
            );
        }

        if (callbackGasLimit != 0) {
            require(callbackGasLimit <= 1_500_000, "Invalid gas limit");
            claw.setCallbackGasLimit(uint32(callbackGasLimit));
        }

        vm.stopBroadcast();

        console.log("\n=== Deployment Complete ===");
        console.log("ClawMachine:", address(claw));
        console.log("Owner:", deployer);
        console.log("USDC:", USDC);
        console.log("Pyth Entropy:", PYTH_ENTROPY);
        console.log("Entropy provider:", claw.entropyProvider());

        for (uint256 i = 0; i < symbols.length; i++) {
            console.log(symbols[i], _tokenFor(symbols[i]));
            console.log("  Chainlink feed:", _feedFor(symbols[i]));
        }

        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            _writeDeployment(claw, symbols);
        } else {
            console.log("\nDry run: deployments/monad-mainnet.json not written");
        }

        console.log("\nNext steps:");
        console.log("1. Send xStock inventory to the machine (at least 10 USD for a 10x legendary)");
        console.log("2. Point the backend at the ClawMachine address");
        console.log("3. Chainlink feeds update hourly or on 0.05% deviation; maxPriceAge is 3900s");
    }

    /**
     * @dev Comma-separated symbol list. Spaces and empty entries are ignored.
     */
    function _parseSymbols(string memory csv) internal pure returns (string[] memory symbols) {
        bytes memory data = bytes(csv);
        uint256 count = 1;
        for (uint256 i = 0; i < data.length; i++) {
            if (data[i] == ",") count++;
        }

        string[] memory raw = new string[](count);
        uint256 found = 0;
        uint256 start = 0;

        for (uint256 i = 0; i <= data.length; i++) {
            if (i == data.length || data[i] == ",") {
                uint256 end = i;
                while (start < end && data[start] == 0x20) start++;
                while (end > start && data[end - 1] == 0x20) end--;

                if (end > start) {
                    bytes memory chunk = new bytes(end - start);
                    for (uint256 j = start; j < end; j++) {
                        chunk[j - start] = data[j];
                    }
                    raw[found++] = string(chunk);
                }
                start = i + 1;
            }
        }

        require(found > 0, "Empty STOCKS");

        symbols = new string[](found);
        for (uint256 i = 0; i < found; i++) {
            symbols[i] = raw[i];
        }

        for (uint256 i = 0; i < symbols.length; i++) {
            _tokenFor(symbols[i]); // reverts on an unknown symbol
        }
    }

    function _tokenFor(string memory symbol) internal pure returns (address) {
        bytes32 hash = keccak256(bytes(symbol));
        if (hash == keccak256("TSLAx")) return TSLAX;
        if (hash == keccak256("NVDAx")) return NVDAX;
        if (hash == keccak256("SPYx")) return SPYX;
        if (hash == keccak256("QQQx")) return QQQX;
        if (hash == keccak256("SPCXx")) return SPCXX;
        revert("Unknown stock symbol");
    }

    function _feedFor(string memory symbol) internal pure returns (address) {
        bytes32 hash = keccak256(bytes(symbol));
        if (hash == keccak256("TSLAx")) return TSLA_FEED;
        if (hash == keccak256("NVDAx")) return NVDA_FEED;
        if (hash == keccak256("SPYx")) return SPY_FEED;
        if (hash == keccak256("QQQx")) return QQQ_FEED;
        if (hash == keccak256("SPCXx")) return SPCX_FEED;
        revert("Unknown stock symbol");
    }

    function _writeDeployment(ClawMachine claw, string[] memory symbols) internal {
        address[] memory tokens = new address[](symbols.length);
        address[] memory feeds = new address[](symbols.length);
        for (uint256 i = 0; i < symbols.length; i++) {
            tokens[i] = _tokenFor(symbols[i]);
            feeds[i] = _feedFor(symbols[i]);
        }

        string memory params = "params";
        vm.serializeUint(params, "pullPrice", claw.pullPrice());
        vm.serializeUint(params, "commonPayoutBps", claw.commonPayoutBps());
        vm.serializeUint(params, "legendaryRarityBps", claw.legendaryRarityBps());
        vm.serializeUint(params, "legendaryMultiplier", claw.legendaryMultiplier());
        vm.serializeUint(params, "maxPriceAge", claw.maxPriceAge());
        string memory paramsJson =
            vm.serializeUint(params, "callbackGasLimit", claw.callbackGasLimit());

        string memory obj = "monad-mainnet";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "address", address(claw));
        vm.serializeAddress(obj, "clawMachine", address(claw));
        vm.serializeUint(obj, "deployBlock", block.number);
        vm.serializeAddress(obj, "usdc", USDC);
        vm.serializeAddress(obj, "entropy", PYTH_ENTROPY);
        vm.serializeAddress(obj, "provider", claw.entropyProvider());
        vm.serializeString(obj, "tokens", symbols);
        vm.serializeAddress(obj, "tokenAddresses", tokens);
        vm.serializeAddress(obj, "priceFeeds", feeds);
        string memory json = vm.serializeString(obj, "params", paramsJson);

        vm.createDir("deployments", true);
        vm.writeJson(json, "deployments/monad-mainnet.json");
        console.log("\nWrote deployments/monad-mainnet.json");
    }
}
