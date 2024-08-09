import { ethers } from 'ethers'
import { SimpleAccountFactory__factory } from '../typechain'
import { SIMPLE_ACCOUNT_FACTORY_ADDRESS } from '../src/constants'

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

  const accountAddress = await accountFactory.getAddress(signer.address, aaIndex)

  console.log('deploying account to', accountAddress)
  const code = await provider.getCode(accountAddress);
  if (code.length > 2) {
    console.log('account already exists');
  } else {
    const tx = await accountFactory.createAccount(signer.address, aaIndex)
    console.log('account created, tx hash:', tx.hash)
    await tx.wait()
  }
})()
