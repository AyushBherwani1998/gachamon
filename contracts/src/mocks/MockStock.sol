// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockStock
 * @notice Testnet-only tokenized stock. Mainnet uses the real xStocks.
 */
contract MockStock is ERC20, Ownable {
    uint256 private _multiplier = 1e18;

    constructor(string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
        Ownable(msg.sender)
    {}

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    /// @dev Matches the real rebasing xStocks. Testnet mocks default to 1e18.
    function multiplier() external view returns (uint256) {
        return _multiplier;
    }

    function setMultiplier(uint256 newMultiplier) external onlyOwner {
        require(newMultiplier > 0, "Invalid multiplier");
        _multiplier = newMultiplier;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
