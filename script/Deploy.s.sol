// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";

import {EntryPoint} from "src/core/EntryPoint.sol";
import {SimpleAccountFactory} from "src/samples/SimpleAccountFactory.sol";
import {TestCounter} from "src/test/TestCounter.sol";
import "forge-std/console.sol";

contract Deploy is Script {
    function run()
        external
        returns (
            EntryPoint entryPoint,
            SimpleAccountFactory accountFactory,
            TestCounter testCounter
        )
    {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);
        console.log("Deploying EntryPoint");
        entryPoint = new EntryPoint();

        console.log("Deploying SimpleAccountFactory");
        accountFactory = new SimpleAccountFactory(entryPoint);

        console.log("Deploying TestCounter");
        testCounter = new TestCounter();

        vm.stopBroadcast();
    }
}
