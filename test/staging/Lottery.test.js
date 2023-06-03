const {deployments, getNamedAccounts, network, ethers} = require("hardhat");
const {networkConfig} = require("../../hardhat-config-helper");
const {expect, assert} = require("chai");
const {developmentChains} = require('../../hardhat-config-helper');

//before running staging tests u need to be sure that Chainlink VRF and Automation is configured properly
developmentChains.includes(network.name)
    ? describe.skip('all', () => {
    })
    : describe("Lottery staging test", async () => {
        let lottery, entranceFee, deployer;
        beforeEach(async () => {
            deployer = (await getNamedAccounts()).deployer;
            lottery = await ethers.getContract('Lottery', deployer);
            entranceFee = await lottery.getEntranceFee();
        })

        it('works with live Chainlink Keepers and Chainlink VRF, we get a random winner', async () => {
            const startingTimeStamp = await lottery.getLatestTimestamp();
            const accounts = await ethers.getSigners();

            await new Promise(async (resolve, reject) => {
                //adding listener for event, which code below should trigger
                lottery.once('WinnerPicked', async () => {
                    try {
                        const recentWinner = await lottery.getRecentWinner();
                        const winnerEndingBalance = await accounts[0].getBalance();// we pick 0 index user because it's the deployer
                        const lotteryState = await lottery.getLotteryState();
                        const players = await lottery.getPlayers();
                        const endingTimeStamp = await lottery.getLatestTimestamp();

                        assert.equal(recentWinner, accounts[0].address);
                        assert.equal(players.length, 0);
                        assert.equal(lotteryState.toString(), '0');
                        assert.equal(endingTimeStamp > startingTimeStamp, true);

                        assert.equal(
                            winnerEndingBalance.add(gasCost).toString(),
                            winnerStartingBalance.add(
                                entranceFee
                                    .add(entranceFee)
                                    .toString()
                            ).toString()
                        );
                        resolve();
                    } catch (e) {
                        console.log(e);
                        reject(e);
                    }
                })

                const txResponse = await lottery.enterLottery({value: entranceFee});
                const txReceipt = await txResponse.wait(6);
                const gasCost = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);
                const winnerStartingBalance = await accounts[0].getBalance();
            });
        });
    });