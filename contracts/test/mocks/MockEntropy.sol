// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEntropyConsumer} from "../../src/interfaces/IEntropy.sol";

contract MockEntropy {
    uint256 public fee = 0.001 ether; // 0.001 MON
    uint64 private nextSequence = 1;
    address public defaultProvider = 0x52DeaA1c84233F7bb8C8A45baeDE41091c616506;

    mapping(uint64 => address) public sequenceToConsumer;

    function setFee(uint256 newFee) external {
        fee = newFee;
    }

    function setDefaultProvider(address provider) external {
        defaultProvider = provider;
    }

    function getFeeV2(address /* provider */) external view returns (uint256) {
        return fee;
    }

    function getDefaultProvider() external view returns (address) {
        return defaultProvider;
    }

    function requestV2(
        address, /* provider */
        bytes32, /* userRandomNumber */
        bool /* useBlockhash */
    ) external payable returns (uint64 sequenceNumber) {
        require(msg.value >= fee, "Insufficient fee");

        sequenceNumber = nextSequence++;
        sequenceToConsumer[sequenceNumber] = msg.sender;

        return sequenceNumber;
    }

    /**
     * @notice Fulfill with specific roll value (0-9999) for testing
     */
    function fulfillWithRoll(uint64 sequenceNumber, uint256 roll) external {
        require(roll < 10000, "Roll must be < 10000");
        bytes32 randomNumber = bytes32(roll);
        _fulfillRequest(sequenceNumber, randomNumber);
    }

    /**
     * @notice Simulate entropy callback with specific random number
     */
    function fulfillRequest(uint64 sequenceNumber, bytes32 randomNumber) external {
        _fulfillRequest(sequenceNumber, randomNumber);
    }

    function _fulfillRequest(uint64 sequenceNumber, bytes32 randomNumber) internal {
        address consumer = sequenceToConsumer[sequenceNumber];
        require(consumer != address(0), "Invalid sequence");

        IEntropyConsumer(consumer).entropyCallback(
            sequenceNumber,
            defaultProvider,
            randomNumber
        );
    }
}
