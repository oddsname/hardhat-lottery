require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-etherscan');
require('hardhat-deploy');
require('solidity-coverage');
require('hardhat-gas-reporter');
require('hardhat-contract-sizer');
require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */

//to install deps
//yarn add --dev @nomiclabs/hardhat-ethers@npm:hardhat-deploy-ethers ethers @nomiclabs/hardhat-etherscan @nomiclabs/hardhat-waffle chai ethereum-waffle hardhat hardhat-contract-sizer hardhat-deploy hardhat-gas-reporter prettier prettier-plugin-solidity solhint solidity-coverage dotenv

const {
  GANACHE_KEY,
  GANACHE_URL,
  SEPOLIA_KEY,
  SEPOLIA_URL,
  ETHERSCAN_KEY,
  COINMARKETCAP_KEY,
} = process.env;

module.exports = {
  solidity: "0.8.7",
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      chainId: 31337,
      blockConfirmations: 1,
    },
    sepolia: {
      url: SEPOLIA_URL,
      accounts: [SEPOLIA_KEY],
      chainId: 11155111,
      blockConfirmations: 6,
    }
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    player: {
      default: 1,
    }
  }
};
