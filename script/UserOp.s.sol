// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script} from "forge-std/Script.sol";

import {EntryPoint} from "src/core/EntryPoint.sol";
import {PackedUserOperation} from "src/interfaces/PackedUserOperation.sol";
import "forge-std/console.sol";

contract UserOp is Script {

    struct UserOp {
        address sender;
        uint256 nonce;
        bytes initCode;
        bytes callData;
        uint256 callGasLimit;
        uint256 verificationGasLimit;
        uint256 preVerificationGas;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        bytes paymasterAndData;
        bytes signature;
    }

    function run()
        external
    {
        uint256 signer = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address signerAddress = vm.addr(signer);
        address entryPointAddress = vm.envAddress("ENTRY_POINT_ADDRESS");
        uint256 chainId = vm.envUint("CHAIN_ID");

        UserOp memory userOp = UserOp({
            sender: signerAddress,
            nonce: 0,
            initCode: "",
            callData: "",
            callGasLimit: 0,
            verificationGasLimit: 0,
            preVerificationGas: 0,
            maxFeePerGas: 0,
            maxPriorityFeePerGas: 0,
            paymasterAndData: bytes(""),
            signature: bytes("")
        });

      // encodeUserOp
        bytes memory encodedUserOp = abi.encode(
          userOp.sender, // sender
          userOp.nonce, // nonce
          keccak256(userOp.initCode), // initCode
          keccak256(userOp.callData), // callData
          userOp.accountGasLimits, // accountGasLimits
          userOp.preVerificationGas, // preVerificationGas
          userOp.gasFees, // gasFees
          keccak256(userOp.paymasterAndData) // paymasterAndData
        );
            
        bytes32 userOpHash = keccak256(abi.encode(keccak256(encodedUserOp), entryPointAddress, chainId ));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signer, userOpHash);
        userOp.signature = abi.encodePacked(r, s, v);

        string memory userOpJson = "userOp";
        vm.serializeAddress(userOpJson, "sender", userOp.sender);
        vm.serializeUint(userOpJson, "nonce", userOp.nonce); 
        vm.serializeBytes(userOpJson, "initCode", userOp.initCode);
        vm.serializeBytes(userOpJson, "callData", userOp.callData);
        vm.serializeBytes32(userOpJson, "accountGasLimits", userOp.accountGasLimits);
        vm.serializeUint(userOpJson, "preVerificationGas", userOp.preVerificationGas);
        vm.serializeBytes32(userOpJson, "gasFees", userOp.gasFees);
        vm.serializeBytes(userOpJson, "paymasterAndData", userOp.paymasterAndData);
        string memory finalJson = vm.serializeBytes(userOpJson, "signature", userOp.signature);
        vm.writeJson(finalJson, "./out/userOp.json");
    }
}
