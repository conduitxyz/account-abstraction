# Conduit Account Abstraction Scripts

## Installation
```bash
yarn
```

## Setup
Create a `.env` file like `.example.env` and fill it with your network’s `RPC_URL` and a `SIGNER_PRIVATE_KEY`.  
If Conduit’s bundler is already deployed for your network, you can also set `AA_URL` in the `.env` file, which is required only for the `runop` script.

These scripts are designed to be used with Conduit’s ERC-4337 predeploys:
```
EntryPoint v0.7.0:     0x0000000071727De22E5E9d8BAf0edAc6f37da032
SimpleAccountFactory:  0x0ACDDd4868E24aad6A16573b416133F58795A916
TestCounter:           0x475d5a5B128c1846b86493b357e75E27201447B7
```
However, they should work on any chain where these contracts are present.

## Creating an Account
```bash
yarn createAccount
```

## Funding an Account
```bash
yarn fundAccount
```
This will take `0.01` ether from the account associated with `SIGNER_PRIVATE_KEY` and deposit it on behalf of the account you created in the previous step.

## Sending a Test Transaction
```bash
yarn runop
```
The UserOp sent by this script emits a log from the `TestCounter` contract.  
You can modify it to send any kind of UserOp with the correct **TypeChain** types.
