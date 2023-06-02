const {developmentChains, networkConfig} = require("../hardhat-config-helper");
const {verify} = require('../utils/verify');

module.exports = async ({ getNamedAccounts, deployments, network, ethers }) => {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = network.config.chainId;
    let vrfCoordinator, subscriptionId;

    if(developmentChains.includes(network.name)) {
        const vrfCoordinatorV2Mock = await ethers.getContract('VRFCoordinatorV2Mock');
        vrfCoordinator = vrfCoordinatorV2Mock.address;

        //emulate subscription id
        const txResponse = await vrfCoordinatorV2Mock.createSubscription();
        const txReceipt =  await txResponse.wait(1);

        subscriptionId = txReceipt.events[0].args.subId;
        //we need to fund the subscription
        //usually you'd need the link token on a real network
        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, ethers.utils.parseEther('2'))
    } else {
        vrfCoordinator = networkConfig[chainId].vrfCoordinatorV2;
        subscriptionId = networkConfig[chainId].subscriptionId;
    }

    const entranceFee = networkConfig[chainId].entranceFee || ethers.utils.parseEther('0.001');
    const gasLane =  networkConfig[chainId].gasLane || '';
    const callbackGasLimit =  networkConfig[chainId].gasLimit || '500000';
    const interval =  networkConfig[chainId].interval || '30';

    const args = [
        vrfCoordinator,
        entranceFee,
        gasLane,
        subscriptionId,
        callbackGasLimit,
        interval
    ];

    console.log(args);
    const lottery = await deploy('Lottery', {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1
    });

    if(!developmentChains.includes(network.name) && process.env.ETHERSCAN_KEY) {
        log('Verifying Contract...');
        await verify(lottery.address, args);
    }
    log('--------------')
}

module.exports.tags = ['all', 'lottery']