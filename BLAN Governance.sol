// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IBLANToken {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function proposeDifficultyChange(uint256 newDifficulty) external;
    function executeDifficultyChange() external;
    function updateTier(uint8 tier, uint256 duration, uint256 multiplier, uint256 minStake, bool active) external;
    function transferOwnership(address newOwner) external;
}

/**
 * @title BLANGovernance
 * @dev Decentralized governance for BLAN token parameters
 */
contract BLANGovernance is ReentrancyGuard {
    
    IBLANToken public blanToken;
    
    enum ProposalType {
        DifficultyChange,
        TierUpdate,
        EmergencyAction,
        TreasurySpend
    }
    
    enum ProposalStatus {
        Pending,
        Active,
        Succeeded,
        Defeated,
        Executed,
        Cancelled
    }
    
    struct Proposal {
        uint256 id;
        address proposer;
        ProposalType proposalType;
        string description;
        uint256 startTime;
        uint256 endTime;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        ProposalStatus status;
        bytes proposalData;
        bool executed;
    }
    
    struct Vote {
        bool hasVoted;
        uint8 support; // 0: against, 1: for, 2: abstain
        uint256 votes;
    }
    
    // State variables
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => Vote)) public proposalVotes;
    uint256 public proposalCount;
    
    // Governance parameters
    uint256 public votingDelay = 1 days;
    uint256 public votingPeriod = 7 days;
    uint256 public proposalThreshold = 10000 * 10**18; // 10k tokens to propose
    uint256 public quorumThreshold = 400000 * 10**18; // 4% of 10M total supply
    uint256 public executionDelay = 2 days;
    
    // Treasury
    uint256 public treasuryBalance;
    
    // Events
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        ProposalType proposalType,
        string description
    );
    event VoteCast(
        address indexed voter,
        uint256 indexed proposalId,
        uint8 support,
        uint256 votes
    );
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalCancelled(uint256 indexed proposalId);
    event TreasuryDeposit(address indexed from, uint256 amount);
    
    constructor(address _blanToken) {
        require(_blanToken != address(0), "Invalid token address");
        blanToken = IBLANToken(_blanToken);
    }
    
    // ============ Proposal Creation ============
    
    /**
     * @notice Create a proposal to change mining difficulty
     */
    function proposeDifficultyChange(
        uint256 newDifficulty,
        string memory description
    ) external returns (uint256) {
        require(
            blanToken.balanceOf(msg.sender) >= proposalThreshold,
            "Below proposal threshold"
        );
        
        bytes memory proposalData = abi.encode(newDifficulty);
        
        return _createProposal(
            ProposalType.DifficultyChange,
            description,
            proposalData
        );
    }
    
    /**
     * @notice Create a proposal to update a mining tier
     */
    function proposeTierUpdate(
        uint8 tier,
        uint256 duration,
        uint256 multiplier,
        uint256 minStake,
        bool active,
        string memory description
    ) external returns (uint256) {
        require(
            blanToken.balanceOf(msg.sender) >= proposalThreshold,
            "Below proposal threshold"
        );
        
        bytes memory proposalData = abi.encode(tier, duration, multiplier, minStake, active);
        
        return _createProposal(
            ProposalType.TierUpdate,
            description,
            proposalData
        );
    }
    
    /**
     * @notice Create a proposal to spend from treasury
     */
    function proposeTreasurySpend(
        address recipient,
        uint256 amount,
        string memory description
    ) external returns (uint256) {
        require(
            blanToken.balanceOf(msg.sender) >= proposalThreshold,
            "Below proposal threshold"
        );
        require(amount <= treasuryBalance, "Insufficient treasury");
        
        bytes memory proposalData = abi.encode(recipient, amount);
        
        return _createProposal(
            ProposalType.TreasurySpend,
            description,
            proposalData
        );
    }
    
    function _createProposal(
        ProposalType proposalType,
        string memory description,
        bytes memory proposalData
    ) private returns (uint256) {
        uint256 proposalId = proposalCount++;
        
        Proposal storage proposal = proposals[proposalId];
        proposal.id = proposalId;
        proposal.proposer = msg.sender;
        proposal.proposalType = proposalType;
        proposal.description = description;
        proposal.startTime = block.timestamp + votingDelay;
        proposal.endTime = block.timestamp + votingDelay + votingPeriod;
        proposal.status = ProposalStatus.Pending;
        proposal.proposalData = proposalData;
        
        emit ProposalCreated(proposalId, msg.sender, proposalType, description);
        
        return proposalId;
    }
    
    // ============ Voting ============
    
    /**
     * @notice Cast a vote
     * @param proposalId Proposal ID
     * @param support 0: against, 1: for, 2: abstain
     */
    function castVote(uint256 proposalId, uint8 support) external nonReentrant {
        require(support <= 2, "Invalid support value");
        
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Active || proposal.status == ProposalStatus.Pending, "Proposal not active");
        require(block.timestamp >= proposal.startTime, "Voting not started");
        require(block.timestamp <= proposal.endTime, "Voting ended");
        
        // Update status if needed
        if (proposal.status == ProposalStatus.Pending && block.timestamp >= proposal.startTime) {
            proposal.status = ProposalStatus.Active;
        }
        
        Vote storage vote = proposalVotes[proposalId][msg.sender];
        require(!vote.hasVoted, "Already voted");
        
        uint256 votes = blanToken.balanceOf(msg.sender);
        require(votes > 0, "No voting power");
        
        vote.hasVoted = true;
        vote.support = support;
        vote.votes = votes;
        
        if (support == 0) {
            proposal.againstVotes += votes;
        } else if (support == 1) {
            proposal.forVotes += votes;
        } else {
            proposal.abstainVotes += votes;
        }
        
        emit VoteCast(msg.sender, proposalId, support, votes);
    }
    
    /**
     * @notice Cast vote with reason
     */
    function castVoteWithReason(
        uint256 proposalId,
        uint8 support,
        string calldata reason
    ) external {
        castVote(proposalId, support);
        // Reason stored in event logs only (gas efficient)
    }
    
    // ============ Proposal Execution ============
    
    /**
     * @notice Finalize proposal after voting period
     */
    function finalizeProposal(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(
            proposal.status == ProposalStatus.Active || proposal.status == ProposalStatus.Pending,
            "Proposal not active"
        );
        require(block.timestamp > proposal.endTime, "Voting still active");
        
        uint256 totalVotes = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
        
        if (totalVotes >= quorumThreshold && proposal.forVotes > proposal.againstVotes) {
            proposal.status = ProposalStatus.Succeeded;
        } else {
            proposal.status = ProposalStatus.Defeated;
        }
    }
    
    /**
     * @notice Execute a successful proposal
     */
    function executeProposal(uint256 proposalId) external nonReentrant {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.Succeeded, "Proposal not succeeded");
        require(!proposal.executed, "Already executed");
        require(
            block.timestamp >= proposal.endTime + executionDelay,
            "Execution delay not met"
        );
        
        proposal.executed = true;
        proposal.status = ProposalStatus.Executed;
        
        if (proposal.proposalType == ProposalType.DifficultyChange) {
            _executeDifficultyChange(proposal.proposalData);
        } else if (proposal.proposalType == ProposalType.TierUpdate) {
            _executeTierUpdate(proposal.proposalData);
        } else if (proposal.proposalType == ProposalType.TreasurySpend) {
            _executeTreasurySpend(proposal.proposalData);
        }
        
        emit ProposalExecuted(proposalId);
    }
    
    function _executeDifficultyChange(bytes memory data) private {
        uint256 newDifficulty = abi.decode(data, (uint256));
        blanToken.proposeDifficultyChange(newDifficulty);
    }
    
    function _executeTierUpdate(bytes memory data) private {
        (uint8 tier, uint256 duration, uint256 multiplier, uint256 minStake, bool active) = 
            abi.decode(data, (uint8, uint256, uint256, uint256, bool));
        
        blanToken.updateTier(tier, duration, multiplier, minStake, active);
    }
    
    function _executeTreasurySpend(bytes memory data) private {
        (address recipient, uint256 amount) = abi.decode(data, (address, uint256));
        
        require(treasuryBalance >= amount, "Insufficient treasury");
        treasuryBalance -= amount;
        
        require(blanToken.transfer(recipient, amount), "Transfer failed");
    }
    
    /**
     * @notice Cancel a proposal (only proposer before voting starts)
     */
    function cancelProposal(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(msg.sender == proposal.proposer, "Not proposer");
        require(block.timestamp < proposal.startTime, "Voting started");
        require(proposal.status == ProposalStatus.Pending, "Not pending");
        
        proposal.status = ProposalStatus.Cancelled;
        
        emit ProposalCancelled(proposalId);
    }
    
    // ============ Treasury Management ============
    
    /**
     * @notice Deposit tokens to treasury
     */
    function depositToTreasury(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(blanToken.transfer(address(this), amount), "Transfer failed");
        
        treasuryBalance += amount;
        
        emit TreasuryDeposit(msg.sender, amount);
    }
    
    // ============ View Functions ============
    
    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }
    
    function getVote(uint256 proposalId, address voter) external view returns (Vote memory) {
        return proposalVotes[proposalId][voter];
    }
    
    function getProposalStatus(uint256 proposalId) external view returns (ProposalStatus) {
        Proposal memory proposal = proposals[proposalId];
        
        if (proposal.status == ProposalStatus.Active && block.timestamp > proposal.endTime) {
            // Check if should be finalized
            uint256 totalVotes = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
            
            if (totalVotes >= quorumThreshold && proposal.forVotes > proposal.againstVotes) {
                return ProposalStatus.Succeeded;
            } else {
                return ProposalStatus.Defeated;
            }
        }
        
        return proposal.status;
    }
    
    function getVotingPower(address account) external view returns (uint256) {
        return blanToken.balanceOf(account);
    }
    
    function hasVoted(uint256 proposalId, address voter) external view returns (bool) {
        return proposalVotes[proposalId][voter].hasVoted;
    }
    
    function isQuorumReached(uint256 proposalId) external view returns (bool) {
        Proposal memory proposal = proposals[proposalId];
        uint256 totalVotes = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
        return totalVotes >= quorumThreshold;
    }
    
    function getProposalVotes(uint256 proposalId) external view returns (
        uint256 forVotes,
        uint256 againstVotes,
        uint256 abstainVotes
    ) {
        Proposal memory proposal = proposals[proposalId];
        return (proposal.forVotes, proposal.againstVotes, proposal.abstainVotes);
    }
    
    // ============ Parameter Updates (via governance) ============
    
    function updateVotingDelay(uint256 newDelay) external {
        require(msg.sender == address(this), "Only governance");
        votingDelay = newDelay;
    }
    
    function updateVotingPeriod(uint256 newPeriod) external {
        require(msg.sender == address(this), "Only governance");
        votingPeriod = newPeriod;
    }
    
    function updateProposalThreshold(uint256 newThreshold) external {
        require(msg.sender == address(this), "Only governance");
        proposalThreshold = newThreshold;
    }
    
    function updateQuorumThreshold(uint256 newThreshold) external {
        require(msg.sender == address(this), "Only governance");
        quorumThreshold = newThreshold;
    }
}