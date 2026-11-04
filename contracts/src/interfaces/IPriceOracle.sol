// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPriceOracle
 * @notice Interface for decentralized price oracles (Chainlink, Pyth, etc.)
 */
interface IPriceOracle {
    /**
     * @notice Get the price of a token in USDC (6 decimals)
     * @param token The token address
     * @return price The price per 1e18 token units in USDC (6 decimals)
     * @return timestamp The timestamp of the price update
     */
    function getPrice(address token) external view returns (uint256 price, uint256 timestamp);

    /**
     * @notice Get prices for multiple tokens
     * @param tokens Array of token addresses
     * @return prices Array of prices per 1e18 token units in USDC (6 decimals)
     * @return timestamp The timestamp of the price update
     */
    function getPrices(address[] calldata tokens) 
        external 
        view 
        returns (uint256[] memory prices, uint256 timestamp);
}
