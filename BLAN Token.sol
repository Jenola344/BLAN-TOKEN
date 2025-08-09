// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";


contract BLANToken is ERC20, Ownable, ReentrancyGuard {
    // Token constants
    uint256 public constant TOTAL_SUPPLY = 10_000_000 * 10**18; // 10M BLAN
    uint256 public constant LIQUIDITY_ALLOCATION = 500_000 * 10**18; // 500K BLAN
    
    // Liquidity wallet address
    address public immutable liquidityWallet;
    bool public liquidityAllocated = false;
    
    // Events
    event LiquidityAllocated(address indexed liquidityWallet, uint256 amount);
    event TokensDeployed(address indexed owner, uint256 totalSupply);
    

    constructor(address _liquidityWallet) 
        ERC20("BLAN", "BLAN") 
        Ownable(msg.sender) 
    {
        // Input validation
        require(_liquidityWallet != address(0), "BLAN: liquidity wallet cannot be zero address");
        require(_liquidityWallet != msg.sender, "BLAN: liquidity wallet cannot be deployer");
        
        // Set immutable liquidity wallet
        liquidityWallet = _liquidityWallet;
        
        // Mint total supply to deployer
        _mint(msg.sender, TOTAL_SUPPLY);
        
        // Emit deployment event
        emit TokensDeployed(msg.sender, TOTAL_SUPPLY);
    }
    
    /**
     * @dev Allocate initial liquidity (separate function to reduce deployment gas)
     */
    function allocateInitialLiquidity() external onlyOwner {
        require(!liquidityAllocated, "BLAN: liquidity already allocated");
        require(balanceOf(msg.sender) >= LIQUIDITY_ALLOCATION, "BLAN: insufficient balance for allocation");
        
        _transfer(msg.sender, liquidityWallet, LIQUIDITY_ALLOCATION);
        liquidityAllocated = true;
        
        emit LiquidityAllocated(liquidityWallet, LIQUIDITY_ALLOCATION);
    }
    
    /**
     * @dev Returns the number of decimals used for token amounts
     * @return uint8 Number of decimals (18)
     */
    function decimals() public pure override returns (uint8) {
        return 18;
    }
    
    
    function transfer(address to, uint256 amount) public override returns (bool) {
        require(to != address(0), "BLAN: transfer to zero address");
        require(to != address(this), "BLAN: transfer to contract address");
        return super.transfer(to, amount);
    }
    
    /**
     * @dev Enhanced transferFrom function with additional security checks
     * @param from Sender address
     * @param to Recipient address  
     * @param amount Amount to transfer
     * @return bool Success status
     */
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        require(from != address(0), "BLAN: transfer from zero address");
        require(to != address(0), "BLAN: transfer to zero address");
        require(to != address(this), "BLAN: transfer to contract address");
        return super.transferFrom(from, to, amount);
    }
    
    /**
     * @dev Burn tokens from caller's balance
     * @param amount Amount of tokens to burn
     */
    function burn(uint256 amount) external {
        require(amount > 0, "BLAN: burn amount must be greater than zero");
        _burn(msg.sender, amount);
    }
    
    /**
     * @dev Burn tokens from specified account (requires allowance)
     * @param from Account to burn tokens from
     * @param amount Amount of tokens to burn
     */
    function burnFrom(address from, uint256 amount) external {
        require(from != address(0), "BLAN: burn from zero address");
        require(amount > 0, "BLAN: burn amount must be greater than zero");
        
        uint256 currentAllowance = allowance(from, msg.sender);
        require(currentAllowance >= amount, "BLAN: burn amount exceeds allowance");
        
        _approve(from, msg.sender, currentAllowance - amount);
        _burn(from, amount);
    }
    
    /**
     * @dev Emergency mint function (only owner) - use with extreme caution
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function emergencyMint(address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "BLAN: mint to zero address");
        require(amount > 0, "BLAN: mint amount must be greater than zero");
        require(amount <= 1_000_000 * 10**18, "BLAN: mint amount too large"); // Max 1M per mint
        
        _mint(to, amount);
    }
    
    /**
     * @dev Recover accidentally sent ERC-20 tokens (not BLAN)
     * @param tokenAddress Address of the token to recover
     * @param amount Amount to recover
     */
    function recoverERC20(address tokenAddress, uint256 amount) external onlyOwner {
        require(tokenAddress != address(0), "BLAN: token address cannot be zero");
        require(tokenAddress != address(this), "BLAN: cannot recover BLAN tokens");
        require(amount > 0, "BLAN: recovery amount must be greater than zero");
        
        IERC20 token = IERC20(tokenAddress);
        require(token.balanceOf(address(this)) >= amount, "BLAN: insufficient token balance");
        
        require(token.transfer(owner(), amount), "BLAN: token recovery failed");
    }
    
 
    function getContractInfo() external view returns (
        string memory tokenName,
        string memory tokenSymbol,
        uint256 tokenTotalSupply,
        address tokenLiquidityWallet,
        uint256 tokenDecimals,
        bool isLiquidityAllocated
    ) {
        return (
            name(),
            symbol(),
            totalSupply(),
            liquidityWallet,
            decimals(),
            liquidityAllocated
        );
    }
    
    /**
     * @dev Check if address has sufficient balance for transfer
     * @param account Address to check
     * @param amount Amount to check against
     * @return bool Whether account has sufficient balance
     */
    function hasSufficientBalance(address account, uint256 amount) external view returns (bool) {
        return balanceOf(account) >= amount;
    }
}