// scripts/deploy.js - Complete deployment script
const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  console.log("Starting BLAN Token V2 deployment...");
  
  // Get deployer
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());
  
  // Configuration
  const LIQUIDITY_WALLET = process.env.LIQUIDITY_WALLET || deployer.address;
  const INITIAL_DIFFICULTY = ethers.parseEther("1000");
  
  console.log("\nDeployment Configuration:");
  console.log("- Liquidity Wallet:", LIQUIDITY_WALLET);
  console.log("- Initial Difficulty:", INITIAL_DIFFICULTY.toString());
  
  // Deploy BLAN Token
  console.log("\n1. Deploying BLANTokenV2...");
  const BLANToken = await ethers.getContractFactory("BLANTokenV2");
  const blanToken = await BLANToken.deploy(LIQUIDITY_WALLET, INITIAL_DIFFICULTY);
  await blanToken.waitForDeployment();
  
  const tokenAddress = await blanToken.getAddress();
  console.log("✅ BLANTokenV2 deployed to:", tokenAddress);
  
  // Deploy Governance
  console.log("\n2. Deploying BLANGovernance...");
  const BLANGovernance = await ethers.getContractFactory("BLANGovernance");
  const governance = await BLANGovernance.deploy(tokenAddress);
  await governance.waitForDeployment();
  
  const governanceAddress = await governance.getAddress();
  console.log("✅ BLANGovernance deployed to:", governanceAddress);
  
  // Transfer ownership to governance (optional - comment out if you want to keep control)
  // console.log("\n3. Transferring token ownership to governance...");
  // await blanToken.transferOwnership(governanceAddress);
  // console.log("✅ Ownership transferred");
  
  // Verify deployment
  console.log("\n=== Deployment Summary ===");
  console.log("BLANTokenV2:", tokenAddress);
  console.log("BLANGovernance:", governanceAddress);
  console.log("Network:", hre.network.name);
  console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId);
  
  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    timestamp: new Date().toISOString(),
    contracts: {
      BLANTokenV2: tokenAddress,
      BLANGovernance: governanceAddress
    },
    deployer: deployer.address,
    config: {
      liquidityWallet: LIQUIDITY_WALLET,
      initialDifficulty: INITIAL_DIFFICULTY.toString()
    }
  };
  
  const fs = require('fs');
  fs.writeFileSync(
    `deployments/${hre.network.name}.json`,
    JSON.stringify(deploymentInfo, null, 2)
  );
  console.log(`\n✅ Deployment info saved to deployments/${hre.network.name}.json`);
  
  // Verification instructions
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("\n=== Verification Commands ===");
    console.log(`npx hardhat verify --network ${hre.network.name} ${tokenAddress} "${LIQUIDITY_WALLET}" "${INITIAL_DIFFICULTY}"`);
    console.log(`npx hardhat verify --network ${hre.network.name} ${governanceAddress} "${tokenAddress}"`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

// scripts/interact.js - Interaction script for testing
async function interact() {
  const [owner, user1] = await ethers.getSigners();
  
  // Load deployment
  const deploymentInfo = require(`../deployments/${hre.network.name}.json`);
  const tokenAddress = deploymentInfo.contracts.BLANTokenV2;
  
  const BLANToken = await ethers.getContractFactory("BLANTokenV2");
  const blanToken = BLANToken.attach(tokenAddress);
  
  console.log("=== BLAN Token Interaction ===");
  console.log("Token Address:", tokenAddress);
  
  // Check balances
  console.log("\n1. Checking balances...");
  const ownerBalance = await blanToken.balanceOf(owner.address);
  console.log("Owner balance:", ethers.formatEther(ownerBalance), "BLAN");
  
  // Check mining tiers
  console.log("\n2. Mining Tiers:");
  for (let i = 0; i < 3; i++) {
    const tier = await blanToken.getTierInfo(i);
    console.log(`Tier ${i}:`);
    console.log(`  Duration: ${tier.duration / (24 * 60 * 60)} days`);
    console.log(`  Multiplier: ${tier.rewardMultiplier / 100}%`);
    console.log(`  Min Stake: ${ethers.formatEther(tier.minStake)} BLAN`);
    console.log(`  Active: ${tier.active}`);
  }
  
  // Start mining (example)
  console.log("\n3. Starting mining session...");
  const stakeAmount = ethers.parseEther("1000");
  const tier = 0;
  
  try {
    const tx = await blanToken.startMining(stakeAmount, tier);
    await tx.wait();
    console.log("✅ Mining session started");
    console.log("Transaction:", tx.hash);
    
    // Check session
    const sessions = await blanToken.getUserSessions(owner.address);
    console.log("Active sessions:", sessions.length);
    if (sessions.length > 0) {
      const session = sessions[sessions.length - 1];
      console.log("Latest session:");
      console.log(`  Amount: ${ethers.formatEther(session.amount)} BLAN`);
      console.log(`  Start: ${new Date(Number(session.startTime) * 1000).toLocaleString()}`);
      console.log(`  End: ${new Date(Number(session.endTime) * 1000).toLocaleString()}`);
      console.log(`  Active: ${session.active}`);
    }
  } catch (error) {
    console.log("❌ Error:", error.message);
  }
  
  // Check governance
  const governanceAddress = deploymentInfo.contracts.BLANGovernance;
  const BLANGovernance = await ethers.getContractFactory("BLANGovernance");
  const governance = BLANGovernance.attach(governanceAddress);
  
  console.log("\n4. Governance Info:");
  console.log("Proposal threshold:", ethers.formatEther(await governance.proposalThreshold()), "BLAN");
  console.log("Quorum threshold:", ethers.formatEther(await governance.quorumThreshold()), "BLAN");
  console.log("Voting period:", (await governance.votingPeriod()) / (24 * 60 * 60), "days");
  console.log("Total proposals:", (await governance.proposalCount()).toString());
}

// scripts/propose.js - Create governance proposal
async function propose() {
  const [proposer] = await ethers.getSigners();
  
  const deploymentInfo = require(`../deployments/${hre.network.name}.json`);
  const governanceAddress = deploymentInfo.contracts.BLANGovernance;
  
  const BLANGovernance = await ethers.getContractFactory("BLANGovernance");
  const governance = BLANGovernance.attach(governanceAddress);
  
  console.log("=== Creating Governance Proposal ===");
  
  // Check voting power
  const votingPower = await governance.getVotingPower(proposer.address);
  console.log("Your voting power:", ethers.formatEther(votingPower), "BLAN");
  
  const threshold = await governance.proposalThreshold();
  console.log("Proposal threshold:", ethers.formatEther(threshold), "BLAN");
  
  if (votingPower < threshold) {
    console.log("❌ Insufficient tokens to propose");
    return;
  }
  
  // Create proposal to adjust difficulty
  const newDifficulty = ethers.parseEther("1100");
  const description = "Adjust mining difficulty to 1100 to maintain healthy reward rate";
  
  console.log("\nProposal Details:");
  console.log("Type: Difficulty Change");
  console.log("New Difficulty:", ethers.formatEther(newDifficulty));
  console.log("Description:", description);
  
  const tx = await governance.proposeDifficultyChange(newDifficulty, description);
  const receipt = await tx.wait();
  
  // Get proposal ID from event
  const event = receipt.logs.find(log => {
    try {
      return governance.interface.parseLog(log).name === "ProposalCreated";
    } catch (e) {
      return false;
    }
  });
  
  if (event) {
    const parsedEvent = governance.interface.parseLog(event);
    const proposalId = parsedEvent.args.proposalId;
    console.log("\n✅ Proposal created!");
    console.log("Proposal ID:", proposalId.toString());
    console.log("Transaction:", tx.hash);
    
    const proposal = await governance.getProposal(proposalId);
    console.log("\nVoting starts:", new Date(Number(proposal.startTime) * 1000).toLocaleString());
    console.log("Voting ends:", new Date(Number(proposal.endTime) * 1000).toLocaleString());
  }
}

// scripts/vote.js - Vote on proposal
async function vote() {
  const [voter] = await ethers.getSigners();
  
  const deploymentInfo = require(`../deployments/${hre.network.name}.json`);
  const governanceAddress = deploymentInfo.contracts.BLANGovernance;
  
  const BLANGovernance = await ethers.getContractFactory("BLANGovernance");
  const governance = BLANGovernance.attach(governanceAddress);
  
  console.log("=== Vote on Proposal ===");
  
  const proposalId = process.argv[2] || 0;
  console.log("Proposal ID:", proposalId);
  
  // Get proposal details
  const proposal = await governance.getProposal(proposalId);
  console.log("\nProposal Details:");
  console.log("Proposer:", proposal.proposer);
  console.log("Description:", proposal.description);
  console.log("Status:", proposal.status);
  
  const [forVotes, againstVotes, abstainVotes] = await governance.getProposalVotes(proposalId);
  console.log("\nCurrent Votes:");
  console.log("For:", ethers.formatEther(forVotes), "BLAN");
  console.log("Against:", ethers.formatEther(againstVotes), "BLAN");
  console.log("Abstain:", ethers.formatEther(abstainVotes), "BLAN");
  
  // Check if can vote
  const hasVoted = await governance.hasVoted(proposalId, voter.address);
  if (hasVoted) {
    console.log("\n❌ You have already voted on this proposal");
    return;
  }
  
  const votingPower = await governance.getVotingPower(voter.address);
  console.log("\nYour voting power:", ethers.formatEther(votingPower), "BLAN");
  
  // Cast vote (1 = for, 0 = against, 2 = abstain)
  const support = 1; // Vote FOR
  console.log(`\nCasting vote: ${support === 1 ? 'FOR' : support === 0 ? 'AGAINST' : 'ABSTAIN'}`);
  
  const tx = await governance.castVote(proposalId, support);
  await tx.wait();
  
  console.log("✅ Vote cast successfully!");
  console.log("Transaction:", tx.hash);
  
  // Show updated votes
  const [newFor, newAgainst, newAbstain] = await governance.getProposalVotes(proposalId);
  console.log("\nUpdated Votes:");
  console.log("For:", ethers.formatEther(newFor), "BLAN");
  console.log("Against:", ethers.formatEther(newAgainst), "BLAN");
  console.log("Abstain:", ethers.formatEther(newAbstain), "BLAN");
  
  const quorumReached = await governance.isQuorumReached(proposalId);
  console.log("Quorum reached:", quorumReached);
}

// scripts/monitor.js - Monitor contract activity
async function monitor() {
  const deploymentInfo = require(`../deployments/${hre.network.name}.json`);
  const tokenAddress = deploymentInfo.contracts.BLANTokenV2;
  
  const BLANToken = await ethers.getContractFactory("BLANTokenV2");
  const blanToken = BLANToken.attach(tokenAddress);
  
  console.log("=== BLAN Token Monitor ===");
  console.log("Monitoring:", tokenAddress);
  console.log("Press Ctrl+C to stop\n");
  
  // Listen for events
  blanToken.on("MiningStarted", (user, sessionId, amount, tier, event) => {
    console.log(`\n🔨 Mining Started`);
    console.log(`User: ${user}`);
    console.log(`Session ID: ${sessionId}`);
    console.log(`Amount: ${ethers.formatEther(amount)} BLAN`);
    console.log(`Tier: ${tier}`);
    console.log(`Tx: ${event.log.transactionHash}`);
  });
  
  blanToken.on("MiningCompleted", (user, sessionId, amount, event) => {
    console.log(`\n✅ Mining Completed`);
    console.log(`User: ${user}`);
    console.log(`Session ID: ${sessionId}`);
    console.log(`Amount: ${ethers.formatEther(amount)} BLAN`);
    console.log(`Tx: ${event.log.transactionHash}`);
  });
  
  blanToken.on("RewardClaimed", (user, sessionId, reward, event) => {
    console.log(`\n💰 Reward Claimed`);
    console.log(`User: ${user}`);
    console.log(`Session ID: ${sessionId}`);
    console.log(`Reward: ${ethers.formatEther(reward)} BLAN`);
    console.log(`Tx: ${event.log.transactionHash}`);
  });
  
  blanToken.on("DifficultyChanged", (oldDifficulty, newDifficulty, event) => {
    console.log(`\n⚙️ Difficulty Changed`);
    console.log(`Old: ${ethers.formatEther(oldDifficulty)}`);
    console.log(`New: ${ethers.formatEther(newDifficulty)}`);
    console.log(`Tx: ${event.log.transactionHash}`);
  });
  
  // Keep alive
  await new Promise(() => {});
}

// Export functions
if (require.main === module) {
  const command = process.argv[2];
  
  switch(command) {
    case 'deploy':
      main();
      break;
    case 'interact':
      interact();
      break;
    case 'propose':
      propose();
      break;
    case 'vote':
      vote();
      break;
    case 'monitor':
      monitor();
      break;
    default:
      console.log('Usage: node scripts/all.js [deploy|interact|propose|vote|monitor]');
  }
}