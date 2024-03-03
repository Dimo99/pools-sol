require('dotenv').config()
const { ethers } = require('ethers')

require('@nomicfoundation/hardhat-chai-matchers')
require('hardhat-gas-reporter')
require('@nomiclabs/hardhat-etherscan')
require('solidity-coverage')
require('@typechain/hardhat')

const {
    ETHERSCAN_API,
    HARDHAT_NODE_LOGGING_ENABLED,
    PRIVATE_KEY,
} = process.env

Error.stackTraceLimit = Infinity

module.exports = {
    defaultNetwork: 'hardhat',
    networks: {
        hardhat: {
            loggingEnabled: HARDHAT_NODE_LOGGING_ENABLED === 'true' ? true : false,
            gasPrice: 875000000,
            accounts: {
                accountsBalance: ethers.utils.parseEther((100_000_000_000).toString()).toString(),
                count: 20,
            },
        },
        sepolia: {
            accounts: [PRIVATE_KEY || ethers.constants.HashZero],
            url: 'https://ethereum-sepolia.publicnode.com'
        }
    },
    typechain: {
        outDir: 'artifacts/types',
        target: 'ethers-v6',
    },
    mocha: {
      timeout: 120_000,
    },
    solidity: {
        compilers: [
            {
                version: '0.8.17',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 1048576 * 2
                    }
                }
            }
        ]
    },
    gasReporter: {
        currency: 'USD',
        token: 'ETH',
        enabled: true,
        gasPrice: 100,
    },
    etherscan: {
        apiKey: ETHERSCAN_API,
        customChains: [
            {
                network: 'sepolia',
                chainId: 11155111,
                urls: {
                    apiURL: 'https://sepolia.etherscan.io/api',
                    browserURL: 'https://sepolia.etherscan.io',
                },
            },
        ],
    },
}

