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
  const ethersSigner = new ethers.Wallet(signerPrivateKey, provider)
  const prefundAccountBalance = (await provider.getBalance(ethersSigner.address)).toString()
  console.log(`using prefund account address ${ethersSigner.address} with balance ${prefundAccountBalance}`)

  let sendUserOp

  // make sure that the node supports our EntryPoint
  const aaProvider = new providers.JsonRpcProvider(aaUrl)
  sendUserOp = rpcUserOpSender(aaProvider, ENTRYPOINT_0_7_0_ADDRESS)
  const supportedEntryPoints: string[] = await aaProvider.send('eth_supportedEntryPoints', []).then(ret => ret.map(ethers.utils.getAddress))
  console.log('node supported EntryPoints=', supportedEntryPoints)
  if (!supportedEntryPoints.includes(ENTRYPOINT_0_7_0_ADDRESS)) {
    console.error('ERROR: node', aaUrl, 'does not support our EntryPoint')
  }

  const aaSigner = new AASigner(ethersSigner, ENTRYPOINT_0_7_0_ADDRESS, sendUserOp, SIMPLE_ACCOUNT_FACTORY_ADDRESS, aaIndex)
  // TODO create the smart account if it does not exist
  // connect to pre-deployed account
  const aaAccountAddress = await aaSigner.getAddress()
  if (await provider.getBalance(aaAccountAddress) < parseEther('0.01')) {
    console.log('prefund account')
    await ethersSigner.sendTransaction({ to: aaAccountAddress, value: parseEther('0.01') })
  }

  // usually, an account will deposit for itself (that is, get created using eth, run "addDeposit" for itself
  // and from there on will use deposit
  // for testing,
  const entryPoint = EntryPoint__factory.connect(ENTRYPOINT_0_7_0_ADDRESS, ethersSigner)
  console.log('account address=', aaAccountAddress)
  let preDeposit = await entryPoint.balanceOf(aaAccountAddress)
  console.log('current deposit=', preDeposit, 'current balance', await provider.getBalance(aaAccountAddress))

  const testCounter = TestCounter__factory.connect(TEST_COUNTER_ADDRESS, aaSigner)

  const prebalance = await provider.getBalance(aaAccountAddress)
  console.log('balance=', prebalance.div(1e9).toString(), 'deposit=', preDeposit.div(1e9).toString())
  console.log('estimate direct call', { gasUsed: await testCounter.connect(ethersSigner).estimateGas.justemit().then(t => t.toNumber()) })
  const ret = await testCounter.justemit()
  console.log('waiting for mine, hash (reqId)=', ret.hash)
  const rcpt = await ret.wait()

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
