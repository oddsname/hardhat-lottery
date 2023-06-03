const {deployments, getNamedAccounts, network, ethers} = require("hardhat");
const {networkConfig} = require("../../hardhat-config-helper");
const {expect, assert} = require("chai");
const {developmentChains} = require('../../hardhat-config-helper');

!developmentChains.includes(network.name)
    ? describe.skip('all', () => {})
    : describe("Lottery unit test", async () => {
        let lottery, vrfCoordinatorV2Mock, entranceFee, deployer, interval;
        const chainId = network.config.chainId;

        beforeEach(async () => {
            deployer = (await getNamedAccounts()).deployer;
            await deployments.fixture(['all']);
            lottery = await ethers.getContract('Lottery', deployer);
            vrfCoordinatorV2Mock = await ethers.getContract('VRFCoordinatorV2Mock', deployer);
            entranceFee = await lottery.getEntranceFee();
            interval = await lottery.getInterval();
        })

        describe('constructor', async () => {
            it('initializes the raffle correctly', async () => {
                const lotteryState = await lottery.getLotteryState();
                const interval = await lottery.getInterval();

                assert.equal(lotteryState.toString(), '0', "By default raffle state must be OPEN");
                assert.equal(interval.toString(), networkConfig[chainId].interval);
            })
        })

        describe('enter lottery', async () => {
            it('reverts if you dont pay enough', async () => {
                await expect(lottery.enterLottery()).to.be.revertedWith("Lottery_NotEnoughFeeEntered")
            });

            it('record players when they enter', async () => {
                await lottery.enterLottery({value: entranceFee});

                const player = await lottery.getPlayer(0);
                assert.equal(player, deployer);
            });

            it('emits event on enter', async () => {
                await expect(lottery.enterLottery({value: entranceFee})).to.emit(lottery, 'LotteryEnter');
            });

            it("doesn't allow enter when lottery in progress", async () => {
                await lottery.enterLottery({value: entranceFee});
                // // https://hardhat.org/hardhat-network/reference
                // //manually mine new block and increase the time of local chain
                await network.provider.send('evm_increaseTime', [interval.toNumber() + 1])
                await network.provider.send('evm_mine', []);

                //
                // //calling the function that supposed to be called from chainlink keeper to change the state of smart contact to IN_PROGRESS
                await lottery.performUpkeep([]);
                await expect(lottery.enterLottery({value: entranceFee})).to.be.revertedWith('Lottery_NotOpen');
            });
        });

        describe('check upkeep', async () => {
            it('return false if people havent send enough ETH', async () => {
                await network.provider.send('evm_increaseTime', [interval.toNumber() + 1]);
                await network.provider.send('evm_mine', []);

                //as checkUpKeep is not `view` function we can't do direct call
                //but if we want to simulate a transaction we can use callStatic
                const {upkeepNeeded} = await lottery.callStatic.checkUpkeep([]);

                assert.equal(upkeepNeeded, false)
            })

            it('return false if lottery isnt open', async () => {
                await lottery.enterLottery({value: entranceFee});
                // // https://hardhat.org/hardhat-network/reference
                // //manually mine new block and increase the time of local chain
                await network.provider.send('evm_increaseTime', [interval.toNumber() + 1])
                await network.provider.send('evm_mine', []);

                await lottery.performUpkeep([]);

                const lotteryState = await lottery.getLotteryState();
                const {upkeepNeeded} = await lottery.callStatic.checkUpkeep([]);

                assert.equal(lotteryState.toString(), '1'); //state must be calculating
                assert.equal(upkeepNeeded, false);
            });

            it('return false if enough time hasnt passed', async () => {
                await lottery.enterLottery({value: entranceFee});
                // // https://hardhat.org/hardhat-network/reference
                // //manually mine new block and increase the time of local chain
                await network.provider.send('evm_increaseTime', [interval.toNumber() - 10])
                await network.provider.send('evm_mine', []);

                const {upkeepNeeded} = await lottery.callStatic.checkUpkeep([]);
                assert.equal(upkeepNeeded, false);
            })
        });

        describe('perform upkeep', async () => {
            it('it can only run if checkupkeep is true', async () => {
                await lottery.enterLottery({value: entranceFee});

                await network.provider.send('evm_increaseTime', [interval.toNumber() + 1])
                await network.provider.send('evm_mine', []);
                const tx = await lottery.performUpkeep([]);

                assert(tx);
            });

            it('reverts if checkupkeep is false', async () => {
                await expect(lottery.performUpkeep([])).to.be.revertedWith("Lottery_UpkeepNotNeeded")
            });

            it('updates lottery state, emits an event, and calls vrf coordinator', async () => {
                await lottery.enterLottery({value: entranceFee});

                await network.provider.send('evm_increaseTime', [interval.toNumber() + 1])
                await network.provider.send('evm_mine', []);

                const txResponse = await lottery.performUpkeep([]);
                const txReceipt = await txResponse.wait(1);
                const requestId = txReceipt.events[1].args.requestId;
                const lotteryState = await lottery.getLotteryState();
                assert.equal(requestId.toNumber() > 0, true); // check if we did vrf request
                assert.equal(lotteryState.toString(), '1'); //change state to in progress
            });
        });

        describe('fulfill random words', async () => {
            beforeEach(async () => {
                await lottery.enterLottery({value: entranceFee});
                // // https://hardhat.org/hardhat-network/reference
                // //manually mine new block and increase the time of local chain
                await network.provider.send('evm_increaseTime', [interval.toNumber() + 10])
                await network.provider.send('evm_mine', []);
            })

            it('can only be called after perform upkeep', async () => {
                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address))
                    .to.be.revertedWith('nonexistent request');
                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(1, lottery.address))
                    .to.be.revertedWith('nonexistent request');
            });

            it('picks winner, resets the lottery, and sends money', async () => {
                const additionalEntrants = 3;
                const startingAccountIndex = 1; // deployer = 0
                const accounts = await ethers.getSigners();

                for (let i = startingAccountIndex; i < startingAccountIndex + additionalEntrants; i++) {
                    const accountConnected = lottery.connect(accounts[i]);
                    await accountConnected.enterLottery({value: entranceFee});
                }

                const startingTimeStamp = await lottery.getLatestTimestamp();

                await new Promise(async (resolve, reject) => {
                    const winnerStartingBalance = await accounts[1].getBalance();//we know that account 1 will be the winner
                    //adding listener for event, which code below should trigger
                    lottery.once('WinnerPicked', async () => {
                        try {
                            const recentWinner = await lottery.getRecentWinner();
                            const lotteryState = await lottery.getLotteryState();
                            const players = await lottery.getPlayers();
                            const endingTimeStamp = await lottery.getLatestTimestamp();

                            const winnerEndingBalance = await accounts[1].getBalance(); //we know that account 1 will be the winner

                            assert.equal(players.length, 0);
                            assert.equal(lotteryState.toString(), '0');
                            assert.equal(endingTimeStamp > startingTimeStamp, true);

                            assert.equal(recentWinner, accounts[1].address);
                            assert.equal(
                                winnerEndingBalance.toString(),
                                winnerStartingBalance.add(
                                    entranceFee
                                        .mul(additionalEntrants)
                                        .add(entranceFee)
                                        .toString()
                                )
                            );
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    })

                    const txResponse = await lottery.performUpkeep([]);
                    const txReceipt = await txResponse.wait(1);

                    await vrfCoordinatorV2Mock.fulfillRandomWords(
                        txReceipt.events[1].args.requestId,
                        lottery.address
                    );
                });
            });
        })
    })