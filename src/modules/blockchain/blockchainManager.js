const BlockchainService = require('./blockchainService');
const ethers = require('ethers');

class BlockchainManager {
  /**
   * Manager for all blockchain-related operations
   * @param {Object} config - Configuration for blockchain service
   */
  constructor(config) {
    this.service = new BlockchainService(config);
  }
  
  /**
   * Send welcome tokens to a new user
   * @param {string} userAddress - User's wallet address
   * @param {string} userId - User's Telegram ID
   * @returns {Promise<Object>} - Transaction details
   */
  async sendWelcomeTokens(userAddress, userId) {
    console.log(`Sending welcome tokens to ${userAddress} for user ID: ${userId || 'unknown'}`);
    
    // Determine if user is an admin by ID
    const adminsList = process.env.DAO_ADMINS ? process.env.DAO_ADMINS.split(',') : [];
    const isAdmin = userId && adminsList.includes(userId.toString());
    
    // Choose token amount based on admin status
    let welcomeAmount;
    if (isAdmin) {
      welcomeAmount = process.env.WELCOME_ADMINS || "10000";
      console.log(`User ID ${userId} is an admin, sending ${welcomeAmount} tokens`);
    } else {
      welcomeAmount = process.env.WELCOME_TOKENS || "10";
      console.log(`User is a regular member, sending ${welcomeAmount} tokens`);
    }
    
    try {
      // Transfer tokens from admin wallet to user
      const txResult = await this.service.transferTokens(userAddress, welcomeAmount);
      console.log('Welcome tokens sent:', txResult);
      
      // Try to delegate tokens, but don't fail if delegation fails
      let delegationSuccess = false;
      try {
        // Automatically delegate tokens to self to enable voting
        await this.delegateTokens(userAddress, userAddress);
        delegationSuccess = true;
      } catch (delegationError) {
        console.error('Warning: Token delegation failed, but tokens were sent successfully:', delegationError);
        // Continue without failing - user can delegate manually later
      }
      
      return {
        success: true,
        amount: welcomeAmount,
        txHash: txResult.txHash,
        isAdmin: isAdmin,
        delegationSuccess: delegationSuccess
      };
    } catch (error) {
      console.error('Error sending welcome tokens:', error);
      throw new Error(`Failed to send welcome tokens: ${error.message}`);
    }
  }
  
  /**
   * Delegate tokens to enable voting
   * @param {string} delegatorAddress - The address delegating tokens
   * @param {string} delegateeAddress - The address receiving delegation
   * @returns {Promise<Object>} - Delegation result
   */
  async delegateTokens(delegatorAddress, delegateeAddress) {
    try {
      console.log(`Attempting to delegate tokens from ${delegatorAddress} to ${delegateeAddress}`);
      const result = await this.service.delegateVotes(delegatorAddress, delegateeAddress);
      
      // Check if the delegation was successful
      if (result.status === 'success') {
        console.log(`Successfully delegated tokens. Transaction: ${result.txHash}`);
        return {
          success: true,
          txHash: result.txHash,
          blockNumber: result.blockNumber
        };
      } else if (result.delegationError) {
        // This is a specific delegation error, likely due to contract restrictions
        console.warn(`Delegation failed due to contract restrictions: ${result.message}`);
        throw new Error(result.message);
      } else {
        console.error(`Delegation failed with status: ${result.status}`);
        throw new Error(`Failed to delegate tokens: ${result.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error delegating tokens:', error);
      throw new Error(`Failed to delegate tokens: ${error.message}`);
    }
  }
  
  /**
   * Create a proposal on the blockchain
   * @param {Object} proposal - Proposal data
   * @param {ethers.Wallet} userWallet - User's wallet for proposal creation
   * @returns {Promise<Object>} - Proposal creation result
   */
  async createProposal(proposal, userWallet) {
    try {
      const formattedProposal = {
        title: proposal.title,
        description: proposal.description,
        targets: [process.env.TARGET_ADDRESS || this.service.tokenAddress],
        values: ["0"], // No ETH is being sent
        calldatas: ["0x"] // Empty calldata for simple proposals
      };
      
      // Create the proposal using admin wallet (paying gas fees)
      const result = await this.service.createProposal(formattedProposal);
      
      return {
        success: true,
        proposalId: result.proposalId,
        txHash: result.txHash
      };
    } catch (error) {
      console.error('Error creating proposal:', error);
      throw new Error(`Failed to create proposal: ${error.message}`);
    }
  }
  
  /**
   * Submit a vote on a proposal
   * @param {string} proposalId - ID of the proposal
   * @param {ethers.Wallet} userWallet - User's wallet for voting
   * @param {number} voteType - 0: against, 1: for, 2: abstain
   * @returns {Promise<Object>} - Voting result
   */
  async castVote(proposalId, userWallet, voteType) {
    try {
      // Vote using the service (admin pays gas)
      const result = await this.service.voteOnProposal(userWallet, proposalId, voteType);
      return result;
    } catch (error) {
      console.error('Error casting vote:', error);
      throw new Error(`Failed to cast vote: ${error.message}`);
    }
  }
  
  /**
   * Get token balance for a user
   * @param {string} address - User's wallet address
   * @returns {Promise<string>} - Token balance
   */
  async getTokenBalance(address) {
    try {
      const balance = await this.service.getTokenBalance(address);
      return balance;
    } catch (error) {
      console.error('Error getting token balance:', error);
      throw new Error(`Failed to get token balance: ${error.message}`);
    }
  }
  
  /**
   * Get active proposals from the DAO
   * @returns {Promise<Array>} - List of active proposals
   */
  async getActiveProposals() {
    try {
      const proposals = await this.service.getActiveProposals();
      return proposals;
    } catch (error) {
      console.error('Error getting active proposals:', error);
      throw new Error(`Failed to get active proposals: ${error.message}`);
    }
  }
  
  /**
   * Get detailed information about a proposal
   * @param {string} proposalId - ID of the proposal
   * @returns {Promise<Object>} - Proposal details
   */
  async getProposalInfo(proposalId) {
    try {
      const info = await this.service.getProposalInfo(proposalId);
      return info;
    } catch (error) {
      console.error('Error getting proposal info:', error);
      throw new Error(`Failed to get proposal info: ${error.message}`);
    }
  }
}

module.exports = BlockchainManager;
