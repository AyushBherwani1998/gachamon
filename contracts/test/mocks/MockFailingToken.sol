// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockFailingToken is ERC20 {
    bool public shouldFail;

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}

    function multiplier() external pure returns (uint256) {
        return 1e18;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setShouldFail(bool _shouldFail) external {
        shouldFail = _shouldFail;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (shouldFail) {
            return false; // Simulate transfer failure
        }
        return super.transfer(to, amount);
    }
}
