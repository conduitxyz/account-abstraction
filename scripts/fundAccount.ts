import { BigNumber, ethers } from 'ethers'
import { EntryPoint__factory, SimpleAccountFactory__factory } from '../typechain'
import { ENTRYPOINT_0_7_0_ADDRESS, SIMPLE_ACCOUNT_FACTORY_ADDRESS } from '../src/constants'
import { parseEther, parseUnits, formatEther } from 'ethers/lib/utils'

const ETHER_DEPOSIT_AMOUNT = '0.001';

(async () => {
  const rpcUrl = process.env.RPC_URL;
  const aaIndex = parseInt(process.env.AA_INDEX ?? '0'); // an account can have multiple addresses (with different index)
  const signerPrivateKey = process.env.SIGNER_PRIVATE_KEY;

  if (rpcUrl == null || signerPrivateKey == null || aaIndex == null) {
    console.error('ERROR: must set RPC_URL, AA_URL, SIGNER_PRIVATE_KEY')
    process.exit(1)
  }

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
  const signer = new ethers.Wallet(signerPrivateKey, provider)

  const accountFactory = SimpleAccountFactory__factory.connect(SIMPLE_ACCOUNT_FACTORY_ADDRESS, signer)
  const entryPoint = EntryPoint__factory.connect(ENTRYPOINT_0_7_0_ADDRESS, signer)
  const accountAddress = await accountFactory.getAddress(signer.address, aaIndex)

  console.log(`Depositing ${ETHER_DEPOSIT_AMOUNT} ether`)
  const oldBalance = await entryPoint.balanceOf(accountAddress)
  console.log(`Old account balance: ${formatEther(oldBalance)}`);
  
  const tx = await entryPoint.depositTo(accountAddress, { value: parseEther(ETHER_DEPOSIT_AMOUNT) })
  await tx.wait()

  const newBalance = await entryPoint.balanceOf(accountAddress)
  console.log(`New account balance: ${formatEther(newBalance)}`)
})()
