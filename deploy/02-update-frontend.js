const fs = require('fs-extra');
const {ethers} = require("hardhat");
const path = require('path');

module.exports = async ({ getNamedAccounts, network }) => {
    if(process.env.UPDATE_FRONTEND) {
        console.log('Updating contract');
        const { deployer } = await getNamedAccounts();

        const contract = await ethers.getContract('Lottery', deployer);

        await updateFrontendContractAddress(contract, network.config.chainId);
        await updateFrontendContractAbi(contract, network.config.chainId)
    }
}

const updateFrontendContractAddress = async (contract, chainId) => {
    if(!process.env.FRONTEND_ADDRESS_PATH) {
        throw new Error("miss FRONTEND_ADDRESS_PATH")
    }

    const filePath = path.join(__dirname,  process.env.FRONTEND_ADDRESS_PATH)
    const isFileExist = await fs.exists(filePath);

    const currentData = isFileExist
            ? JSON.parse(await fs.readFile(filePath, 'utf8'))
            : { };

    currentData[chainId] = contract.address
    await fs.writeFile(filePath, JSON.stringify(currentData));
}

const updateFrontendContractAbi = async (contract, chainId) => {
    if(!process.env.FRONTEND_ABI_PATH) {
        throw new Error("miss FRONTEND_ABI_PATH")
    }

    const filePath = path.join(__dirname,  process.env.FRONTEND_ABI_PATH)
    const isFileExist = await fs.exists(filePath);

    const currentData = isFileExist
        ? JSON.parse(await fs.readFile(filePath, 'utf8'))
        : { };

    currentData[chainId] = JSON.parse((contract.interface.format(ethers.utils.FormatTypes.json)));
    await fs.writeFile(filePath, JSON.stringify(currentData));
}

module.exports.tags = ['all', 'frontend'];