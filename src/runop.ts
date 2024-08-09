// run a single op
// "yarn run runop [--network ...]"

import hre, { ethers } from 'hardhat'
import { AASigner, localUserOpSender, rpcUserOpSender } from './AASigner'
import { TestCounter__factory, EntryPoint__factory } from '../typechain'
import { parseEther } from 'ethers/lib/utils'
import { providers } from 'ethers'
import { TransactionReceipt } from '@ethersproject/abstract-provider/src.ts/index';

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
  console.log('net=', hre.network.name)
  const rpcUrl = process.env.RPC_URL;
  const aaUrl = process.env.AA_URL;
  const aaIndex = parseInt(process.env.AA_INDEX ?? '0'); // an account can have multiple addresses (with different index)
  const signerPrivateKey = process.env.SIGNER_PRIVATE_KEY;

  if (rpcUrl == null || aaUrl == null || signerPrivateKey == null) {
    console.error('ERROR: must set RPC_URL, AA_URL, SIGNER_PRIVATE_KEY')
    process.exit(1)
  }

  const [entryPointAddress, testCounterAddress, accountFactoryAddress] = [
    "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
    "0x475d5a5B128c1846b86493b357e75E27201447B7",
    "0x0ACDDd4868E24aad6A16573b416133F58795A916",
  ]

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
  const ethersSigner = new ethers.Wallet(signerPrivateKey, provider)
  const prefundAccountBalance = (await provider.getBalance(ethersSigner.address)).toString()
  console.log(`using prefund account address ${ethersSigner.address} with balance ${prefundAccountBalance}`)

  let sendUserOp

  // if (aa_url != null) {
  // make sure that the node supports our EntryPoint
  const aaProvider = new providers.JsonRpcProvider(aaUrl)
  sendUserOp = rpcUserOpSender(aaProvider, entryPointAddress)
  const supportedEntryPoints: string[] = await aaProvider.send('eth_supportedEntryPoints', []).then(ret => ret.map(ethers.utils.getAddress))
  console.log('node supported EntryPoints=', supportedEntryPoints)
  if (!supportedEntryPoints.includes(entryPointAddress)) {
    console.error('ERROR: node', aaUrl, 'does not support our EntryPoint')
  }
  // TODO fix localUserOpSender later
  // } else { sendUserOp = localUserOpSender(entryPointAddress, ethersSigner) }

  const aaSigner = new AASigner(ethersSigner, entryPointAddress, sendUserOp, accountFactoryAddress, aaIndex)
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
  const entryPoint = EntryPoint__factory.connect(entryPointAddress, ethersSigner)
  console.log('account address=', aaAccountAddress)
  let preDeposit = await entryPoint.balanceOf(aaAccountAddress)
  console.log('current deposit=', preDeposit, 'current balance', await provider.getBalance(aaAccountAddress))

  if (preDeposit.lte(parseEther('0.005'))) {
    console.log('depositing for account')
    await entryPoint.depositTo(aaAccountAddress, { value: parseEther('0.01') })
    preDeposit = await entryPoint.balanceOf(aaAccountAddress)
  }

  const testCounter = TestCounter__factory.connect(testCounterAddress, aaSigner)

  const prebalance = await provider.getBalance(aaAccountAddress)
  console.log('balance=', prebalance.div(1e9).toString(), 'deposit=', preDeposit.div(1e9).toString())
  console.log('estimate direct call', { gasUsed: await testCounter.connect(ethersSigner).estimateGas.justemit().then(t => t.toNumber()) })
  const ret = await testCounter.justemit()
  console.log('waiting for mine, hash (reqId)=', ret.hash)
  const rcpt = await ret.wait()
  // const netname = await provider.getNetwork().then(net => net.name)
  // if (netname !== 'unknown') {
  //   console.log('rcpt', rcpt.transactionHash, `https://dashboard.tenderly.co/tx/${netname}/${rcpt.transactionHash}/gas-usage`)
  // }
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
