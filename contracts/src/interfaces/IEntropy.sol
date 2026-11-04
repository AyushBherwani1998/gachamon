// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IEntropy
 * @notice Interface for Pyth Entropy on-chain randomness
 */
interface IEntropy {
    /**
     * @notice Request a random number using V2 API
     * @param provider The entropy provider address
     * @param userRandomNumber User-provided random number for additional entropy
     * @param useBlockhash Whether to use blockhash as entropy source
     * @return sequenceNumber The sequence number for this request
     */
    function requestV2(
        address provider,
        bytes32 userRandomNumber,
        bool useBlockhash
    ) external payable returns (uint64 sequenceNumber);

    /**
     * @notice Get the fee for requesting randomness
     * @param provider The entropy provider address
     * @return feeAmount The fee in native token (MON on Monad)
     */
    function getFeeV2(address provider) external view returns (uint256 feeAmount);

    /**
     * @notice Get the default entropy provider
     * @return provider The default provider address
     */
    function getDefaultProvider() external view returns (address provider);
}

/**
 * @title IEntropyConsumer
 * @notice Interface that consumers of Pyth Entropy must implement
 */
interface IEntropyConsumer {
    /**
     * @notice Callback function called by Pyth Entropy with random number
     * @param sequenceNumber The sequence number of the request
     * @param provider The entropy provider that fulfilled the request
     * @param randomNumber The random number generated
     */
    function entropyCallback(
        uint64 sequenceNumber,
        address provider,
        bytes32 randomNumber
    ) external;
}
