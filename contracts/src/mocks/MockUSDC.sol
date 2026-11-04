// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDC
 * @notice Testnet-only USDC with a public faucet. Mainnet uses the real USDC.
 */
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /**
     * @notice Mint 100 USDC to the caller.
     */
    function faucet() external {
        _mint(msg.sender, 100_000_000);
    }

    /**
     * @notice Open mint used by deploy scripts and tests.
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
