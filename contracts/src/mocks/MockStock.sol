// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Testnet-only tokenized stock. Mainnet uses the real xStocks.
contract MockStock is ERC20, Ownable {
    bool public transfersBlocked;

    constructor(
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {}

    function decimals() public pure override returns (uint8) {
        return 18;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Used by tests to exercise the owed-payout path. Starts disabled.
    function setTransfersBlocked(bool blocked) external onlyOwner {
        transfersBlocked = blocked;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(
            !transfersBlocked || from == address(0) || to == address(0),
            "transfers blocked"
        );
        super._update(from, to, value);
    }
}
