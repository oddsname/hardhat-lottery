const { developmentChains } = require('../hardhat-config-helper')
const { ethers } = require("hardhat")

const BASE_FEE = ethers.utils.parseEther('0.25'); // it costs 0.25 LINK
const GAS_PRICE_LINK = 1e9; //calculated value based of price of the chain. LINK per gas

module.exports = async ({ getNamedAccounts, deployments, network }) => {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = network.config.chainId;

    if(developmentChains.includes(network.name)) {
        log('Local network detected, deploying mocks...');
        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            log: true,
            args: [BASE_FEE, GAS_PRICE_LINK],
        })

        log('Mocks deployed!');
        log('---------------------');
    }
};

module.exports.tags = ['all', 'mocks'];