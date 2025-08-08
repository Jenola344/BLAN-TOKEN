# BLAN Token 🪙

**BLAN** is a secure, efficient ERC-20 token built for the Base blockchain with automatic liquidity allocation and advanced security features.

## 📋 Token Specifications

| Property | Value |
|----------|--------|
| **Name** | BLAN |
| **Symbol** | BLAN |
| **Decimals** | 18 |
| **Total Supply** | 10,000,000 BLAN |
| **Blockchain** | Base |
| **Standard** | ERC-20 |


## 🔧 Deployment

### Deploy to Base Mainnet

```bash
# Set environment variables
export PRIVATE_KEY="your-private-key"
export LIQUIDITY_WALLET="0x..." # Replace with actual liquidity wallet address
export BASE_RPC_URL="https://mainnet.base.org"

# Deploy using Hardhat
npx hardhat run scripts/deploy.js --network base

# Deploy using Foundry
forge create --rpc-url $BASE_RPC_URL \
  --private-key $PRIVATE_KEY \
  src/BLANToken.sol:BLANToken \
  --constructor-args $LIQUIDITY_WALLET
```

### Deploy to Base Testnet (Sepolia)

```bash
export BASE_SEPOLIA_RPC_URL="https://sepolia.base.org"

# Deploy to testnet
npx hardhat run scripts/deploy.js --network base-sepolia
```

## 📊 Contract Features

### Core Functions

#### Standard ERC-20 Functions
- `transfer(address to, uint256 amount)` - Transfer tokens
- `transferFrom(address from, address to, uint256 amount)` - Transfer tokens on behalf
- `approve(address spender, uint256 amount)` - Approve spending allowance
- `balanceOf(address account)` - Check token balance
- `allowance(address owner, address spender)` - Check spending allowance

#### Enhanced Security Functions
- Enhanced `transfer()` and `transferFrom()` with additional safety checks
- Protection against zero address and contract address transfers

#### Token Management
- `burn(uint256 amount)` - Burn tokens from caller's balance
- `burnFrom(address from, uint256 amount)` - Burn tokens from approved account
- `emergencyMint(address to, uint256 amount)` - Owner-only emergency minting (max 1M per call)

#### Utility Functions
- `getContractInfo()` - Returns contract details
- `hasSufficientBalance(address account, uint256 amount)` - Check balance sufficiency
- `recoverERC20(address tokenAddress, uint256 amount)` - Recover accidentally sent tokens

### Automatic Features

Upon deployment, the contract automatically:
1. **Mints** 10,000,000 BLAN to the deployer's address
2. **Transfers** 500,000 BLAN to the designated liquidity wallet
3. **Emits** deployment and liquidity allocation events

## 🔐 Security Features

### Input Validation
- Zero address protection on all transfers
- Contract address transfer prevention
- Parameter validation on all functions

### Access Control
- **Ownable**: Critical functions restricted to contract owner
- **ReentrancyGuard**: Protection against reentrancy attacks
- **Immutable Liquidity Wallet**: Cannot be changed after deployment

### Best Practices
- Uses OpenZeppelin's battle-tested contracts
- Comprehensive event emissions
- Gas-optimized operations
- No backdoors or unnecessary privileges

## 🧪 Testing

```bash
# Run all tests
npx hardhat test

# Run specific test file
npx hardhat test test/BLANToken.test.js

# Check test coverage
npx hardhat coverage
```

### Test Cases Covered
- Deployment and initial allocation
- Standard ERC-20 functionality
- Security validations
- Access control
- Burn functionality
- Emergency mint restrictions
- Token recovery

## 📈 Gas Optimization

The contract implements several gas optimization techniques:

- **Immutable Variables**: `liquidityWallet` saved as immutable
- **Constants**: Supply values stored as constants
- **Minimal Storage**: Reduces unnecessary storage operations
- **Efficient Events**: Proper event emission without gas waste

### Estimated Gas Costs (Base Network)
- **Deployment**: ~1,200,000 gas
- **Transfer**: ~21,000 gas
- **Approve**: ~46,000 gas
- **Burn**: ~29,000 gas

## 🌐 Network Configuration

### Base Mainnet
- **Chain ID**: 8453
- **RPC URL**: https://mainnet.base.org
- **Block Explorer**: https://basescan.org

### Base Sepolia Testnet
- **Chain ID**: 84532
- **RPC URL**: https://sepolia.base.org
- **Block Explorer**: https://sepolia.basescan.org
- **Faucet**: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet

## 🔍 Contract Verification

### Verify on BaseScan

```bash
npx hardhat verify --network base <CONTRACT_ADDRESS> <LIQUIDITY_WALLET_ADDRESS>
```

### Manual Verification
1. Go to [BaseScan](https://basescan.org)
2. Navigate to your contract address
3. Click "Verify and Publish"
4. Select "Solidity (Single File)"
5. Upload the flattened contract code
6. Set compiler version: v0.8.19
7. Set optimization: Yes (200 runs)
8. Add constructor arguments (ABI-encoded liquidity wallet address)



## 🛡️ Security Audit Checklist

- [x] Uses OpenZeppelin contracts
- [x] No integer overflow/underflow (Solidity 0.8.19+)
- [x] Reentrancy protection implemented
- [x] Access control properly configured
- [x] Input validation on all functions
- [x] Event emissions for transparency
- [x] No backdoors or hidden mint functions
- [x] Proper error handling with descriptive messages




## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This smart contract is provided as-is. While extensively tested and following security best practices, users should:

1. **Conduct thorough testing** before mainnet deployment
2. **Consider professional audit** for production use
3. **Understand the risks** associated with smart contracts
4. **Test on testnets** before mainnet deployment


## 📊 Contract Addresses

### Mainnet (Base)
- **Contract Address**: `TBD` (To Be Deployed)
- **Liquidity Wallet**: `TBD` (To Be deployment)

### Testnet (Base Sepolia)
- **Contract Address**: `TBD` (For testing purposes)

---

**Built with ❤️ for the Base ecosystem**
