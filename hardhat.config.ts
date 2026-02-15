import '@typechain/hardhat';
import { HardhatUserConfig } from 'hardhat/config';

const optimizedCompilerSettings = {
  version: '0.8.23',
  settings: {
    optimizer: { enabled: true, runs: 1_000_000 },
    viaIR: true,
  },
};

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.23',
        settings: {
          optimizer: { enabled: true, runs: 1_000_000 },
        },
      },
    ],
    overrides: {
      'contracts/core/EntryPoint.sol': optimizedCompilerSettings,
      'contracts/samples/SimpleAccount.sol': optimizedCompilerSettings,
    },
  },
  networks: {},
};

export default config;
