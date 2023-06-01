// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7; // >=0.8.7 <0.9.0   ^0.8.7

//Enter the lottery
//Pick a random winner
//Winner to be selected every X minutes -> completly automated

// Chainlink Oracle -> Randomness, Automated Execution (ChainLink Keepers)
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

error Lottery_NotEnoughFeeEntered();
error Lottery_TransferFailed();

contract Lottery is VRFConsumerBaseV2, KeeperCompatibleInterface {
    uint256 private immutable i_entranceFee;
    address payable[] private s_players;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinatorV2;
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint32 private immutable i_callbackGasLimit;

    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant NUM_WORDS = 1;

    //Lottery vars
    address private s_recentWinner;

    event LotteryEnter (address indexed player);
    event RequestedLotteryWinner(uint256 requestId);
    event WinnerPicked(address indexed winner);

    constructor(
        address vrfCoordinatorV2,
        uint256 entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = entranceFee;
        i_vrfCoordinatorV2 = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
    }

    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayers() public view returns (address payable[] memory) {
        return s_players;
    }

    function getRecentWinner() public view returns(address) {
        return s_recentWinner;
    }

    function enterLottery() public payable checkFee {
        s_players.push(payable(msg.sender));
        emit LotteryEnter(msg.sender);
    }

    // This is the function that the Chainlink Keeper nodes call KeeperCompatibleInterface
    // they look for the 'upkeepNeeded' to return true
    // t
    function checkUpKeep(bytes calldata) external ovveride {

    }

    function performUpkeep() external view ovveride {

    }

    function randomWinner() external {
        // all these weird parameters described here: https://docs.chain.link/getting-started/intermediates-tutorial
        uint256 requestId = i_vrfCoordinatorV2.requestRandomWords(
            i_gasLane,
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        emit RequestedLotteryWinner(requestId);
    }

    function fulfillRandomWords(
        uint, //we don't need first param inside the funciton be we should follow interface
        uint256[] memory randomWords) internal override {
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[indexOfWinner];
        s_recentWinner = recentWinner;

        (bool success,) = recentWinner.call{value: address(this).balance}("");

        if(!success) {
            revert Lottery_TransferFailed();
        }
        //emmit event here because we want to store recentWinner in the logs (because it's cheaper compare to storage)
        emit WinnerPicked(recentWinner);
    }

    modifier checkFee() {
        if(msg.value < i_entranceFee) { revert Lottery_NotEnoughFeeEntered();}
        _;
    }
}