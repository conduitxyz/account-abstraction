import { ethers } from 'ethers'
import { SimpleAccountFactory__factory } from '../typechain'
import { SIMPLE_ACCOUNT_FACTORY_ADDRESS } from '../src/constants'

(async () => {
  try {
    const rpcUrl = process.env.RPC_URL;
    const aaIndexRaw = process.env.AA_INDEX ?? '0'; // an account can have multiple addresses (with different index)
    const signerPrivateKey = process.env.SIGNER_PRIVATE_KEY;

    const aaIndex = Number(aaIndexRaw);

    if (!rpcUrl || !signerPrivateKey || !Number.isInteger(aaIndex) || aaIndex < 0) {
      console.error('ERROR: must set RPC_URL, SIGNER_PRIVATE_KEY and a valid AA_INDEX (integer >= 0)')
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
  } catch (err) {
    console.error('Unexpected error:', (err as Error).message ?? err)
    process.exit(1)
  }
})()
