// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IEntropyV2} from "./pyth/IEntropyV2.sol";
import {IEntropyConsumer} from "./pyth/IEntropyConsumer.sol";
import {IPyth} from "@pythnetwork/pyth-sdk-solidity/IPyth.sol";
import {PythStructs} from "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

/**
 * @title ClawMachine
 * @notice xStocks claw machine game with Pyth price feeds and Pyth Entropy randomness
 * @dev Players pay USDC to pull cards and win xStocks (tokenized stocks)
 * @dev Prices are fetched via Pyth pull oracle (passed in by frontend from Hermes)
 */
contract ClawMachine is IEntropyConsumer, ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    // ============ Events ============

    event PullRequested(
        uint256 indexed pullId,
        address indexed player,
        uint64 sequenceNumber,
        uint256 pullPrice
    );

    event PullResolved(
        uint256 indexed pullId,
        address indexed player,
        bool legendary,
        address[] stocks,
        uint256[] amounts
    );

    event TransferOwed(
        uint256 indexed pullId,
        address indexed player,
        address indexed token,
        uint256 amount
    );

    event InventoryRefilled(address[] stocks, uint256[] amounts);

    event TokenAdded(address indexed token, bytes32 feedId);

    event TokenRemoved(address indexed token);

    event ParametersUpdated(
        uint256 pullPrice,
        uint16 commonBps,
        uint16 legendaryRarityBps,
        uint16 legendaryMultiplier
    );

    event MaxPriceAgeUpdated(uint256 oldMaxAge, uint256 newMaxAge);

    event CallbackGasLimitUpdated(uint32 oldLimit, uint32 newLimit);

    event PullRefunded(uint256 indexed pullId, address indexed player, uint256 amount);

    // ============ Structs ============

    struct Pull {
        address player;
        uint64 entropySequence;
        uint64 requestedAt;
        uint256 reservedValue;
        bool resolved;
        // Snapshot of prices at pull request time (for callback)
        mapping(address => uint256) priceSnapshot; // token => price in USDC (6 decimals)
    }

    struct TokenInfo {
        bytes32 pythFeedId; // Pyth price feed ID
        uint8 decimals;
        bool supported;
    }

    // ============ State Variables ============

    // Core contracts
    IERC20 public immutable usdc;
    IEntropyV2 public immutable entropy;
    address public immutable entropyProvider;
    IPyth public immutable pyth;

    // Configuration
    uint256 public pullPrice = 1_000000; // 1 USDC (6 decimals)
    uint16 public commonPayoutBps = 7300; // 73% payout (0.73 USDC)
    uint16 public legendaryRarityBps = 200; // 2% chance (200/10000)
    uint16 public legendaryMultiplier = 10; // 10x payout
    uint256 public maxPriceAge = 60; // 60 seconds (configurable for after-hours)

    // Gas forwarded to the Entropy callback. Monad cold storage is expensive and gas is
    // charged on the limit, so this is a deliberate, owner-tunable tradeoff.
    uint32 public callbackGasLimit = 500_000;

    // Tokens and feed IDs
    address[] public supportedTokens;
    mapping(address => TokenInfo) public tokenInfo;

    // Pull tracking
    uint256 public nextPullId;
    mapping(uint256 => Pull) private pulls;
    mapping(uint64 => uint256) public sequenceToPullId;

    // Inventory management
    uint256 public pendingReservations;

    // Owed balances (for failed transfers)
    mapping(address => mapping(address => uint256)) public owedBalances; // player => token => amount

    // ============ Constants ============

    uint256 private constant BPS_DENOMINATOR = 10000;
    uint256 private constant PRICE_PRECISION = 1e18; // Token amounts in 1e18 units
    uint256 private constant STUCK_PULL_TIMEOUT = 10 minutes;

    // ============ Constructor ============

    constructor(
        address _usdc,
        address _entropy,
        address _pyth,
        address initialOwner
    ) Ownable(initialOwner) {
        require(_usdc != address(0), "Invalid USDC");
        require(_entropy != address(0), "Invalid Entropy");
        require(_pyth != address(0), "Invalid Pyth");

        usdc = IERC20(_usdc);
        entropy = IEntropyV2(_entropy);
        entropyProvider = IEntropyV2(_entropy).getDefaultProvider();
        pyth = IPyth(_pyth);
    }

    // ============ Player Functions ============

    /**
     * @notice Pull a card to win xStocks
     * @param userRandomNumber User-provided random number for additional entropy
     * @param priceUpdateData Pyth price update data from Hermes API
     * @return pullId The ID of this pull
     * @dev Frontend fetches priceUpdateData from Hermes and includes in call
     * @dev msg.value must cover both Pyth update fee and Entropy fee
     */
    function pull(bytes32 userRandomNumber, bytes[] calldata priceUpdateData)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (uint256 pullId)
    {
        // Get fees
        uint256 pythFee = pyth.getUpdateFee(priceUpdateData);
        uint256 entropyFee = entropy.getFeeV2(entropyProvider, callbackGasLimit);
        uint256 totalFee = pythFee + entropyFee;
        
        require(msg.value >= totalFee, "Insufficient fee");

        // Update Pyth prices
        pyth.updatePriceFeeds{value: pythFee}(priceUpdateData);

        // Fetch and snapshot current prices for all tokens
        uint256[] memory prices = new uint256[](supportedTokens.length);
        for (uint256 i = 0; i < supportedTokens.length; i++) {
            address token = supportedTokens[i];
            TokenInfo memory info = tokenInfo[token];
            
            PythStructs.Price memory priceData = pyth.getPriceNoOlderThan(
                info.pythFeedId,
                maxPriceAge
            );
            
            // Convert Pyth price to USDC (6 decimals) per 1e18 token units
            prices[i] = _convertPythPrice(priceData);
        }

        // Check inventory with current prices
        uint256 legendaryPayoutUSDC = (pullPrice * legendaryMultiplier * BPS_DENOMINATOR) / BPS_DENOMINATOR;
        uint256 inventoryValue = _calculateInventoryValue(prices);
        require(
            inventoryValue >= legendaryPayoutUSDC + pendingReservations,
            "Insufficient inventory"
        );

        // Transfer USDC from player
        usdc.safeTransferFrom(msg.sender, address(this), pullPrice);

        // Reserve inventory
        pendingReservations += legendaryPayoutUSDC;

        // Request randomness from Pyth Entropy
        uint64 sequenceNumber = entropy.requestV2{value: entropyFee}(
            entropyProvider,
            userRandomNumber,
            callbackGasLimit
        );

        // Record pull and snapshot prices
        pullId = nextPullId++;
        Pull storage pullData = pulls[pullId];
        pullData.player = msg.sender;
        pullData.entropySequence = sequenceNumber;
        pullData.requestedAt = uint64(block.timestamp);
        pullData.reservedValue = legendaryPayoutUSDC;
        pullData.resolved = false;
        
        // Store price snapshot
        for (uint256 i = 0; i < supportedTokens.length; i++) {
            pullData.priceSnapshot[supportedTokens[i]] = prices[i];
        }
        
        sequenceToPullId[sequenceNumber] = pullId;

        emit PullRequested(pullId, msg.sender, sequenceNumber, pullPrice);

        // Refund excess MON
        if (msg.value > totalFee) {
            (bool success, ) = msg.sender.call{value: msg.value - totalFee}("");
            require(success, "Refund failed");
        }
    }

    /**
     * @notice Withdraw owed tokens from failed transfers
     */
    function withdrawOwed() external nonReentrant {
        bool transferred = false;
        
        for (uint256 i = 0; i < supportedTokens.length; i++) {
            address token = supportedTokens[i];
            uint256 amount = owedBalances[msg.sender][token];
            
            if (amount > 0) {
                owedBalances[msg.sender][token] = 0;
                IERC20(token).safeTransfer(msg.sender, amount);
                transferred = true;
            }
        }
        
        require(transferred, "Nothing to withdraw");
    }

    // ============ Pyth Entropy Callback ============

    /**
     * @notice Callback function called by Pyth Entropy
     * @dev Reached through IEntropyConsumer._entropyCallback, which verifies msg.sender
     * @dev This function must stay within gas limits (Monad charges by gas LIMIT)
     * @dev Uses price snapshot from pull request time
     */
    function entropyCallback(
        uint64 sequenceNumber,
        address, /* provider */
        bytes32 randomNumber
    ) internal override {
        uint256 pullId = sequenceToPullId[sequenceNumber];
        Pull storage pullData = pulls[pullId];
        
        require(!pullData.resolved, "Already resolved");
        require(pullData.player != address(0), "Invalid pull");

        pullData.resolved = true;

        // Determine rarity: legendary if rand % 10000 < legendaryRarityBps
        uint256 roll = uint256(randomNumber) % BPS_DENOMINATOR;
        bool legendary = roll < legendaryRarityBps;

        // Determine payout amount in USDC
        uint256 payoutUSDC;
        if (legendary) {
            payoutUSDC = (pullPrice * legendaryMultiplier * BPS_DENOMINATOR) / BPS_DENOMINATOR;
        } else {
            payoutUSDC = (pullPrice * commonPayoutBps) / BPS_DENOMINATOR;
            // Treasury keeps the rest (no explicit transfer needed, stays in contract)
        }

        // Select stocks and amounts based on random number and snapshot prices
        (address[] memory stocks, uint256[] memory amounts) = _selectStocks(
            randomNumber,
            payoutUSDC,
            pullId
        );

        // Transfer xStocks to player (with failure handling)
        for (uint256 i = 0; i < stocks.length; i++) {
            if (amounts[i] > 0) {
                _safeTransferWithFallback(
                    stocks[i],
                    pullData.player,
                    amounts[i],
                    pullId
                );
            }
        }

        // Release reservation
        pendingReservations -= pullData.reservedValue;

        emit PullResolved(pullId, pullData.player, legendary, stocks, amounts);
    }

    // ============ View Functions ============

    /**
     * @notice Check if a pull is currently possible (without price update)
     * @dev This is approximate; actual pull() will fetch latest prices
     */
    function canPull() public view returns (bool) {
        uint256 legendaryPayoutUSDC = (pullPrice * legendaryMultiplier * BPS_DENOMINATOR) / BPS_DENOMINATOR;
        
        // Approximate check using stale prices (actual pull will update)
        uint256 inventoryValue = 0;
        for (uint256 i = 0; i < supportedTokens.length; i++) {
            address token = supportedTokens[i];
            TokenInfo memory info = tokenInfo[token];
            
            if (!info.supported) continue;

            // Try to get price (may revert if too stale)
            try pyth.getPriceNoOlderThan(info.pythFeedId, maxPriceAge) returns (PythStructs.Price memory priceData) {
                uint256 balance = IERC20(token).balanceOf(address(this));
                if (balance == 0) continue;

                uint256 price = _convertPythPrice(priceData);
                uint256 balanceIn1e18 = _toStandardDecimals(balance, info.decimals);
                uint256 valueUSDC = (balanceIn1e18 * price) / PRICE_PRECISION;
                inventoryValue += valueUSDC;
            } catch {
                // Price too stale, can't pull
                return false;
            }
        }
        
        return inventoryValue >= legendaryPayoutUSDC + pendingReservations;
    }

    /**
     * @notice Get the Pyth update fee for given price data
     */
    function getPythFee(bytes[] calldata priceUpdateData) external view returns (uint256) {
        return pyth.getUpdateFee(priceUpdateData);
    }

    /**
     * @notice Get the Entropy fee
     */
    function getEntropyFee() external view returns (uint256) {
        return entropy.getFeeV2(entropyProvider, callbackGasLimit);
    }

    /**
     * @notice Get total fee for pull (Pyth + Entropy)
     */
    function getTotalFee(bytes[] calldata priceUpdateData) external view returns (uint256) {
        return pyth.getUpdateFee(priceUpdateData) + entropy.getFeeV2(entropyProvider, callbackGasLimit);
    }

    /**
     * @notice Get approximate inventory value (may be stale)
     */
    function getInventoryValue() public view returns (uint256 totalValueUSDC) {
        uint256[] memory prices = new uint256[](supportedTokens.length);
        
        for (uint256 i = 0; i < supportedTokens.length; i++) {
            address token = supportedTokens[i];
            TokenInfo memory info = tokenInfo[token];
            
            if (!info.supported) continue;

            try pyth.getPriceNoOlderThan(info.pythFeedId, maxPriceAge) returns (PythStructs.Price memory priceData) {
                prices[i] = _convertPythPrice(priceData);
            } catch {
                prices[i] = 0; // Price too stale
            }
        }
        
        return _calculateInventoryValue(prices);
    }

    /**
     * @notice Get pending reservations
     */
    function getPendingReservations() external view returns (uint256) {
        return pendingReservations;
    }

    /**
     * @notice Get owed balance for a player
     */
    function getOwedBalance(address player)
        external
        view
        returns (address[] memory stocks, uint256[] memory amounts)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < supportedTokens.length; i++) {
            if (owedBalances[player][supportedTokens[i]] > 0) {
                count++;
            }
        }

        stocks = new address[](count);
        amounts = new uint256[](count);
        uint256 index = 0;

        for (uint256 i = 0; i < supportedTokens.length; i++) {
            address token = supportedTokens[i];
            uint256 amount = owedBalances[player][token];
            if (amount > 0) {
                stocks[index] = token;
                amounts[index] = amount;
                index++;
            }
        }
    }

    /**
     * @notice Get pull basic data (prices stored in mapping, not returned)
     */
    function getPullBasicData(uint256 pullId) external view returns (
        address player,
        uint64 entropySequence,
        uint256 reservedValue,
        bool resolved
    ) {
        Pull storage p = pulls[pullId];
        return (p.player, p.entropySequence, p.reservedValue, p.resolved);
    }

    /**
     * @notice Get price snapshot for a specific pull and token
     */
    function getPullPriceSnapshot(uint256 pullId, address token) external view returns (uint256) {
        return pulls[pullId].priceSnapshot[token];
    }

    /**
     * @notice Get all supported tokens
     */
    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokens;
    }

    // ============ Owner Functions ============

    /**
     * @notice Add a supported xStocks token with its Pyth feed ID
     */
    function addToken(address token, bytes32 pythFeedId) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(pythFeedId != bytes32(0), "Invalid feed ID");
        require(!tokenInfo[token].supported, "Already supported");

        uint8 decimals = IERC20Metadata(token).decimals();
        
        tokenInfo[token] = TokenInfo({
            pythFeedId: pythFeedId,
            decimals: decimals,
            supported: true
        });
        
        supportedTokens.push(token);
        emit TokenAdded(token, pythFeedId);
    }

    /**
     * @notice Remove a supported token
     */
    function removeToken(address token) external onlyOwner {
        require(tokenInfo[token].supported, "Not supported");
        
        tokenInfo[token].supported = false;
        
        // Remove from array
        for (uint256 i = 0; i < supportedTokens.length; i++) {
            if (supportedTokens[i] == token) {
                supportedTokens[i] = supportedTokens[supportedTokens.length - 1];
                supportedTokens.pop();
                break;
            }
        }
        
        emit TokenRemoved(token);
    }

    /**
     * @notice Update game parameters
     */
    function setParameters(
        uint256 _pullPrice,
        uint16 _commonBps,
        uint16 _legendaryRarityBps,
        uint16 _legendaryMultiplier
    ) external onlyOwner {
        require(_commonBps <= BPS_DENOMINATOR, "Invalid common bps");
        require(_legendaryRarityBps <= BPS_DENOMINATOR, "Invalid legendary bps");
        require(_legendaryMultiplier > 0, "Invalid multiplier");

        pullPrice = _pullPrice;
        commonPayoutBps = _commonBps;
        legendaryRarityBps = _legendaryRarityBps;
        legendaryMultiplier = _legendaryMultiplier;

        emit ParametersUpdated(_pullPrice, _commonBps, _legendaryRarityBps, _legendaryMultiplier);
    }

    /**
     * @notice Withdraw USDC treasury
     */
    function withdrawTreasury(uint256 amount) external onlyOwner {
        usdc.safeTransfer(msg.sender, amount);
    }

    /**
     * @notice Withdraw inventory tokens (for rebalancing)
     */
    function withdrawInventory(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    /**
     * @notice Refill inventory (after owner purchases xStocks off-chain)
     */
    function refillInventory(address[] calldata tokens, uint256[] calldata amounts)
        external
        onlyOwner
    {
        require(tokens.length == amounts.length, "Length mismatch");
        
        for (uint256 i = 0; i < tokens.length; i++) {
            require(tokenInfo[tokens[i]].supported, "Token not supported");
            IERC20(tokens[i]).safeTransferFrom(msg.sender, address(this), amounts[i]);
        }

        emit InventoryRefilled(tokens, amounts);
    }

    /**
     * @notice Refund a pull whose Entropy callback never landed
     * @dev Owner-only escape hatch. Without it a stuck pull keeps its legendary
     *      reservation pending forever and blocks later pulls on a small inventory.
     *      Only allowed once the pull is more than 10 minutes old; it pays the player
     *      back the pull price and releases the reservation.
     */
    function refundStuckPull(uint256 pullId) external onlyOwner nonReentrant {
        Pull storage pullData = pulls[pullId];
        require(pullData.player != address(0), "Invalid pull");
        require(!pullData.resolved, "Already resolved");
        require(
            block.timestamp >= uint256(pullData.requestedAt) + STUCK_PULL_TIMEOUT,
            "Pull not stuck yet"
        );

        pullData.resolved = true;
        pendingReservations -= pullData.reservedValue;
        usdc.safeTransfer(pullData.player, pullPrice);

        emit PullRefunded(pullId, pullData.player, pullPrice);
    }

    /**
     * @notice Set max price age (larger for after-hours trading)
     */
    function setMaxPriceAge(uint256 newMaxAge) external onlyOwner {
        uint256 oldMaxAge = maxPriceAge;
        maxPriceAge = newMaxAge;
        emit MaxPriceAgeUpdated(oldMaxAge, newMaxAge);
    }

    /**
     * @notice Set the gas limit forwarded to the Entropy callback
     * @dev Monad charges gas on the limit, so keep this just high enough for the callback
     */
    function setCallbackGasLimit(uint32 newLimit) external onlyOwner {
        require(newLimit >= 100_000 && newLimit <= 1_500_000, "Invalid gas limit");
        uint32 oldLimit = callbackGasLimit;
        callbackGasLimit = newLimit;
        emit CallbackGasLimitUpdated(oldLimit, newLimit);
    }

    /**
     * @notice Pause the contract
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ Internal Functions ============

    /**
     * @notice Entropy contract address used by IEntropyConsumer to authenticate callbacks
     */
    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }

    /**
     * @notice Convert Pyth price to USDC (6 decimals) per 1e18 token units
     */
    function _convertPythPrice(PythStructs.Price memory priceData) internal pure returns (uint256) {
        require(priceData.price > 0, "Invalid price");
        
        // Pyth price has expo (e.g., -8 means divide by 1e8)
        // We want price in USDC (6 decimals) per 1e18 token units
        
        uint256 price = uint256(uint64(priceData.price));
        int32 expo = priceData.expo;
        
        // Target: USDC (6 decimals) per 1e18 tokens
        // Example: TSLA price is $250.00, expo = -8
        // priceData.price = 25000000000 (250 * 1e8)
        // We want: 250000000 (250 * 1e6)
        
        if (expo >= 0) {
            // Price is multiplied, convert to 6 decimals
            return price * (10 ** uint32(expo)) / 1e12; // Assuming base is 1e18, target is 1e6
        } else {
            // Price has negative exponent
            uint32 expoDenom = uint32(-expo);
            
            // Adjust to 6 decimal USDC
            if (expoDenom > 6) {
                // e.g., expo = -8, divide by 1e8, then multiply by 1e6
                return (price * 1e6) / (10 ** expoDenom);
            } else {
                // e.g., expo = -4, divide by 1e4, then multiply by 1e6
                return (price * 1e6) / (10 ** expoDenom);
            }
        }
    }

    /**
     * @notice Calculate inventory value from price array
     */
    function _calculateInventoryValue(uint256[] memory prices) internal view returns (uint256 totalValueUSDC) {
        for (uint256 i = 0; i < supportedTokens.length; i++) {
            address token = supportedTokens[i];
            TokenInfo memory info = tokenInfo[token];
            
            if (!info.supported) continue;

            uint256 balance = IERC20(token).balanceOf(address(this));
            if (balance == 0 || prices[i] == 0) continue;

            uint256 balanceIn1e18 = _toStandardDecimals(balance, info.decimals);
            uint256 valueUSDC = (balanceIn1e18 * prices[i]) / PRICE_PRECISION;
            totalValueUSDC += valueUSDC;
        }
    }

    /**
     * @notice Select which stocks and amounts to give based on random number
     * @param randomNumber The random number from Pyth Entropy
     * @param totalPayoutUSDC Total payout value in USDC
     * @param pullId The pull ID (to access price snapshot)
     * @return stocks Array of stock addresses
     * @return amounts Array of amounts in token native decimals
     */
    function _selectStocks(bytes32 randomNumber, uint256 totalPayoutUSDC, uint256 pullId)
        internal
        view
        returns (address[] memory stocks, uint256[] memory amounts)
    {
        uint256 numTokens = supportedTokens.length;
        require(numTokens > 0, "No supported tokens");

        Pull storage pullData = pulls[pullId];
        stocks = new address[](numTokens);
        amounts = new uint256[](numTokens);

        // Use random number to distribute payout across tokens
        uint256 remainingUSDC = totalPayoutUSDC;
        
        for (uint256 i = 0; i < numTokens; i++) {
            address token = supportedTokens[i];
            TokenInfo memory info = tokenInfo[token];
            uint256 price = pullData.priceSnapshot[token]; // Use snapshot price
            
            stocks[i] = token;
            
            if (i == numTokens - 1) {
                // Last token gets remaining value
                if (remainingUSDC > 0 && price > 0) {
                    uint256 amountIn1e18 = (remainingUSDC * PRICE_PRECISION) / price;
                    amounts[i] = _fromStandardDecimals(amountIn1e18, info.decimals);
                }
            } else {
                // Random allocation
                uint256 seed = uint256(keccak256(abi.encodePacked(randomNumber, i)));
                uint256 allocationBps = (seed % (BPS_DENOMINATOR + 1));
                uint256 allocationUSDC = (remainingUSDC * allocationBps) / BPS_DENOMINATOR;
                
                if (allocationUSDC > 0 && price > 0) {
                    uint256 amountIn1e18 = (allocationUSDC * PRICE_PRECISION) / price;
                    amounts[i] = _fromStandardDecimals(amountIn1e18, info.decimals);
                    remainingUSDC -= allocationUSDC;
                }
            }
        }
    }

    /**
     * @notice Safe transfer with fallback to owed balance
     * @return success Whether the transfer succeeded
     */
    function _safeTransferWithFallback(
        address token,
        address to,
        uint256 amount,
        uint256 pullId
    ) internal returns (bool success) {
        if (amount == 0) return true;

        // Check balance
        if (IERC20(token).balanceOf(address(this)) < amount) {
            owedBalances[to][token] += amount;
            emit TransferOwed(pullId, to, token, amount);
            return false;
        }

        // Try transfer with low-level call to catch failures
        try IERC20(token).transfer(to, amount) returns (bool result) {
            if (result) {
                return true;
            } else {
                owedBalances[to][token] += amount;
                emit TransferOwed(pullId, to, token, amount);
                return false;
            }
        } catch {
            owedBalances[to][token] += amount;
            emit TransferOwed(pullId, to, token, amount);
            return false;
        }
    }

    /**
     * @notice Convert token amount to standard 1e18 decimals
     */
    function _toStandardDecimals(uint256 amount, uint8 decimals)
        internal
        pure
        returns (uint256)
    {
        if (decimals < 18) {
            return amount * (10 ** (18 - decimals));
        } else if (decimals > 18) {
            return amount / (10 ** (decimals - 18));
        }
        return amount;
    }

    /**
     * @notice Convert from standard 1e18 decimals to token decimals
     */
    function _fromStandardDecimals(uint256 amount, uint8 decimals)
        internal
        pure
        returns (uint256)
    {
        if (decimals < 18) {
            return amount / (10 ** (18 - decimals));
        } else if (decimals > 18) {
            return amount * (10 ** (decimals - 18));
        }
        return amount;
    }

    /**
     * @notice Receive function to accept MON for fees
     */
    receive() external payable {}
}
