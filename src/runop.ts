// run a single op
// "yarn run runop [--network ...]"

import hre, { ethers } from 'hardhat'
import { objdump } from '../test/testutils'
import { AASigner, localUserOpSender, rpcUserOpSender } from './AASigner'
import { TestCounter__factory, EntryPoint__factory } from '../typechain'
import '../test/aa.init'
import { parseEther } from 'ethers/lib/utils'
import { providers } from 'ethers'
import { TransactionReceipt } from '@ethersproject/abstract-provider/src.ts/index';

// eslint-disable-next-line @typescript-eslint/no-floating-promises
(async () => {
  console.log('net=', hre.network.name)
  const rpc_url = "https://rpc-drew-aa-deploy-test-rw221xmztz.t.conduit-stg.xyz"
  const aa_url = "https://bundler-drew-aa-deploy-test-rw221xmztz.t.conduit-stg.xyz"

  const [entryPointAddress, testCounterAddress, accountFactoryAddress] = [
    "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
    "0x475d5a5B128c1846b86493b357e75E27201447B7",
    "0x0ACDDd4868E24aad6A16573b416133F58795A916",
  ]

  console.log('entryPointAddress:', entryPointAddress, 'testCounterAddress:', testCounterAddress)
  const provider = new ethers.providers.JsonRpcProvider(rpc_url)
  const ethersSigner = new ethers.Wallet("40cce62e44c16f778522d4d588a32813654de64b340dede826574dc6d1f972de", provider) //= provider.getSigner(0)
  const prefundAccountAddress = ethersSigner.address
  const prefundAccountBalance = await provider.getBalance(prefundAccountAddress)
  console.log('using prefund account address', prefundAccountAddress, 'with balance', prefundAccountBalance.toString())

  let sendUserOp

  if (aa_url != null) {
    const newprovider = new providers.JsonRpcProvider(aa_url)
    sendUserOp = rpcUserOpSender(newprovider, entryPointAddress)
    const supportedEntryPoints: string[] = await newprovider.send('eth_supportedEntryPoints', []).then(ret => ret.map(ethers.utils.getAddress))
    console.log('node supported EntryPoints=', supportedEntryPoints)
    if (!supportedEntryPoints.includes(entryPointAddress)) {
      console.error('ERROR: node', aa_url, 'does not support our EntryPoint')
    }
  } else { sendUserOp = localUserOpSender(entryPointAddress, ethersSigner) }

  // index is unique for an account (so same owner can have multiple accounts, with different index
  const index = parseInt(process.env.AA_INDEX ?? '0')
  console.log('using account index (AA_INDEX)', index)
  const aasigner = new AASigner(ethersSigner, entryPointAddress, sendUserOp, accountFactoryAddress, index)
  // connect to pre-deployed account
  // await aasigner.connectAccountAddress(accountAddress)
  const myAddress = await aasigner.getAddress()
  if (await provider.getBalance(myAddress) < parseEther('0.01')) {
    console.log('prefund account')
    await ethersSigner.sendTransaction({ to: myAddress, value: parseEther('0.01') })
  }

  // usually, an account will deposit for itself (that is, get created using eth, run "addDeposit" for itself
  // and from there on will use deposit
  // for testing,
  const entryPoint = EntryPoint__factory.connect(entryPointAddress, ethersSigner)
  console.log('account address=', myAddress)
  let preDeposit = await entryPoint.balanceOf(myAddress)
  console.log('current deposit=', preDeposit, 'current balance', await provider.getBalance(myAddress))

  if (preDeposit.lte(parseEther('0.005'))) {
    console.log('depositing for account')
    await entryPoint.depositTo(myAddress, { value: parseEther('0.01') })
    preDeposit = await entryPoint.balanceOf(myAddress)
  }

  const testCounter = TestCounter__factory.connect(testCounterAddress, aasigner)

  const prebalance = await provider.getBalance(myAddress)
  console.log('balance=', prebalance.div(1e9).toString(), 'deposit=', preDeposit.div(1e9).toString())
  console.log('estimate direct call', { gasUsed: await testCounter.connect(ethersSigner).estimateGas.justemit().then(t => t.toNumber()) })
  const ret = await testCounter.justemit()
  console.log('waiting for mine, hash (reqId)=', ret.hash)
  const rcpt = await ret.wait()
  // const netname = await provider.getNetwork().then(net => net.name)
  // if (netname !== 'unknown') {
  //   console.log('rcpt', rcpt.transactionHash, `https://dashboard.tenderly.co/tx/${netname}/${rcpt.transactionHash}/gas-usage`)
  // }
  // const gasPaid = prebalance.sub(await provider.getBalance(myAddress))
  // const depositPaid = preDeposit.sub(await entryPoint.balanceOf(myAddress))
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
