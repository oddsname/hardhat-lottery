// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7; // >=0.8.7 <0.9.0   ^0.8.7

//Enter the lottery
//Pick a random winner
//Winner to be selected every X minutes -> completly automated

// Chainlink Oracle -> Randomness, Automated Execution (ChainLink Keepers)
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AutomationCompatibleInterface.sol";

error Lottery_NotEnoughFeeEntered();
error Lottery_TransferFailed();
error Lottery_NotOpen();
error Lottery_UpkeepNotNeeded(uint256 currentBalance, uint256 numOfPlayers, uint contractState);

contract Lottery is VRFConsumerBaseV2, AutomationCompatibleInterface {

    enum LotteryState { OPEN, IN_PROGRESS }

    uint256 private immutable i_entranceFee;
    address payable[] private s_players;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinatorV2;
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint32 private immutable i_callbackGasLimit;
    uint256 private immutable i_interval;

    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant NUM_WORDS = 1;

    //Lottery vars
    address private s_recentWinner;
    LotteryState private s_lotteryState;
    uint256 s_lastTimestamp;

    event LotteryEnter (address indexed player);
    event RequestedLotteryWinner(uint256 requestId);
    event WinnerPicked(address indexed winner);

    constructor(
        address vrfCoordinatorV2,
        uint256 entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = entranceFee;
        i_vrfCoordinatorV2 = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_lotteryState = LotteryState.OPEN;
        s_lastTimestamp = block.timestamp; // block is another global variable
        i_interval = interval;
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

    function getLotteryState() public view returns(LotteryState) {
        return s_lotteryState;
    }

    function getNumWords() public pure returns(uint256) {
        return NUM_WORDS;
    }

    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getLatestTimestamp() public view returns (uint256) {
        return s_lastTimestamp;
    }

    function getRequestConfirmations() public pure returns(uint256)  {
        return REQUEST_CONFIRMATIONS;
    }

    function enterLottery() public payable isLotteryOpen checkFee {
        s_players.push(payable(msg.sender));
        emit LotteryEnter(msg.sender);
    }

    function isAbleToGetWinner() internal view returns (bool) {
        //is lottery open
        bool isOpen = LotteryState.OPEN == s_lotteryState;

        //is enough time passed
        bool isTimePassed = (block.timestamp - s_lastTimestamp) > i_interval;

        //is we have enough players
        bool hasPlayers = s_players.length > 0;

        //has some balance
        bool hasBalance = address(this).balance > 0;

        return isOpen && isTimePassed && hasPlayers && hasBalance;
    }

    // This is the function that the Chainlink Keeper nodes call KeeperCompatibleInterface
    // they look for the 'upkeepNeeded' to return true
    function checkUpkeep(bytes calldata checkData) external override returns (bool upkeepNeeded, bytes memory performData) {
        return (
            isAbleToGetWinner(),
            checkData
        );
    }

    function performUpkeep(bytes calldata) external override {
        bool upkeepNeeded = isAbleToGetWinner();
        //prevent random calls
        if(!upkeepNeeded) {
            revert Lottery_UpkeepNotNeeded(address(this).balance, s_players.length, uint256(s_lotteryState));
        }

        randomWinner();
    }

    function randomWinner() internal {
        // all these weird parameters described here: https://docs.chain.link/getting-started/intermediates-tutorial
        s_lotteryState = LotteryState.IN_PROGRESS;
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
        uint256[] memory randomWords
    ) internal override {
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[indexOfWinner];
        s_recentWinner = recentWinner;
        (bool success,) = recentWinner.call{value: address(this).balance}("");

        if(!success) {
            revert Lottery_TransferFailed();
        }

        s_players = new address payable[](0);
        s_lotteryState = LotteryState.OPEN;
        s_lastTimestamp = block.timestamp;
        //emmit event here because we want to store recentWinner in the logs (because it's cheaper compare to storage)
        emit WinnerPicked(recentWinner);
    }

    modifier checkFee() {
        if(msg.value < i_entranceFee) { revert Lottery_NotEnoughFeeEntered();}
        _;
    }

    modifier isLotteryOpen() {
        if(s_lotteryState != LotteryState.OPEN) {
            revert Lottery_NotOpen();
        }
        _;
    }
}