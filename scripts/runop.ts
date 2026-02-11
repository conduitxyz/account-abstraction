import 'dotenv/config'
// run a single op
// "yarn run runop [--network ...]"

import { ethers } from 'ethers'
import { AASigner, rpcUserOpSender } from '../src/AASigner'
import { TestCounter__factory, EntryPoint__factory } from '../typechain'
import { parseEther } from 'ethers/lib/utils'
import { providers } from 'ethers'
import {
  TEST_COUNTER_ADDRESS
} from '../src/constants'
import { getEntryPointAddress, getSimpleAccountFactoryAddress, parseScriptArgs } from './args'

(async () => {
  const rpcUrl = process.env.RPC_URL;
  const aaUrl = process.env.AA_URL;
  const aaIndex = parseInt(process.env.AA_INDEX ?? '0'); // an account can have multiple addresses (with different index)
  const signerPrivateKey = process.env.SIGNER_PRIVATE_KEY;
  const { version, isEip7702 } = parseScriptArgs()

  if (rpcUrl == null || aaUrl == null || signerPrivateKey == null) {
    console.error('ERROR: must set RPC_URL, AA_URL, SIGNER_PRIVATE_KEY')
    process.exit(1)
  }

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
  const signer = new ethers.Wallet(signerPrivateKey, provider)
  const entryPointAddress = getEntryPointAddress(version)
  const accountFactoryAddress = getSimpleAccountFactoryAddress(version)
  const targetAccountAddress = isEip7702 ? signer.address : undefined

  // make sure that the node supports our EntryPoint
  const aaProvider = new providers.JsonRpcProvider(aaUrl)
  const supportedEntryPoints: string[] = await aaProvider
    .send('eth_supportedEntryPoints', [])
    .then(ret => ret.map(ethers.utils.getAddress))
  if (!supportedEntryPoints.includes(entryPointAddress)) {
    console.error(`ERROR: ${aaUrl} does not support our EntryPoint`)
    process.exit(1)
  }
  if (isEip7702 && version === '0.7') {
    console.error('ERROR: --eip7702 only supports --entrypoint08/--v08 or --entrypoint09/--v09')
    process.exit(1)
  }
  const useEip712 = version !== '0.7'
  const aaSigner = new AASigner(
    signer,
    entryPointAddress,
    rpcUserOpSender(aaProvider, entryPointAddress),
    accountFactoryAddress,
    aaIndex,
    undefined,
    targetAccountAddress,
    useEip712
  )

  const aaAccountAddress = await aaSigner.getAddress()
  const code = await provider.getCode(aaAccountAddress);
  const isPhantom = code.length <= 2

  if (isEip7702) {
    if (isPhantom) {
      console.error(`ERROR: EIP-7702 account ${aaAccountAddress} has no delegation. Run "yarn run createAccount --eip7702" first`)
      process.exit(1)
    }
    console.log(`Using EIP-7702 account ${aaAccountAddress} (delegated)`)
  } else if (isPhantom && version === '0.7') {
    console.error(`ERROR: SimpleAccount for ${signer.address} index ${aaIndex} does not exist. Run "yarn run createAccount" first`)
    process.exit(1);
  } else if (isPhantom) {
    console.log(`Account ${aaAccountAddress} not yet deployed -- will be created with this UserOp via initCode`)
  } else {
    console.log(`Using account ${aaAccountAddress}`)
  }

  const entryPoint = EntryPoint__factory.connect(entryPointAddress, signer)
  const aaAccountGasBalance = await entryPoint.balanceOf(aaAccountAddress)
  if (aaAccountGasBalance.eq(parseEther('0'))) {
    console.error(`ERROR: ${aaAccountAddress} has no ether for gas. Run "yarn run fundAccount" first`)
    process.exit(1);
  }

  // NOTE: this can be modified to send any kind of UserOp with the correct typechain types.
  // Just replace the `testCounter.justemit()` call with your own contract call.
  const testCounter = TestCounter__factory.connect(TEST_COUNTER_ADDRESS, aaSigner)
  const tx = await testCounter.justemit()
  console.log(`Sent tx ${tx.hash}`)
  await tx.wait()
})()
