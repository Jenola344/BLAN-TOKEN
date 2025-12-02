// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title BLANTokenV2
 * @dev Enhanced BLAN token with improved mining, security, and governance features
 */
contract BLANTokenV2 is ERC20, Ownable, ReentrancyGuard, Pausable {
    
    // Mining structures
    struct MiningSession {
        uint256 amount;
        uint256 startTime;
        uint256 endTime;
        uint256 rewardClaimed;
        bool active;
        uint8 tier; // 0: short, 1: medium, 2: long
    }

    struct MiningTier {
        uint256 duration;
        uint256 rewardMultiplier; // in basis points (10000 = 1x)
        uint256 minStake;
        bool active;
    }

    // State variables
    address public immutable liquidityWallet;
    uint256 public miningDifficulty;
    uint256 public constant MAX_EMERGENCY_MINT = 1_000_000 * 10**18;
    uint256 public constant MAX_DAILY_MINT = 500_000 * 10**18;
    uint256 public constant MAX_REWARD_PER_SESSION = 100_000 * 10**18;
    
    // Mining tracking
    mapping(address => MiningSession[]) public miningSessions;
    mapping(address => uint256) public activeSessionCount;
    mapping(uint8 => MiningTier) public miningTiers;
    
    // Security & limits
    uint256 public lastMintTimestamp;
    uint256 public dailyMintedAmount;
    uint256 public totalMiningRewards;
    uint256 public maxDifficultyChangePercent = 1000; // 10% max change
    
    // Timelock for admin actions
    struct PendingAction {
        uint256 executeAfter;
        uint256 newValue;
        bool executed;
    }
    mapping(bytes32 => PendingAction) public pendingActions;
    uint256 public constant TIMELOCK_DURATION = 2 days;

    // Events
    event MiningStarted(address indexed user, uint256 sessionId, uint256 amount, uint8 tier);
    event MiningCompleted(address indexed user, uint256 sessionId, uint256 amount);
    event RewardClaimed(address indexed user, uint256 sessionId, uint256 reward);
    event MiningWithdrawn(address indexed user, uint256 sessionId, uint256 amount, uint256 penalty);
    event DifficultyChangeProposed(uint256 oldDifficulty, uint256 newDifficulty, uint256 executeAfter);
    event DifficultyChanged(uint256 oldDifficulty, uint256 newDifficulty);
    event EmergencyMintExecuted(address indexed to, uint256 amount);
    event TierUpdated(uint8 tier, uint256 duration, uint256 multiplier, uint256 minStake);

    constructor(
        address _liquidityWallet,
        uint256 _initialDifficulty
    ) ERC20("BLAN", "BLAN") Ownable(msg.sender) {
        require(_liquidityWallet != address(0), "Invalid liquidity wallet");
        
        liquidityWallet = _liquidityWallet;
        miningDifficulty = _initialDifficulty;
        
        // Mint initial supply
        _mint(msg.sender, 9_500_000 * 10**18);
        _mint(liquidityWallet, 500_000 * 10**18);
        
        // Initialize mining tiers
        _initializeTiers();
        
        lastMintTimestamp = block.timestamp;
    }

    function _initializeTiers() private {
        // Short-term: 7 days, 1.2x multiplier, min 100 tokens
        miningTiers[0] = MiningTier({
            duration: 7 days,
            rewardMultiplier: 12000,
            minStake: 100 * 10**18,
            active: true
        });
        
        // Medium-term: 30 days, 1.5x multiplier, min 500 tokens
        miningTiers[1] = MiningTier({
            duration: 30 days,
            rewardMultiplier: 15000,
            minStake: 500 * 10**18,
            active: true
        });
        
        // Long-term: 90 days, 2x multiplier, min 1000 tokens
        miningTiers[2] = MiningTier({
            duration: 90 days,
            rewardMultiplier: 20000,
            minStake: 1000 * 10**18,
            active: true
        });
    }

    // ============ Mining Functions ============

    /**
     * @notice Start a mining session
     * @param amount Amount of tokens to stake
     * @param tier Mining tier (0: short, 1: medium, 2: long)
     */
    function startMining(uint256 amount, uint8 tier) external nonReentrant whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        require(tier <= 2, "Invalid tier");
        require(miningTiers[tier].active, "Tier not active");
        require(amount >= miningTiers[tier].minStake, "Below minimum stake");
        require(activeSessionCount[msg.sender] < 5, "Max 5 active sessions");
        
        MiningTier memory tierInfo = miningTiers[tier];
        
        // Transfer tokens to contract
        _transfer(msg.sender, address(this), amount);
        
        // Create mining session
        MiningSession memory session = MiningSession({
            amount: amount,
            startTime: block.timestamp,
            endTime: block.timestamp + tierInfo.duration,
            rewardClaimed: 0,
            active: true,
            tier: tier
        });
        
        miningSessions[msg.sender].push(session);
        activeSessionCount[msg.sender]++;
        
        emit MiningStarted(msg.sender, miningSessions[msg.sender].length - 1, amount, tier);
    }

    /**
     * @notice Complete mining session and unlock tokens
     * @param sessionId ID of the mining session
     */
    function completeMining(uint256 sessionId) external nonReentrant {
        require(sessionId < miningSessions[msg.sender].length, "Invalid session");
        MiningSession storage session = miningSessions[msg.sender][sessionId];
        
        require(session.active, "Session not active");
        require(block.timestamp >= session.endTime, "Mining period not complete");
        
        uint256 amount = session.amount;
        session.active = false;
        activeSessionCount[msg.sender]--;
        
        // Return staked tokens
        _transfer(address(this), msg.sender, amount);
        
        emit MiningCompleted(msg.sender, sessionId, amount);
    }

    /**
     * @notice Claim mining rewards
     * @param sessionId ID of the mining session
     */
    function claimMiningReward(uint256 sessionId) external nonReentrant whenNotPaused {
        require(sessionId < miningSessions[msg.sender].length, "Invalid session");
        MiningSession storage session = miningSessions[msg.sender][sessionId];
        
        require(!session.active, "Complete mining first");
        require(session.rewardClaimed == 0, "Reward already claimed");
        
        uint256 reward = calculateReward(
            session.amount,
            session.startTime,
            session.endTime,
            session.tier
        );
        
        require(reward <= MAX_REWARD_PER_SESSION, "Reward exceeds max");
        
        // Check daily mint limit
        _resetDailyMintIfNeeded();
        require(dailyMintedAmount + reward <= MAX_DAILY_MINT, "Daily mint limit exceeded");
        
        session.rewardClaimed = reward;
        dailyMintedAmount += reward;
        totalMiningRewards += reward;
        
        // Mint reward
        _mint(msg.sender, reward);
        
        emit RewardClaimed(msg.sender, sessionId, reward);
    }

    /**
     * @notice Early withdrawal with penalty
     * @param sessionId ID of the mining session
     */
    function withdrawEarly(uint256 sessionId) external nonReentrant {
        require(sessionId < miningSessions[msg.sender].length, "Invalid session");
        MiningSession storage session = miningSessions[msg.sender][sessionId];
        
        require(session.active, "Session not active");
        
        uint256 amount = session.amount;
        session.active = false;
        activeSessionCount[msg.sender]--;
        
        // Calculate penalty (20% of staked amount)
        uint256 penalty = (amount * 2000) / 10000;
        uint256 returnAmount = amount - penalty;
        
        // Burn penalty
        _transfer(address(this), address(0xdead), penalty);
        _transfer(address(this), msg.sender, returnAmount);
        
        emit MiningWithdrawn(msg.sender, sessionId, returnAmount, penalty);
    }

    /**
     * @notice Calculate mining reward
     */
    function calculateReward(
        uint256 amount,
        uint256 startTime,
        uint256 endTime,
        uint8 tier
    ) public view returns (uint256) {
        uint256 duration = endTime - startTime;
        MiningTier memory tierInfo = miningTiers[tier];
        
        // Base reward: (amount * duration * multiplier) / (difficulty * time_unit)
        uint256 baseReward = (amount * duration * tierInfo.rewardMultiplier) / 
                            (miningDifficulty * 365 days * 10000);
        
        return baseReward;
    }

    /**
     * @notice Get user's mining sessions
     */
    function getUserSessions(address user) external view returns (MiningSession[] memory) {
        return miningSessions[user];
    }

    /**
     * @notice Get active session count
     */
    function getActiveSessionCount(address user) external view returns (uint256) {
        return activeSessionCount[user];
    }

    // ============ Admin Functions with Timelock ============

    /**
     * @notice Propose difficulty change
     */
    function proposeDifficultyChange(uint256 newDifficulty) external onlyOwner {
        require(newDifficulty > 0, "Difficulty must be > 0");
        
        // Check max change percent
        uint256 maxIncrease = (miningDifficulty * (10000 + maxDifficultyChangePercent)) / 10000;
        uint256 maxDecrease = (miningDifficulty * (10000 - maxDifficultyChangePercent)) / 10000;
        require(
            newDifficulty <= maxIncrease && newDifficulty >= maxDecrease,
            "Change exceeds max percent"
        );
        
        bytes32 actionId = keccak256("DIFFICULTY_CHANGE");
        pendingActions[actionId] = PendingAction({
            executeAfter: block.timestamp + TIMELOCK_DURATION,
            newValue: newDifficulty,
            executed: false
        });
        
        emit DifficultyChangeProposed(miningDifficulty, newDifficulty, block.timestamp + TIMELOCK_DURATION);
    }

    /**
     * @notice Execute difficulty change after timelock
     */
    function executeDifficultyChange() external onlyOwner {
        bytes32 actionId = keccak256("DIFFICULTY_CHANGE");
        PendingAction storage action = pendingActions[actionId];
        
        require(action.newValue > 0, "No pending action");
        require(block.timestamp >= action.executeAfter, "Timelock not expired");
        require(!action.executed, "Already executed");
        
        uint256 oldDifficulty = miningDifficulty;
        miningDifficulty = action.newValue;
        action.executed = true;
        
        emit DifficultyChanged(oldDifficulty, miningDifficulty);
    }

    /**
     * @notice Update mining tier
     */
    function updateTier(
        uint8 tier,
        uint256 duration,
        uint256 multiplier,
        uint256 minStake,
        bool active
    ) external onlyOwner {
        require(tier <= 2, "Invalid tier");
        require(multiplier >= 10000 && multiplier <= 50000, "Invalid multiplier");
        
        miningTiers[tier] = MiningTier({
            duration: duration,
            rewardMultiplier: multiplier,
            minStake: minStake,
            active: active
        });
        
        emit TierUpdated(tier, duration, multiplier, minStake);
    }

    /**
     * @notice Emergency mint with limits
     */
    function emergencyMint(address to, uint256 amount) external onlyOwner {
        require(amount <= MAX_EMERGENCY_MINT, "Exceeds max emergency mint");
        
        _resetDailyMintIfNeeded();
        require(dailyMintedAmount + amount <= MAX_DAILY_MINT, "Daily mint limit exceeded");
        
        dailyMintedAmount += amount;
        _mint(to, amount);
        
        emit EmergencyMintExecuted(to, amount);
    }

    /**
     * @notice Update max difficulty change percent
     */
    function setMaxDifficultyChangePercent(uint256 newPercent) external onlyOwner {
        require(newPercent <= 5000, "Max 50%");
        maxDifficultyChangePercent = newPercent;
    }

    // ============ Pausable ============

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ Internal Functions ============

    function _resetDailyMintIfNeeded() private {
        if (block.timestamp >= lastMintTimestamp + 1 days) {
            dailyMintedAmount = 0;
            lastMintTimestamp = block.timestamp;
        }
    }

    // ============ View Functions ============

    function getTotalMiningRewards() external view returns (uint256) {
        return totalMiningRewards;
    }

    function getRemainingDailyMint() external view returns (uint256) {
        if (block.timestamp >= lastMintTimestamp + 1 days) {
            return MAX_DAILY_MINT;
        }
        return MAX_DAILY_MINT - dailyMintedAmount;
    }

    function getTierInfo(uint8 tier) external view returns (MiningTier memory) {
        return miningTiers[tier];
    }
}