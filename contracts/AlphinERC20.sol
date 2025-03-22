// contracts/CATToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract AlphinToken is ERC20, ERC20Permit, ERC20Votes, Ownable {
    // Add mapping to track admin-delegated addresses
    mapping(address => bool) public adminDelegatedAddresses;

    constructor() 
        ERC20("Alphin Token", "APH") 
        ERC20Permit("Alphin")
        Ownable(msg.sender)
    {
        // Mint inicial: 1M tokens
        _mint(msg.sender, 1000000 * 10**decimals());
    }

    /**
     * Allow the admin to delegate votes on behalf of users
     * This is used by the Telegram bot to automate delegation without requiring users to pay gas
     * @param delegator The address delegating their votes
     * @param delegatee The address receiving the delegation
     */
    function adminDelegateFor(address delegator, address delegatee) public onlyOwner {
        // Record that this address has been delegated by admin
        adminDelegatedAddresses[delegator] = true;
        
        // Call the internal _delegate function
        _delegate(delegator, delegatee);
        
        // Emit an event for transparency
        emit AdminDelegation(delegator, delegatee, msg.sender);
    }

    // Custom event for admin delegations
    event AdminDelegation(address indexed delegator, address indexed delegatee, address indexed admin);

    // The following functions are overrides required by Solidity
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
    {
        super._update(from, to, value);
    }

    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}