// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IEntropyV2} from "../src/pyth/IEntropyV2.sol";
import {EntropyStructsV2} from "../src/pyth/EntropyStructsV2.sol";
import {IEntropyConsumer} from "../src/pyth/IEntropyConsumer.sol";

/// @notice Minimal Pyth Entropy V2 stand-in for tests.
contract MockEntropy is IEntropyV2 {
    uint128 public fee;
    uint64 public nextSequenceNumber = 1;

    mapping(uint64 => address) public consumerOf;

    constructor(uint128 fee_) {
        fee = fee_;
    }

    function setFee(uint128 newFee) external {
        fee = newFee;
    }

    function getFeeV2(uint32) external view returns (uint128) {
        return fee;
    }

    function getFeeV2() external view returns (uint128) {
        return fee;
    }

    function getFeeV2(address, uint32) external view returns (uint128) {
        return fee;
    }

    function getDefaultProvider() external view returns (address) {
        return address(this);
    }

    function requestV2(uint32) external payable returns (uint64 assignedSequenceNumber) {
        require(msg.value >= fee, "MockEntropy: insufficient fee");
        assignedSequenceNumber = nextSequenceNumber++;
        consumerOf[assignedSequenceNumber] = msg.sender;
    }

    function requestV2() external payable returns (uint64 assignedSequenceNumber) {
        require(msg.value >= fee, "MockEntropy: insufficient fee");
        assignedSequenceNumber = nextSequenceNumber++;
        consumerOf[assignedSequenceNumber] = msg.sender;
    }

    function requestV2(address, uint32) external payable returns (uint64 assignedSequenceNumber) {
        require(msg.value >= fee, "MockEntropy: insufficient fee");
        assignedSequenceNumber = nextSequenceNumber++;
        consumerOf[assignedSequenceNumber] = msg.sender;
    }

    function requestV2(address, bytes32, uint32)
        external
        payable
        returns (uint64 assignedSequenceNumber)
    {
        require(msg.value >= fee, "MockEntropy: insufficient fee");
        assignedSequenceNumber = nextSequenceNumber++;
        consumerOf[assignedSequenceNumber] = msg.sender;
    }

    function getProviderInfoV2(address)
        external
        pure
        returns (EntropyStructsV2.ProviderInfo memory info)
    {
        return info;
    }

    function getRequestV2(address, uint64)
        external
        pure
        returns (EntropyStructsV2.Request memory request)
    {
        return request;
    }

    /// @notice Deliver a random number to the consumer that made the request.
    function fulfill(uint64 sequenceNumber, bytes32 randomNumber) external {
        address consumer = consumerOf[sequenceNumber];
        require(consumer != address(0), "MockEntropy: unknown sequence");
        IEntropyConsumer(consumer)._entropyCallback(sequenceNumber, address(this), randomNumber);
    }

    /// @notice Deliver an arbitrary callback (used to test unknown-sequence handling).
    function deliver(address consumer, uint64 sequenceNumber, bytes32 randomNumber) external {
        IEntropyConsumer(consumer)._entropyCallback(sequenceNumber, address(this), randomNumber);
    }
}
