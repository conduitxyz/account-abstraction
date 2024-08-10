// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";

import {IEntryPoint} from "src/interfaces/IEntryPoint.sol";
import {SimpleAccountFactory} from "src/samples/SimpleAccountFactory.sol";
import {TestCounter} from "src/test/TestCounter.sol";
import "forge-std/console.sol";

contract Deploy is Script {
    function run()
        external
        returns (SimpleAccountFactory accountFactory, TestCounter testCounter)
    {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);

        console.log("Deploying SimpleAccountFactory");
        accountFactory = new SimpleAccountFactory{salt: bytes32(0)}(
            IEntryPoint(0x0000000071727De22E5E9d8BAf0edAc6f37da032)
        );

        console.log("Deploying TestCounter");
        testCounter = new TestCounter{salt: bytes32(0)}();

        vm.stopBroadcast();

        vm.writeFile(
            "./out/aa",
            vm.toString(address(0x0000000071727De22E5E9d8BAf0edAc6f37da032))
        );
    }
}
