import {
  ENTRYPOINT_0_7_0_ADDRESS,
  ENTRYPOINT_0_8_0_ADDRESS,
  ENTRYPOINT_0_9_0_ADDRESS,
  SIMPLE_7702_ACCOUNT_0_8_0_ADDRESS,
  SIMPLE_7702_ACCOUNT_0_9_0_ADDRESS,
  SIMPLE_ACCOUNT_FACTORY_0_8_0_ADDRESS,
  SIMPLE_ACCOUNT_FACTORY_0_9_0_ADDRESS,
  SIMPLE_ACCOUNT_FACTORY_ADDRESS
} from '../src/constants'

export type EntryPointVersion = '0.7' | '0.8' | '0.9'

export interface ScriptArgs {
  version: EntryPointVersion
  isEip7702: boolean
}

export function parseScriptArgs(): ScriptArgs {
  const args = process.argv.slice(2)

  const isV08 = args.includes('--entrypoint08') || args.includes('--v08')
  const isV09 = args.includes('--entrypoint09') || args.includes('--v09')
  if (isV08 && isV09) {
    throw new Error('Only one of --entrypoint08/--v08 or --entrypoint09/--v09 can be set')
  }

  const version: EntryPointVersion = isV08 ? '0.8' : isV09 ? '0.9' : '0.7'
  const isEip7702 = args.includes('--eip7702')

  return {
    version,
    isEip7702
  }
}

export function getEntryPointAddress(version: EntryPointVersion): string {
  switch (version) {
    case '0.8':
      return ENTRYPOINT_0_8_0_ADDRESS
    case '0.9':
      return ENTRYPOINT_0_9_0_ADDRESS
    case '0.7':
    default:
      return ENTRYPOINT_0_7_0_ADDRESS
  }
}

export function getSimpleAccountFactoryAddress(version: EntryPointVersion): string {
  switch (version) {
    case '0.8':
      return SIMPLE_ACCOUNT_FACTORY_0_8_0_ADDRESS
    case '0.9':
      return SIMPLE_ACCOUNT_FACTORY_0_9_0_ADDRESS
    case '0.7':
    default:
      return SIMPLE_ACCOUNT_FACTORY_ADDRESS
  }
}

export function getSimple7702DelegateAddress(version: EntryPointVersion): string {
  switch (version) {
    case '0.8':
      return SIMPLE_7702_ACCOUNT_0_8_0_ADDRESS
    case '0.9':
      return SIMPLE_7702_ACCOUNT_0_9_0_ADDRESS
    default:
      throw new Error('EIP-7702 mode only supports entrypoint v0.8 and v0.9')
  }
}
