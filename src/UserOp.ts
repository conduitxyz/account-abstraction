import {
  arrayify,
  defaultAbiCoder,
  hexDataSlice,
  keccak256
} from 'ethers/lib/utils'
import { ethers, BigNumber, Contract, Signer, Wallet } from 'ethers'
import {
  callDataCost,
  packAccountGasLimits,
  packPaymasterData,
  packFactoryData,
  rethrow,
  create2FactoryGetDeployedAddress,
} from './utils'
import { CREATE2_FACTORY_ADDRESS } from './constants'
import { EntryPoint } from '../typechain'
import { PackedUserOperation, UserOperation } from './types' 
export function packUserOp(userOp: UserOperation): PackedUserOperation {
  const accountGasLimits = packAccountGasLimits(userOp.verificationGasLimit, userOp.callGasLimit)
  const gasFees = packAccountGasLimits(userOp.maxPriorityFeePerGas, userOp.maxFeePerGas)
  let initCode = '0x'
  if (userOp.factory && userOp.factoryData) {
    initCode = packFactoryData(userOp.factory as string, userOp.factoryData!)
  }
  
  let paymasterAndData = '0x'
  if (userOp.paymaster && userOp.paymaster !== ethers.constants.AddressZero) {
    paymasterAndData = packPaymasterData(userOp.paymaster as string, userOp.paymasterVerificationGasLimit!, userOp.paymasterPostOpGasLimit!, userOp.paymasterData as string)
  }
  return {
    sender: userOp.sender,
    nonce: userOp.nonce,
    callData: userOp.callData,
    accountGasLimits,
    initCode,
    preVerificationGas: userOp.preVerificationGas,
    gasFees,
    paymasterAndData,
    signature: userOp.signature
  }
}
export function encodeUserOp(userOp: UserOperation, forSignature = true): string {
  const packedUserOp = packUserOp(userOp)
  if (forSignature) {
    return defaultAbiCoder.encode(
      ['address', 'uint256', 'bytes32', 'bytes32',
        'bytes32', 'uint256', 'bytes32',
        'bytes32'],
      [packedUserOp.sender, packedUserOp.nonce, keccak256(packedUserOp.initCode), keccak256(packedUserOp.callData),
      packedUserOp.accountGasLimits, packedUserOp.preVerificationGas, packedUserOp.gasFees,
      keccak256(packedUserOp.paymasterAndData)])
  } else {
    // for the purpose of calculating gas cost encode also signature (and no keccak of bytes)
    return defaultAbiCoder.encode(
      ['address', 'uint256', 'bytes', 'bytes',
        'bytes32', 'uint256', 'bytes32',
        'bytes', 'bytes'],
      [packedUserOp.sender, packedUserOp.nonce, packedUserOp.initCode, packedUserOp.callData,
      packedUserOp.accountGasLimits, packedUserOp.preVerificationGas, packedUserOp.gasFees,
      packedUserOp.paymasterAndData, packedUserOp.signature])
  }
}

export function getUserOpHash(op: UserOperation, entryPoint: string, chainId: number): string {
  const userOpHash = keccak256(encodeUserOp(op, true))
  const enc = defaultAbiCoder.encode(
    ['bytes32', 'address', 'uint256'],
    [userOpHash, entryPoint, chainId])
  return keccak256(enc)
}

export const DefaultsForUserOp: Partial<UserOperation> = {
  sender: ethers.constants.AddressZero,
  nonce: 0,
  callData: '0x',
  callGasLimit: 0,
  verificationGasLimit: 150000, // default verification gas. will add create2 cost (3200+200*length) if initCode exists
  preVerificationGas: 120000, // should also cover calldata cost.
  maxFeePerGas: 0,
  maxPriorityFeePerGas: 2e9,
  signature: '0x'
}

export function fillUserOpDefaults(op: Partial<UserOperation>, defaults = DefaultsForUserOp): UserOperation {
  const partial: any = { ...op }
  // we want "item:undefined" to be used from defaults, and not override defaults, so we must explicitly
  // remove those so "merge" will succeed.
  for (const key in partial) {
    if (partial[key] == null) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete partial[key]
    }
  }
  const filled = { ...defaults, ...partial }
  return filled
}

// helper to fill structure:
// - default callGasLimit to estimate call from entryPoint to account (TODO: add overhead)
// if there is initCode:
//  - calculate sender by eth_call the deployment code
//  - default verificationGasLimit estimateGas of deployment code plus default 100000
// no initCode:
//  - update nonce from account.getNonce()
// entryPoint param is only required to fill in "sender address when specifying "initCode"
// nonce: assume contract as "getNonce()" function, and fill in.
// sender - only in case of construction: fill sender from initCode.
// callGasLimit: VERY crude estimation (by estimating call to account, and add rough entryPoint overhead
// verificationGasLimit: hard-code default at 100k. should add "create2" cost
export async function fillUserOp(op: Partial<UserOperation>, entryPoint?: EntryPoint, getNonceFunction = 'getNonce'): Promise<UserOperation> {
  const op1 = { ...op }
  const provider = entryPoint?.provider
  if (op.factory != null && op.factoryData != null) {
    if (op1.nonce == null) op1.nonce = 0
    if (op1.sender == null) {
      // hack: if the init contract is our known deployer, then we know what the address would be, without a view call
      if (op.factory.toLowerCase() === CREATE2_FACTORY_ADDRESS.toLowerCase()) {
        const ctr = hexDataSlice(op.factoryData!, 32)
        const salt = hexDataSlice(op.factoryData!, 0, 32)
        op1.sender = create2FactoryGetDeployedAddress(ctr, salt)
      } else {
        // console.log('\t== not our deployer. our=', Create2Factory.contractAddress, 'got', initAddr)
        if (provider == null) throw new Error('no entrypoint/provider')
        op1.sender = await entryPoint!.callStatic.getSenderAddress(packFactoryData(op1.factory!, op1.factoryData!)).catch(e => e.errorArgs.sender)
      }
    }
    if (op1.verificationGasLimit == null) {
      if (provider == null) throw new Error('no entrypoint/provider')
      const initEstimate = await provider.estimateGas({
        from: entryPoint?.address,
        to: op.factory,
        data: op.factoryData,
        gasLimit: 10e6
      })
      op1.verificationGasLimit = initEstimate
    }
  }
  if (op1.nonce == null) {
    if (provider == null) throw new Error('must have entryPoint to autofill nonce')
    const c = new Contract(op.sender!, [`function ${getNonceFunction}() view returns(uint256)`], provider)
    op1.nonce = await c[getNonceFunction]().catch(rethrow())
  }
  if (op1.callGasLimit == null && op.callData != null) {
    if (provider == null) throw new Error('must have entryPoint for callGasLimit estimate')
    const gasEtimated = await provider.estimateGas({
      from: entryPoint?.address,
      to: op1.sender,
      data: op1.callData
    })

    // console.log('estim', op1.sender,'len=', op1.callData!.length, 'res=', gasEtimated)
    // estimateGas assumes direct call from entryPoint. add wrapper cost.
    op1.callGasLimit = gasEtimated // .add(55000)
  }
  if (op1.paymaster != null && op1.paymaster != ethers.constants.AddressZero && op1.paymaster != '0x') {
    if (op1.paymasterVerificationGasLimit == null) {
      op1.paymasterVerificationGasLimit = DefaultsForUserOp.paymasterVerificationGasLimit
    }
    if (op1.paymasterPostOpGasLimit == null) {
      op1.paymasterPostOpGasLimit = DefaultsForUserOp.paymasterPostOpGasLimit
    }
  }
  if (op1.maxFeePerGas == null) {
    if (provider == null) throw new Error('must have entryPoint to autofill maxFeePerGas')
    const block = await provider.getBlock('latest')
    op1.maxFeePerGas = block.baseFeePerGas!.add(op1.maxPriorityFeePerGas ?? DefaultsForUserOp.maxPriorityFeePerGas!)
  }
  // TODO: this is exactly what fillUserOp below should do - but it doesn't.
  // adding this manually
  if (op1.maxPriorityFeePerGas == null) {
    op1.maxPriorityFeePerGas = DefaultsForUserOp.maxPriorityFeePerGas
  }
  const op2 = fillUserOpDefaults(op1)
  op2.preVerificationGas = BigNumber.from(DefaultsForUserOp.preVerificationGas).add(callDataCost(encodeUserOp(op2, false)))
  return op2
}

export async function fillAndSign(op: Partial<UserOperation>, signer: Wallet | Signer, entryPoint?: EntryPoint, getNonceFunction = 'getNonce'): Promise<UserOperation> {
  const op2 = await fillUserOp(op, entryPoint, getNonceFunction)

  const chainId = await signer.provider!.getNetwork().then(net => net.chainId)
  const message = arrayify(getUserOpHash(op2, entryPoint!.address, chainId))

  let signature
  try {
    signature = await signer.signMessage(message)
  } catch (err: any) {
    // attempt to use 'eth_sign' instead of 'personal_sign' which is not supported by Foundry Anvil
    signature = await (signer as any)._legacySignMessage(message)
  }
  return {
    ...op2,
    signature
  }
}
