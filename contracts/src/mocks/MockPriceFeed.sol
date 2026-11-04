// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockPriceFeed
 * @notice AggregatorV3-compatible feed for Monad testnet, which has no Chainlink
 *         equity feeds. `setAnswer` also refreshes `updatedAt` to the current block.
 */
contract MockPriceFeed is Ownable {
    int256 private _answer;
    uint256 private _updatedAt;
    uint8 private immutable _decimals;

    constructor(int256 initialAnswer, uint8 decimals_) Ownable(msg.sender) {
        _answer = initialAnswer;
        _decimals = decimals_;
        _updatedAt = block.timestamp;
    }

    function setAnswer(int256 newAnswer) external onlyOwner {
        _answer = newAnswer;
        _updatedAt = block.timestamp;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (1, _answer, _updatedAt, _updatedAt, 1);
    }
}
