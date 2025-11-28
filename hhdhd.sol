// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract BLAN is ERC20, Ownable {
    uint256 public constant MAX_SUPPLY = 10_000_000 * 10**18;
    uint256 public constant EMERGENCY_MINT_CAP = 1_000_000 * 10**18;
    
    address public immutable liquidityWallet;

    constructor(address _liquidityWallet) ERC20("BLAN", "BLAN") Ownable(msg.sender) {
        liquidityWallet = _liquidityWallet;
        
        // Initial minting
        _mint(msg.sender, MAX_SUPPLY - 500_000 * 10**18);
        _mint(liquidityWallet, 500_000 * 10**18);
    }

    function emergencyMint(address to, uint256 amount) external onlyOwner {
        require(amount <= EMERGENCY_MINT_CAP, "Exceeds mint cap");
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
