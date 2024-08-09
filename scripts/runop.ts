// run a single op
// "yarn run runop [--network ...]"

import { ethers } from 'ethers'
import { AASigner, rpcUserOpSender } from '../src/AASigner'
import { TestCounter__factory, EntryPoint__factory } from '../typechain'
import { parseEther } from 'ethers/lib/utils'
import { providers } from 'ethers'
import {
  ENTRYPOINT_0_7_0_ADDRESS,
  SIMPLE_ACCOUNT_FACTORY_ADDRESS,
  TEST_COUNTER_ADDRESS
} from '../src/constants'

(async () => {
  const rpcUrl = process.env.RPC_URL;
  const aaUrl = process.env.AA_URL;
  const aaIndex = parseInt(process.env.AA_INDEX ?? '0'); // an account can have multiple addresses (with different index)
  const signerPrivateKey = process.env.SIGNER_PRIVATE_KEY;

  if (rpcUrl == null || aaUrl == null || signerPrivateKey == null) {
    console.error('ERROR: must set RPC_URL, AA_URL, SIGNER_PRIVATE_KEY')
    process.exit(1)
  }

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
  const signer = new ethers.Wallet(signerPrivateKey, provider)

  // make sure that the node supports our EntryPoint
  const aaProvider = new providers.JsonRpcProvider(aaUrl)
  const supportedEntryPoints: string[] = await aaProvider
    .send('eth_supportedEntryPoints', [])
    .then(ret => ret.map(ethers.utils.getAddress))
  if (!supportedEntryPoints.includes(ENTRYPOINT_0_7_0_ADDRESS)) {
    console.error(`ERROR: ${aaUrl}does not support our EntryPoint`)
    process.exit(1)
  }

  const aaSigner = new AASigner(
    signer,
    ENTRYPOINT_0_7_0_ADDRESS,
    rpcUserOpSender(aaProvider, ENTRYPOINT_0_7_0_ADDRESS),
    SIMPLE_ACCOUNT_FACTORY_ADDRESS,
    aaIndex
  )

  // TODO create the smart account if it does not exist
  // connect to pre-deployed account
  const aaAccountAddress = await aaSigner.getAddress()
  const code = await provider.getCode(aaAccountAddress);
  if (code.length <= 2) {
    console.error(`ERROR: SimpleAccount for ${signer.address} index ${aaIndex} does not exist. Run "yarn run createAccount" first`)
    process.exit(1);
  }

  console.log(`Using account ${aaAccountAddress}`)

  const entryPoint = EntryPoint__factory.connect(ENTRYPOINT_0_7_0_ADDRESS, signer)
  console.log('account address=', aaAccountAddress)
  const aaAccountGasBalance = await entryPoint.balanceOf(aaAccountAddress)
  if (aaAccountGasBalance.eq(parseEther('0'))) {
    console.error(`ERROR: ${aaAccountAddress} has no ether for gas. Run "yarn run fundAccount" first`)
    process.exit(1);
  }

  const testCounter = TestCounter__factory.connect(TEST_COUNTER_ADDRESS, aaSigner)
  const tx = await testCounter.justemit()
  console.log(`Sent tx ${tx.hash}`)
  await tx.wait()

  // const gasPaid = prebalance.sub(await provider.getBalance(aaAccountAddress))
  // const depositPaid = preDeposit.sub(await entryPoint.balanceOf(aaAccountAddress))
  // console.log('paid (from balance)=', gasPaid.toNumber() / 1e9, 'paid (from deposit)', depositPaid.div(1e9).toString(), 'gasUsed=', rcpt.gasUsed)
  // const logs = await entryPoint.queryFilter('*' as any, rcpt.blockNumber)
  // console.log(logs.map((e: any) => ({ ev: e.event, ...objdump(e.args!) })))
  // console.log('1st run gas used:', await evInfo(rcpt))

  // const ret1 = await testCounter.justemit()
  // const rcpt2 = await ret1.wait()
  // console.log('2nd run:', await evInfo(rcpt2))

  // async function evInfo (rcpt: TransactionReceipt): Promise<any> {
  //   // TODO: checking only latest block...
  //   const block = rcpt.blockNumber
  //   const ev = await entryPoint.queryFilter(entryPoint.filters.UserOperationEvent(), block)
  //   // if (ev.length === 0) return {}
  //   return ev.map(event => {
  //     const { nonce, actualGasUsed } = event.args
  //     const gasUsed = rcpt.gasUsed.toNumber()
  //     return { nonce: nonce.toNumber(), gasPaid, gasUsed: gasUsed, diff: gasUsed - actualGasUsed.toNumber() }
  //   })
  // }
})()
