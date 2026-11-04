// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PythStructs} from "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

contract MockPyth {
    uint256 public updateFee = 0.0001 ether; // 0.0001 MON per update
    
    mapping(bytes32 => PythStructs.Price) private prices;
    mapping(bytes32 => uint256) private publishTimes;

    function setUpdateFee(uint256 newFee) external {
        updateFee = newFee;
    }

    function setPrice(bytes32 id, int64 price, uint64 conf, int32 expo, uint publishTime) external {
        prices[id] = PythStructs.Price({
            price: price,
            conf: conf,
            expo: expo,
            publishTime: publishTime
        });
        publishTimes[id] = publishTime;
    }

    function getUpdateFee(bytes[] calldata /* updateData */) external view returns (uint256) {
        return updateFee;
    }

    function updatePriceFeeds(bytes[] calldata /* updateData */) external payable {
        require(msg.value >= updateFee, "Insufficient fee");
        // Mock: just accept the payment, don't actually parse updateData
    }

    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (PythStructs.Price memory) {
        require(publishTimes[id] > 0, "Price not found");
        require(block.timestamp - publishTimes[id] <= age, "Price too stale");
        return prices[id];
    }

    function getPriceUnsafe(bytes32 id) external view returns (PythStructs.Price memory) {
        require(publishTimes[id] > 0, "Price not found");
        return prices[id];
    }

    function getPrice(bytes32 id) external view returns (PythStructs.Price memory) {
        require(publishTimes[id] > 0, "Price not found");
        return prices[id];
    }
}
