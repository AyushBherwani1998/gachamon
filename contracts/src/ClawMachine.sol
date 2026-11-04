// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IEntropyConsumer} from "./pyth/IEntropyConsumer.sol";
import {IEntropyV2} from "./pyth/IEntropyV2.sol";

/// @title ClawMachine
/// @notice Pay 1 USDC, get a random slice of tokenized stocks delivered by Pyth Entropy.
/// @dev USD amounts use 6 decimals. Stock prices are USD per whole token (18 decimals of token).
contract ClawMachine is IEntropyConsumer, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_STOCKS = 8;
    uint256 public constant RECENT_PULLS_SIZE = 20;
    uint256 public constant STOCK_UNIT = 1e18;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum PullStatus {
        None,
        Pending,
        Resolved
    }

    struct Pull {
        address player;
        uint64 sequenceNumber;
        PullStatus status;
        bool legendary;
        uint64 requestedAt;
        uint64 resolvedAt;
        uint256 valueUsd6;
    }

    // ---------------------------------------------------------------------
    // Configuration
    // ---------------------------------------------------------------------

    uint256 public pullPrice; // USDC amount per pull, 6 decimals
    uint256 public commonValue; // payout value of a common pull, 6 decimals
    uint256 public legendaryValue; // payout value of a legendary pull, 6 decimals
    uint16 public legendaryBps; // legendary probability in basis points
    uint32 public callbackGasLimit; // entropy callback gas limit
    uint256 public maxPriceAge; // seconds before prices are considered stale

    address public usdc;
    address public entropy;
    address public keeper;
    address public treasury;
    bool public paused;

    // ---------------------------------------------------------------------
    // Inventory and prices
    // ---------------------------------------------------------------------

    address[] private _stocks;
    mapping(address => bool) public isStock;
    mapping(address => uint256) private _prices; // stock => USD per whole token, 6 decimals
    uint64 public pricesUpdatedAt;

    // ---------------------------------------------------------------------
    // Pull state
    // ---------------------------------------------------------------------

    uint256 public totalPulls;
    uint256 public reservedValueUsd6;

    mapping(uint256 => Pull) private _pulls;
    mapping(uint64 => uint256) private _pullIdBySequence;
    mapping(uint256 => uint256) private _pullReservedValue;
    mapping(uint256 => address[]) private _pullStocks;
    mapping(uint256 => uint256[]) private _pullAmounts;

    /// @notice Tokens (stocks or USDC) that could not be delivered and are claimable by the player.
    mapping(address => mapping(address => uint256)) public owed;

    uint256[RECENT_PULLS_SIZE] private _recentPulls;
    uint256 private _recentCursor;
    uint256 private _recentCount;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event PullRequested(
        uint256 indexed pullId, address indexed player, uint64 sequenceNumber, uint256 feePaid
    );
    event PullResolved(
        uint256 indexed pullId,
        address indexed player,
        bool legendary,
        address[] stocks,
        uint256[] amounts,
        uint256 valueUsd6,
        bytes32 randomNumber
    );
    event PricesUpdated(address[] stocks, uint256[] pricesUsd6, uint256 timestamp);
    event PayoutOwed(
        uint256 indexed pullId, address indexed player, address indexed stock, uint256 amount
    );
    event OwedWithdrawn(address indexed player, address indexed token, uint256 amount);

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(
        address usdc_,
        address entropy_,
        address[] memory stocks_,
        address treasury_,
        address keeper_
    ) Ownable(msg.sender) {
        require(usdc_ != address(0) && usdc_.code.length > 0, "invalid usdc");
        require(entropy_ != address(0) && entropy_.code.length > 0, "invalid entropy");
        require(treasury_ != address(0), "invalid treasury");
        require(keeper_ != address(0), "invalid keeper");
        require(stocks_.length > 0 && stocks_.length <= MAX_STOCKS, "invalid stock count");

        usdc = usdc_;
        entropy = entropy_;
        treasury = treasury_;
        keeper = keeper_;

        for (uint256 i = 0; i < stocks_.length; ++i) {
            address stock = stocks_[i];
            require(stock != address(0) && stock.code.length > 0, "invalid stock");
            require(stock != usdc_, "stock is usdc");
            require(!isStock[stock], "duplicate stock");
            isStock[stock] = true;
            _stocks.push(stock);
        }

        pullPrice = 1_000_000; // 1 USDC
        commonValue = 730_000; // 0.73 USD
        legendaryValue = 10_000_000; // 10 USD
        legendaryBps = 200; // 2%
        callbackGasLimit = 800_000;
        maxPriceAge = 900; // 15 minutes
    }

    // ---------------------------------------------------------------------
    // Player actions
    // ---------------------------------------------------------------------

    /// @notice Pull the claw machine. Pays `pullPrice` in USDC and the entropy fee in MON.
    /// @return pullId id of the pull, starting at 1.
    function pull() external payable nonReentrant returns (uint256 pullId) {
        require(!paused, "paused");
        require(canPull(), "cannot pull");

        uint256 fee = getFee();
        require(msg.value >= fee, "insufficient fee");

        pullId = ++totalPulls;

        // Reserve the maximum possible payout for this pull.
        uint256 reserved = legendaryValue;
        _pullReservedValue[pullId] = reserved;
        reservedValueUsd6 += reserved;

        IERC20(usdc).safeTransferFrom(msg.sender, address(this), pullPrice);

        uint64 sequenceNumber = IEntropyV2(entropy).requestV2{value: fee}(callbackGasLimit);

        _pulls[pullId] = Pull({
            player: msg.sender,
            sequenceNumber: sequenceNumber,
            status: PullStatus.Pending,
            legendary: false,
            requestedAt: uint64(block.timestamp),
            resolvedAt: 0,
            valueUsd6: 0
        });
        _pullIdBySequence[sequenceNumber] = pullId;

        emit PullRequested(pullId, msg.sender, sequenceNumber, fee);

        uint256 excess = msg.value - fee;
        if (excess > 0) {
            (bool refunded,) = payable(msg.sender).call{value: excess}("");
            require(refunded, "refund failed");
        }
    }

    /// @notice Withdraw any tokens that were owed because a payout transfer failed.
    function withdrawOwed() external nonReentrant {
        address player = msg.sender;

        uint256 stockCount = _stocks.length;
        for (uint256 i = 0; i < stockCount; ++i) {
            address stock = _stocks[i];
            uint256 amount = owed[player][stock];
            if (amount == 0) continue;

            owed[player][stock] = 0;
            if (!_tryTransfer(stock, player, amount)) {
                owed[player][stock] = amount;
            } else {
                emit OwedWithdrawn(player, stock, amount);
            }
        }

        uint256 usdcOwed = owed[player][usdc];
        if (usdcOwed > 0) {
            owed[player][usdc] = 0;
            if (!_tryTransfer(usdc, player, usdcOwed)) {
                owed[player][usdc] = usdcOwed;
            } else {
                emit OwedWithdrawn(player, usdc, usdcOwed);
            }
        }
    }

    // ---------------------------------------------------------------------
    // Entropy
    // ---------------------------------------------------------------------

    /// @inheritdoc IEntropyConsumer
    function getEntropy() internal view override returns (address) {
        return entropy;
    }

    /// @dev Called by the Entropy contract after the random number is revealed.
    function entropyCallback(uint64 sequence, address, bytes32 randomNumber) internal override {
        uint256 pullId = _pullIdBySequence[sequence];
        if (pullId == 0) return;

        Pull storage currentPull = _pulls[pullId];
        if (currentPull.status != PullStatus.Pending) return;

        address player = currentPull.player;
        bool legendary = uint256(randomNumber) % BPS_DENOMINATOR < legendaryBps;
        uint256 value = legendary ? legendaryValue : commonValue;

        // Release the inventory reservation before any external call.
        uint256 reserved = _pullReservedValue[pullId];
        _pullReservedValue[pullId] = 0;
        if (reservedValueUsd6 >= reserved) {
            reservedValueUsd6 -= reserved;
        } else {
            reservedValueUsd6 = 0;
        }

        (address[] memory payoutStocks, uint256[] memory payoutAmounts) =
            _allocatePayout(player, pullId, value, randomNumber);

        currentPull.status = PullStatus.Resolved;
        currentPull.legendary = legendary;
        currentPull.resolvedAt = uint64(block.timestamp);
        currentPull.valueUsd6 = value;

        _pullStocks[pullId] = payoutStocks;
        _pullAmounts[pullId] = payoutAmounts;
        _pushRecentPull(pullId);

        emit PullResolved(
            pullId, player, legendary, payoutStocks, payoutAmounts, value, randomNumber
        );
    }

    /// @dev Walks the stocks round-robin from a random start, delivering `valueUsd6` of tokens.
    function _allocatePayout(
        address player,
        uint256 pullId,
        uint256 valueUsd6,
        bytes32 randomNumber
    ) private returns (address[] memory stocksOut, uint256[] memory amountsOut) {
        uint256 stockCount = _stocks.length;
        address[] memory stocksBuffer = new address[](stockCount);
        uint256[] memory amountsBuffer = new uint256[](stockCount);
        uint256 count = 0;
        uint256 remaining = valueUsd6;

        if (stockCount > 0) {
            uint256 start = uint256(keccak256(abi.encode(randomNumber, uint256(1)))) % stockCount;

            for (uint256 i = 0; i < stockCount && remaining > 0; ++i) {
                address stock = _stocks[(start + i) % stockCount];
                (uint256 amount, uint256 paid) =
                    _allocateFromStock(player, pullId, stock, remaining);
                if (amount == 0) continue;

                remaining = paid >= remaining ? 0 : remaining - paid;
                stocksBuffer[count] = stock;
                amountsBuffer[count] = amount;
                ++count;
            }
        }

        // Inventory could not cover the whole payout: cover the rest in USDC.
        if (remaining > 0) {
            if (!_tryTransfer(usdc, player, remaining)) {
                owed[player][usdc] += remaining;
                emit PayoutOwed(pullId, player, usdc, remaining);
            }
        }

        stocksOut = new address[](count);
        amountsOut = new uint256[](count);
        for (uint256 i = 0; i < count; ++i) {
            stocksOut[i] = stocksBuffer[i];
            amountsOut[i] = amountsBuffer[i];
        }
    }

    /// @dev Takes as much of `remainingUsd6` as possible from a single stock.
    ///      Never reverts on a failed token transfer; the amount is recorded as owed instead.
    function _allocateFromStock(
        address player,
        uint256 pullId,
        address stock,
        uint256 remainingUsd6
    ) private returns (uint256 amount, uint256 paid) {
        uint256 price = _prices[stock];
        if (price == 0) return (0, 0);

        uint256 balance = IERC20(stock).balanceOf(address(this));
        if (balance == 0) return (0, 0);

        uint256 available = (balance * price) / STOCK_UNIT;
        uint256 take = remainingUsd6 < available ? remainingUsd6 : available;
        if (take == 0) return (0, 0);

        // Round the token amount up so a single stock can cover the requested USD value
        // without leaving 1-wei dust that would trigger a second token transfer.
        amount = (take * STOCK_UNIT + price - 1) / price;
        if (amount == 0) return (0, 0);
        if (amount > balance) amount = balance;

        paid = (amount * price) / STOCK_UNIT;
        if (paid == 0) return (0, 0);

        if (!_tryTransfer(stock, player, amount)) {
            owed[player][stock] += amount;
            emit PayoutOwed(pullId, player, stock, amount);
        }
    }

    /// @dev Low-level ERC20 transfer that returns false instead of reverting.
    function _tryTransfer(address token, address to, uint256 amount) private returns (bool) {
        (bool success, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        if (!success) return false;
        if (data.length == 0) return true;
        if (data.length != 32) return false;
        return abi.decode(data, (bool));
    }

    function _pushRecentPull(uint256 pullId) private {
        _recentPulls[_recentCursor] = pullId;
        _recentCursor = (_recentCursor + 1) % RECENT_PULLS_SIZE;
        if (_recentCount < RECENT_PULLS_SIZE) {
            ++_recentCount;
        }
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Entropy fee in MON for the configured callback gas limit.
    function getFee() public view returns (uint256) {
        return uint256(IEntropyV2(entropy).getFeeV2(callbackGasLimit));
    }

    /// @notice Whether a new pull can be served right now.
    function canPull() public view returns (bool) {
        if (paused) return false;
        if (_stocks.length == 0) return false;
        if (pricesUpdatedAt == 0) return false;
        if (block.timestamp - uint256(pricesUpdatedAt) > maxPriceAge) return false;

        uint256 stockCount = _stocks.length;
        for (uint256 i = 0; i < stockCount; ++i) {
            if (_prices[_stocks[i]] == 0) return false;
        }

        return inventoryValueUsd6() >= reservedValueUsd6 + legendaryValue;
    }

    /// @notice Total USD value of the stock inventory held by the machine (6 decimals).
    function inventoryValueUsd6() public view returns (uint256 total) {
        uint256 stockCount = _stocks.length;
        for (uint256 i = 0; i < stockCount; ++i) {
            address stock = _stocks[i];
            uint256 price = _prices[stock];
            if (price == 0) continue;
            total += (IERC20(stock).balanceOf(address(this)) * price) / STOCK_UNIT;
        }
    }

    function getStocks() external view returns (address[] memory) {
        return _stocks;
    }

    function getPrices() external view returns (uint256[] memory pricesUsd6, uint256 updatedAt) {
        uint256 stockCount = _stocks.length;
        pricesUsd6 = new uint256[](stockCount);
        for (uint256 i = 0; i < stockCount; ++i) {
            pricesUsd6[i] = _prices[_stocks[i]];
        }
        updatedAt = uint256(pricesUpdatedAt);
    }

    function getPull(uint256 pullId) external view returns (Pull memory) {
        return _pulls[pullId];
    }

    function getPullPayout(uint256 pullId)
        external
        view
        returns (address[] memory stocks, uint256[] memory amounts)
    {
        return (_pullStocks[pullId], _pullAmounts[pullId]);
    }

    /// @notice Newest-first ids of the last `count` resolved pulls (capped at 20).
    function getRecentPulls(uint256 count) external view returns (uint256[] memory pullIds) {
        uint256 available = _recentCount;
        if (count > available) count = available;

        pullIds = new uint256[](count);
        for (uint256 i = 0; i < count; ++i) {
            uint256 index = (_recentCursor + RECENT_PULLS_SIZE - 1 - i) % RECENT_PULLS_SIZE;
            pullIds[i] = _recentPulls[index];
        }
    }

    // ---------------------------------------------------------------------
    // Keeper
    // ---------------------------------------------------------------------

    function setPrices(address[] calldata stocks, uint256[] calldata pricesUsd6) external {
        require(msg.sender == keeper, "not keeper");
        require(stocks.length == pricesUsd6.length, "length mismatch");
        require(stocks.length > 0, "empty");

        for (uint256 i = 0; i < stocks.length; ++i) {
            require(isStock[stocks[i]], "unknown stock");
            _prices[stocks[i]] = pricesUsd6[i];
        }

        pricesUpdatedAt = uint64(block.timestamp);
        emit PricesUpdated(stocks, pricesUsd6, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Owner
    // ---------------------------------------------------------------------

    function setKeeper(address newKeeper) external onlyOwner {
        require(newKeeper != address(0), "invalid keeper");
        keeper = newKeeper;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "invalid treasury");
        treasury = newTreasury;
    }

    function setPullConfig(
        uint256 newPullPrice,
        uint256 newCommonValue,
        uint256 newLegendaryValue,
        uint16 newLegendaryBps
    ) external onlyOwner {
        require(newLegendaryBps <= BPS_DENOMINATOR, "invalid bps");
        pullPrice = newPullPrice;
        commonValue = newCommonValue;
        legendaryValue = newLegendaryValue;
        legendaryBps = newLegendaryBps;
    }

    function setCallbackGasLimit(uint32 newCallbackGasLimit) external onlyOwner {
        callbackGasLimit = newCallbackGasLimit;
    }

    function setMaxPriceAge(uint256 newMaxPriceAge) external onlyOwner {
        maxPriceAge = newMaxPriceAge;
    }

    function pause() external onlyOwner {
        paused = true;
    }

    function unpause() external onlyOwner {
        paused = false;
    }

    function withdrawUsdc(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "invalid recipient");
        IERC20(usdc).safeTransfer(to, amount);
    }

    function withdrawStock(address stock, address to, uint256 amount) external onlyOwner {
        require(isStock[stock], "unknown stock");
        require(to != address(0), "invalid recipient");
        IERC20(stock).safeTransfer(to, amount);
    }
}
