import 'dotenv/config'
import { ethers } from 'ethers'
import { EntryPoint__factory, SimpleAccountFactory__factory } from '../typechain'
import { getEntryPointAddress, getSimpleAccountFactoryAddress, parseScriptArgs } from './args'
import { parseEther, formatEther } from 'ethers/lib/utils'

const ethDepositAmount = process.env.ETHER_DEPOSIT_AMOUNT ?? '0.0015';

(async () => {
  const rpcUrl = process.env.RPC_URL;
  const aaIndex = parseInt(process.env.AA_INDEX ?? '0'); // an account can have multiple addresses (with different index)
  const signerPrivateKey = process.env.SIGNER_PRIVATE_KEY;
  const { version, isEip7702 } = parseScriptArgs()

  if (rpcUrl == null || signerPrivateKey == null || aaIndex == null) {
    console.error('ERROR: must set RPC_URL, SIGNER_PRIVATE_KEY (optional: AA_INDEX)')
    process.exit(1)
  }

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
  const signer = new ethers.Wallet(signerPrivateKey, provider)

  const entryPointAddress = getEntryPointAddress(version)
  const entryPoint = EntryPoint__factory.connect(entryPointAddress, signer)
  let targetAccountAddress: string

  if (isEip7702) {
    if (version === '0.7') {
      console.error('ERROR: --eip7702 only supports --entrypoint08/--v08 or --entrypoint09/--v09')
      process.exit(1)
    }
    targetAccountAddress = signer.address
  } else {
    const accountFactoryAddress = getSimpleAccountFactoryAddress(version)
    const accountFactory = SimpleAccountFactory__factory.connect(accountFactoryAddress, signer)
    targetAccountAddress = await accountFactory.getAddress(signer.address, aaIndex)
  }

  console.log(`Depositing ${ethDepositAmount} ether to ${targetAccountAddress} (entrypoint ${entryPointAddress})`)
  const oldBalance = await entryPoint.balanceOf(targetAccountAddress)
  console.log(`Old account balance: ${formatEther(oldBalance)}`);
  
  const tx = await entryPoint.depositTo(targetAccountAddress, { value: parseEther(ethDepositAmount) })
  await tx.wait()

  const newBalance = await entryPoint.balanceOf(targetAccountAddress)
  console.log(`New account balance: ${formatEther(newBalance)}`)
})()
