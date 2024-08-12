import {
  ethers,
  BigNumberish,
  BytesLike,
} from 'ethers'
import {
  Hexable,
  hexConcat,
  hexlify,
  hexZeroPad,
  Interface,
  keccak256,
} from 'ethers/lib/utils'
import { CREATE2_FACTORY_ADDRESS } from '../constants'
import {
  EntryPoint__factory,
  SimpleAccountFactory,
  TestPaymasterRevertCustomError__factory, TestERC20__factory
} from '../../typechain'

export function callDataCost (data: string): number {
  return ethers.utils.arrayify(data)
    .map(x => x === 0 ? 4 : 16)
    .reduce((sum, x) => sum + x)
}

// helper function to create the initCode to deploy the account, using our account factory.
export function getAccountInitCode (owner: string, factory: SimpleAccountFactory, salt = 0): BytesLike {
  return hexConcat([
    factory.address,
    factory.interface.encodeFunctionData('createAccount', [owner, salt])
  ])
}

// given the parameters as AccountDeployer, return the resulting "counterfactual address" that it would create.
export async function getAccountAddress (owner: string, factory: SimpleAccountFactory, salt = 0): Promise<string> {
  return await factory.getAddress(owner, salt)
}

const panicCodes: { [key: number]: string } = {
  // from https://docs.soliditylang.org/en/v0.8.0/control-structures.html
  0x01: 'assert(false)',
  0x11: 'arithmetic overflow/underflow',
  0x12: 'divide by zero',
  0x21: 'invalid enum value',
  0x22: 'storage byte array that is incorrectly encoded',
  0x31: '.pop() on an empty array.',
  0x32: 'array sout-of-bounds or negative index',
  0x41: 'memory overflow',
  0x51: 'zero-initialized variable of internal function type'
}

// rethrow "cleaned up" exception.
// - stack trace goes back to method (or catch) line, not inner provider
// - attempt to parse revert data (needed for geth)
// use with ".catch(rethrow())", so that current source file/line is meaningful.
export function rethrow (): (e: Error) => void {
  const callerStack = new Error().stack!.replace(/Error.*\n.*at.*\n/, '').replace(/.*at.* \(internal[\s\S]*/, '')

  if (arguments[0] != null) {
    throw new Error('must use .catch(rethrow()), and NOT .catch(rethrow)')
  }
  return function (e: Error) {
    const solstack = e.stack!.match(/((?:.* at .*\.sol.*\n)+)/)
    const stack = (solstack != null ? solstack[1] : '') + callerStack
    // const regex = new RegExp('error=.*"data":"(.*?)"').compile()
    const found = /error=.*?"data":"(.*?)"/.exec(e.message)
    let message: string
    if (found != null) {
      const data = found[1]
      message = decodeRevertReason(data) ?? e.message + ' - ' + data.slice(0, 100)
    } else {
      message = e.message
    }
    const err = new Error(message)
    err.stack = 'Error: ' + message + '\n' + stack
    throw err
  }
}

const decodeRevertReasonContracts = new Interface([
  ...EntryPoint__factory.createInterface().fragments,
  ...TestPaymasterRevertCustomError__factory.createInterface().fragments,
  ...TestERC20__factory.createInterface().fragments, // for OZ errors,
  'error ECDSAInvalidSignature()'
]) // .filter(f => f.type === 'error'))

export function decodeRevertReason (data: string | Error, nullIfNoMatch = true): string | null {
  if (typeof data !== 'string') {
    const err = data as any
    data = (err.data ?? err.error?.data) as string
    if (typeof data !== 'string') throw err
  }

  const methodSig = data.slice(0, 10)
  const dataParams = '0x' + data.slice(10)

  // can't add Error(string) to xface...
  if (methodSig === '0x08c379a0') {
    const [err] = ethers.utils.defaultAbiCoder.decode(['string'], dataParams)
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    return `Error(${err})`
  } else if (methodSig === '0x4e487b71') {
    const [code] = ethers.utils.defaultAbiCoder.decode(['uint256'], dataParams)
    return `Panic(${panicCodes[code] ?? code} + ')`
  }

  try {
    const err = decodeRevertReasonContracts.parseError(data)
    // treat any error "bytes" argument as possible error to decode (e.g. FailedOpWithRevert, PostOpReverted)
    const args = err.args.map((arg: any, index) => {
      switch (err.errorFragment.inputs[index].type) {
        case 'bytes' : return decodeRevertReason(arg)
        case 'string': return `"${(arg as string)}"`
        default: return arg
      }
    })
    return `${err.name}(${args.join(',')})`
  } catch (e) {
    // throw new Error('unsupported errorSig ' + data)
    if (!nullIfNoMatch) {
      return data
    }
    return null
  }
}

// remove "array" members, convert values to strings.
// so Result obj like
// { '0': "a", '1': 20, first: "a", second: 20 }
// becomes:
// { first: "a", second: "20" }
export function objdump (obj: { [key: string]: any }): any {
  return obj == null
    ? null
    : Object.keys(obj)
      .filter(key => key.match(/^[\d_]/) == null)
      .reduce((set, key) => ({
        ...set,
        [key]: decodeRevertReason(obj[key].toString(), false)
      }), {})
}

export function packAccountGasLimits (verificationGasLimit: BigNumberish, callGasLimit: BigNumberish): string {
  return ethers.utils.hexConcat([
    hexZeroPad(hexlify(verificationGasLimit, { hexPad: 'left' }), 16), hexZeroPad(hexlify(callGasLimit, { hexPad: 'left' }), 16)
  ])
}

export function packFactoryData (factory: string, factoryData: BytesLike): string {
  return ethers.utils.hexConcat([
    // TODO kinda hacky to avoid zero-padding '0x' to '0x00000000000000000000000000000000'
    factory, factoryData == '0x'? '0x' : hexZeroPad(hexlify(factoryData, { hexPad: 'left' }), 16)
  ])
}

export function packPaymasterData (paymaster: string, paymasterVerificationGasLimit: BytesLike | Hexable | number | bigint, postOpGasLimit: BytesLike | Hexable | number | bigint, paymasterData: string): string {
  return ethers.utils.hexConcat([
    paymaster, hexZeroPad(hexlify(paymasterVerificationGasLimit, { hexPad: 'left' }), 16),
    hexZeroPad(hexlify(postOpGasLimit, { hexPad: 'left' }), 16), paymasterData
  ])
}

export interface ValidationData {
  aggregator: string
  validAfter: number
  validUntil: number
}

export function create2FactoryGetDeployedAddress (initCode: string, salt: BigNumberish): string {
  const saltBytes32 = hexZeroPad(hexlify(salt), 32)
  return '0x' + keccak256(hexConcat([
    '0xff',
    CREATE2_FACTORY_ADDRESS,
    saltBytes32,
    keccak256(initCode)
  ])).slice(-40)
}