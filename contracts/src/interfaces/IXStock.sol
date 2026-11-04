// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IXStock
 * @notice Minimal rebasing xStock interface. One whole xStock unit is `multiplier()`
 *         underlying-share units; `balanceOf` is already denominated in those units.
 */
interface IXStock {
    function multiplier() external view returns (uint256);
}
