import 'dotenv/config'
import { ethers } from 'ethers'
import { Hex, createWalletClient, defineChain, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { SimpleAccountFactory__factory } from '../typechain'
import { getEntryPointAddress, getSimple7702DelegateAddress, getSimpleAccountFactoryAddress, parseScriptArgs } from './args'

function getDelegatedAddressFromCode(code: string): string | null {
  if (code === '0x') {
    return null
  }
  if (!code.startsWith('0xef0100')) {
    throw new Error('Account has non-7702 code')
  }
  if (code.length !== 48) {
    throw new Error(`Unexpected 7702 delegated code length: ${code.length}`)
  }
  return ethers.utils.getAddress(`0x${code.slice(8)}`)
}

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

  if (isEip7702) {
    if (version === '0.7') {
      console.error('ERROR: --eip7702 only supports --entrypoint08/--v08 or --entrypoint09/--v09')
      process.exit(1)
    }

    const delegateAddress = getSimple7702DelegateAddress(version)
    const currentCode = await provider.getCode(signer.address)
    const delegatedAddress = getDelegatedAddressFromCode(currentCode)

    if (delegatedAddress != null) {
      if (delegatedAddress.toLowerCase() === delegateAddress.toLowerCase()) {
        console.log(`Signer ${signer.address} already delegated to ${delegateAddress}`)
        console.log(`EntryPoint version: ${version}`)
        console.log(`EntryPoint address: ${getEntryPointAddress(version)}`)
        console.log(`EIP7702 account: ${signer.address}`)
        process.exit(0)
      }
      console.log(`Signer ${signer.address} currently delegated to ${delegatedAddress}, re-delegating to ${delegateAddress}`)
    }

    const chainId = await provider.getNetwork().then(net => net.chainId)
    const chain = defineChain({
      id: chainId,
      name: `rpc-${chainId}`,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: {
        default: {
          http: [rpcUrl]
        }
      }
    })
    const account = privateKeyToAccount(signerPrivateKey as Hex)
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl)
    })

    const authorization = await walletClient.signAuthorization({
      account,
      contractAddress: delegateAddress as Hex,
      executor: 'self'
    })
    const txHash = await walletClient.sendTransaction({
      account,
      authorizationList: [authorization],
      to: account.address,
      data: '0x',
      // EIP-7702 intrinsic gas: 21000 base + 25000 per authorization
      gas: 100000n
    })

    await provider.waitForTransaction(txHash)

    const delegatedCode = await provider.getCode(signer.address)
    const delegatedTo = getDelegatedAddressFromCode(delegatedCode)
    if (delegatedTo == null || delegatedTo.toLowerCase() !== delegateAddress.toLowerCase()) {
      console.error('ERROR: delegation transaction sent but account is not delegated as expected')
      process.exit(1)
    }

    console.log(`EntryPoint version: ${version}`)
    console.log(`EntryPoint address: ${getEntryPointAddress(version)}`)
    console.log(`Simple7702Account delegate: ${delegateAddress}`)
    console.log(`EIP7702 account: ${signer.address}`)
    console.log(`Delegation tx hash: ${txHash}`)
    process.exit(0)
  }

  const accountFactoryAddress = getSimpleAccountFactoryAddress(version)
  const accountFactory = SimpleAccountFactory__factory.connect(accountFactoryAddress, signer)

  const accountAddress = await accountFactory.getAddress(signer.address, aaIndex)

  console.log('deploying account to', accountAddress)
  console.log(`EntryPoint version: ${version}`)
  console.log(`Factory address: ${accountFactoryAddress}`)
  const code = await provider.getCode(accountAddress);
  if (code.length > 2) {
    console.log('account already exists');
  } else if (version === '0.8' || version === '0.9') {
    // v0.8/v0.9 SimpleAccountFactory restricts createAccount to SenderCreator only,
    // so it cannot be called directly. The account will be deployed automatically
    // on the first UserOp via EntryPoint -> SenderCreator -> Factory.
    console.log(`account ${accountAddress} not yet deployed (counterfactual)`)
    console.log(`v${version} factory restricts createAccount to SenderCreator -- account will be created with the first UserOp via "yarn run runop"`)
    console.log('make sure to fund the account first with "yarn run fundAccount"')
  } else {
    const tx = await accountFactory.createAccount(signer.address, aaIndex)
    console.log('account created, tx hash:', tx.hash)
    await tx.wait()
  }
})()
