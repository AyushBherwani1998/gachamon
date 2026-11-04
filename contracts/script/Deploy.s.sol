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
 *        STOCKS=TSLAx,QQQx          comma-separated subset of TSLAx,QQQx,VOOx,NVDAx,AAPLx,SPYx
 *        LEGENDARY_MULTIPLIER=5      keep the other defaults, change only the multiplier
 *        CALLBACK_GAS_LIMIT=500000   gas forwarded to the Entropy callback
 *
 *      Our Hermes key is entitled to TSLA, QQQ and VOO, so the default is TSLAx,QQQx.
 *      The other symbols are wired for when entitlement arrives.
 */
contract Deploy is Script {
    // Monad mainnet (chain 143)
    address internal constant USDC = 0x754704Bc059F8C67012fEd69BC8A327a5aafb603;
    address internal constant PYTH_ENTROPY = 0xD458261E832415CFd3BAE5E416FdF3230ce6F134;
    address internal constant PYTH_PRICE_FEED = 0xB754BA51E3861Ac0Cb67f73CD046dE790A36508d;

    address internal constant TSLAX = 0x8aD3c73F833d3F9A523aB01476625F269aEB7Cf0;
    address internal constant NVDAX = 0xc845b2894dBddd03858fd2D643B4eF725fE0849d;
    address internal constant AAPLX = 0x9d275685dC284C8eB1C79f6ABA7a63Dc75ec890a;
    address internal constant SPYX = 0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48;
    address internal constant QQQX = 0xa753A7395cAe905Cd615Da0B82A53E0560f250af;
    address internal constant VOOX = 0xFfAE0B911CB2cb7B49FD75011D99D137C040A9eF;

    // Pyth price feed IDs (from Hermes)
    bytes32 internal constant TSLA_FEED_ID =
        0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1;
    bytes32 internal constant NVDA_FEED_ID =
        0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593;
    bytes32 internal constant AAPL_FEED_ID =
        0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688;
    bytes32 internal constant SPY_FEED_ID =
        0x19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5;
    bytes32 internal constant QQQ_FEED_ID =
        0x9695e2b96ea7b3859da9ed25b7a46a920a776e2fdae19a7bcfdf2b219230452d;
    bytes32 internal constant VOO_FEED_ID =
        0x236b30dd09a9c00dfeec156c7b1efd646c0f01825a1758e3e4a0679e3bdff179;

    function run() external returns (ClawMachine claw) {
        address deployer = msg.sender;
        require(block.chainid == 143, "Must deploy on Monad mainnet (chain 143)");

        string[] memory symbols = _parseSymbols(vm.envOr("STOCKS", string("TSLAx,QQQx")));
        uint256 legendaryMultiplier = vm.envOr("LEGENDARY_MULTIPLIER", uint256(0));
        uint256 callbackGasLimit = vm.envOr("CALLBACK_GAS_LIMIT", uint256(0));

        console.log("Deploying from:", deployer);
        console.log("Chain ID:", block.chainid);
        console.log("Stocks:", vm.envOr("STOCKS", string("TSLAx,QQQx")));

        vm.startBroadcast();

        claw = new ClawMachine(USDC, PYTH_ENTROPY, PYTH_PRICE_FEED, deployer);

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
        console.log("Pyth price feed:", PYTH_PRICE_FEED);
        console.log("Pyth Entropy:", PYTH_ENTROPY);
        console.log("Entropy provider:", claw.entropyProvider());

        for (uint256 i = 0; i < symbols.length; i++) {
            console.log(symbols[i], _tokenFor(symbols[i]));
            console.log("  feedId:", vm.toString(_feedFor(symbols[i])));
        }

        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            _writeDeployment(claw, symbols);
        } else {
            console.log("\nDry run: deployments/monad-mainnet.json not written");
        }

        console.log("\nNext steps:");
        console.log("1. Send TSLAx/QQQx inventory to the machine (at least 10 USD for a 10x legendary)");
        console.log("2. Point the backend at the ClawMachine address");
        console.log("3. Keep PYTH_API_KEY server-side and fetch the TSLA update from Hermes");
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
        if (hash == keccak256("AAPLx")) return AAPLX;
        if (hash == keccak256("SPYx")) return SPYX;
        if (hash == keccak256("QQQx")) return QQQX;
        if (hash == keccak256("VOOx")) return VOOX;
        revert("Unknown stock symbol");
    }

    function _feedFor(string memory symbol) internal pure returns (bytes32) {
        bytes32 hash = keccak256(bytes(symbol));
        if (hash == keccak256("TSLAx")) return TSLA_FEED_ID;
        if (hash == keccak256("NVDAx")) return NVDA_FEED_ID;
        if (hash == keccak256("AAPLx")) return AAPL_FEED_ID;
        if (hash == keccak256("SPYx")) return SPY_FEED_ID;
        if (hash == keccak256("QQQx")) return QQQ_FEED_ID;
        if (hash == keccak256("VOOx")) return VOO_FEED_ID;
        revert("Unknown stock symbol");
    }

    function _writeDeployment(ClawMachine claw, string[] memory symbols) internal {
        address[] memory tokens = new address[](symbols.length);
        bytes32[] memory feeds = new bytes32[](symbols.length);
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
        vm.serializeAddress(obj, "pyth", PYTH_PRICE_FEED);
        vm.serializeAddress(obj, "entropy", PYTH_ENTROPY);
        vm.serializeAddress(obj, "provider", claw.entropyProvider());
        vm.serializeString(obj, "tokens", symbols);
        vm.serializeAddress(obj, "tokenAddresses", tokens);
        vm.serializeBytes32(obj, "feedIds", feeds);
        string memory json = vm.serializeString(obj, "params", paramsJson);

        vm.createDir("deployments", true);
        vm.writeJson(json, "deployments/monad-mainnet.json");
        console.log("\nWrote deployments/monad-mainnet.json");
    }
}
