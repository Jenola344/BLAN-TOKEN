# BLAN Token

An ERC-20 token implementation on Base with integrated mining mechanics and liquidity management.

## Contract Details

**Mainnet (Base):** `0x8d75935f78fcd5e0fbf532be84d0089dc7f1a6c2`  
**Testnet (Base Sepolia):** `0x116e18938fb5e1586b5781ecc6178daafa191138`

| Parameter | Value |
|-----------|-------|
| Name | BLAN |
| Symbol | BLAN |
| Decimals | 18 |
| Total Supply | 10,000,000 |
| Compiler | Solidity 0.8.30 |
| License | MIT |

## What This Is

BLAN is an ERC-20 token with two extensions: a mining mechanism that lets holders stake tokens to earn rewards, and automated liquidity allocation on deployment. It's built on Base using OpenZeppelin's audited contract libraries.

The mining feature isn't proof-of-work in the traditional sense—it's a time-locked staking system where users lock tokens for a period and receive newly minted tokens as rewards. The "mining" terminology is somewhat misleading but reflects the intended user experience.

## Architecture

The contract inherits from:
- `ERC20` - Standard token functionality
- `Ownable` - Access control for admin functions
- `ReentrancyGuard` - Protection against reentrancy attacks

Key design decisions:
- Immutable liquidity wallet address (set at deployment, cannot change)
- Automatic transfer of 500k tokens to liquidity on deployment
- Owner-controlled mining difficulty and emergency mint (capped at 1M per call)
- No proxy pattern—this is a fixed implementation

The liquidity wallet address is immutable after deployment. Choose carefully.


## Mining Mechanism

The mining system works like this:

1. User calls `startMining(amount)` with tokens they want to stake
2. Tokens are transferred to the contract and locked
3. After the mining period elapses, user calls `completeMining()`
4. Tokens are unlocked and returned to user
5. User calls `claimMiningReward()` to receive newly minted reward tokens

**Reward calculation:** Based on staked amount, time locked, and mining difficulty parameter. The exact formula is in the contract code.

**Security considerations:**
- Reentrancy protected on all mining functions
- Users can only have one active mining session at a time
- Rewards are minted, increasing total supply
- Owner can adjust difficulty but cannot manipulate active stakes

## Gas Costs

Approximate costs on Base (actual costs vary with network conditions):

| Operation | Gas Used |
|-----------|----------|
| Deploy | ~1.2M |
| transfer | ~21k |
| approve | ~46k |
| startMining | ~55k |
| completeMining | ~40k |
| claimMiningReward | ~35k |
| burn | ~29k |

Base has significantly lower gas costs than Ethereum mainnet, typically 10-100x cheaper.

## Security Audit Notes

This contract has not been professionally audited. Key security considerations:

**Strengths:**
- Uses OpenZeppelin's audited base contracts
- Solidity 0.8.30 has built-in overflow protection
- ReentrancyGuard on state-changing functions
- Proper access control with Ownable
- No delegatecall or selfdestruct
- Events for all significant state changes

**Potential concerns:**
- Mining reward calculation could inflate supply unexpectedly if parameters are misconfigured
- `emergencyMint` is a centralization risk (owner can mint up to 1M tokens per call)
- No pause mechanism if issues are discovered
- Immutable liquidity wallet cannot be changed if private key is lost
- Mining difficulty adjustment by owner could affect user rewards mid-stake

**Recommendations before production:**
- Third-party audit, especially mining logic
- Timelocks on admin functions
- Consider adding a pause mechanism
- Test mining economics extensively on testnet
- Monitor supply inflation from mining rewards

## Common Issues

**"Insufficient balance for transfer"**
- Check token balance: `blanToken.balanceOf(address)`
- Tokens may be staked in mining

**"Mining already active"**
- Complete current mining session first
- One mining session per address at a time

**"Mining period not complete"**
- Wait for the required time period
- Check `getMiningStatus()` for timing details

**Deployment fails on mainnet**
- Verify you have Base ETH for gas
- Check RPC URL is correct
- Confirm private key format (with or without 0x prefix)


## Network Information

**Base Mainnet:**
- Chain ID: 8453
- RPC: https://mainnet.base.org
- Explorer: https://basescan.org
- Native Token: ETH

**Base Sepolia Testnet:**
- Chain ID: 84532  
- RPC: https://sepolia.base.org
- Explorer: https://sepolia.basescan.org
- Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet

Add to MetaMask manually if not auto-detected.

## Contributing : Open for all either you are frontend developer, backend developer, smart contract developer or full-stack developer

Contributions welcome. Before submitting PRs:

1. Run full test suite
2. Add tests for new features
3. Update documentation
4. Follow existing code style
5. Explain the problem your PR solves

Focus areas for contribution:
- Additional test coverage
- Gas optimizations
- Documentation improvements
- Bug reports with reproduction steps

## License

MIT License - see LICENSE file

## Disclaimer

 The authors are not responsible for lost funds, bugs, or security vulnerabilities.
