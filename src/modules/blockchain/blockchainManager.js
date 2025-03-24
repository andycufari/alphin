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
      // Transfer tokens from admin wallet to user using improved method
      const txResult = await this.service.sendWelcomeTokensWithDelegation(userAddress, welcomeAmount);
      console.log('Welcome tokens sent:', txResult);
      
      // Check delegation result
      let delegationSuccess = false;
      if (txResult.delegation && txResult.delegation.success) {
        delegationSuccess = true;
        console.log(`Token delegation successful using method: ${txResult.delegation.method}`);
      } else {
        console.warn('Token delegation was not successful in initial attempt');
        
        // Try alternative delegation approach if first attempt failed
        try {
          // Attempt delegation again with a slight delay to ensure token transfer is fully processed
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
          
          console.log('Attempting fallback delegation...');
          const delegationResult = await this.service.handleNewUserDelegation(userAddress);
          delegationSuccess = delegationResult.success;
          
          if (delegationSuccess) {
            console.log('Fallback delegation was successful');
          } else {
            console.warn('Fallback delegation also failed');
          }
        } catch (fallbackError) {
          console.error('Error in fallback delegation:', fallbackError);
        }
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
   * @param {Object} options - Optional parameters
   * @param {ethers.Wallet} options.userWallet - User's wallet for signing (if available)
   * @returns {Promise<Object>} - Delegation result
   */
  async delegateTokens(delegatorAddress, delegateeAddress, options = {}) {
    try {
      console.log(`Attempting to delegate tokens from ${delegatorAddress} to ${delegateeAddress}`);
      
      let result;
      // If user wallet is provided, use it for signing
      if (options.userWallet) {
        console.log('User wallet provided for delegation');
        // Implement wallet-based delegation later
        // This would involve getting the signature from the user's wallet
        result = await this.service.delegateVotes(delegatorAddress, delegateeAddress);
      } else {
        // Otherwise use the standard delegation method
        result = await this.service.delegateVotes(delegatorAddress, delegateeAddress);
      }
      
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
      console.log(`Casting vote on proposal ${proposalId}, vote type: ${voteType}, voter: ${userWallet.address}`);
      
      if (!proposalId) {
        throw new Error('Invalid proposal ID');
      }
      
      if (!userWallet || !userWallet.address) {
        throw new Error('Invalid user wallet');
      }
      
      // Vote using the service (admin pays gas) - now with validation checks
      const result = await this.service.voteOnProposal(userWallet, proposalId, voteType);
      
      // Simply pass through the result - the service now handles all error cases
      // and returns a structured response with added validation checks
      console.log(`Vote result: ${JSON.stringify(result)}`);
      
      // Handle validation errors cleanly and in a more user-friendly way
      if (!result.success && result.method === 'validation') {
        console.log(`Vote validation check failed: ${result.error}`);
        // The validation errors are already properly formatted in the service
      }
      
      return result;
    } catch (error) {
      console.error('Error casting vote:', error);
      
      // Return a structured error response
      return {
        success: false,
        error: error.message,
        errorDetails: error.toString()
      };
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
  
  /**
   * Verify approvals and finalize a proposal if it has passed
   * @param {string} proposalId - Proposal ID to check
   * @param {Object} options - Optional parameters
   * @param {Function} options.statusCallback - Callback function to report status updates
   * @returns {Promise<{success: boolean, executed: boolean, reason: string}>} Result of the operation
   */
  async verifyApprovalsAndFinalizeProposal(proposalId, options = {}) {
    try {
      // Default status callback if none provided
      const statusCallback = options.statusCallback || ((status) => console.log(`Proposal execution status: ${status}`));
      
      statusCallback("Checking proposal state...");
      
      // Check if proposal exists
      const proposal = await this.service.getProposalById(proposalId);
      if (!proposal) {
        return { success: false, executed: false, reason: 'Proposal not found' };
      }
      
      // Get current proposal state
      const state = await this.service.getProposalState(proposalId);
      statusCallback(`Current proposal state: ${state}`);
      
      // If proposal is not in Succeeded state, it can't be executed
      if (state !== 'Succeeded') {
        const reason = state === 'Executed' 
          ? 'Proposal has already been executed' 
          : `Proposal is in ${state} state and cannot be executed`;
        
        return { success: true, executed: false, reason };
      }
      
      statusCallback("Proposal has passed. Preparing to execute...");
      
      // Proposal has passed and can be executed
      try {
        statusCallback("Executing proposal on the blockchain...");
        
        // Execute the proposal
        const result = await this.service.executeProposal(proposalId);
        
        statusCallback("Proposal execution complete!");
        
        return { 
          success: true, 
          executed: true, 
          txHash: result.txHash,
          blockExplorerUrl: this.service.getBlockExplorerUrl(result.txHash)
        };
      } catch (execError) {
        console.error('Failed to execute proposal:', execError);
        
        statusCallback("Execution failed. Checking if already executed...");
        
        // Check if proposal is now in Executed state (someone else might have executed it)
        const newState = await this.service.getProposalState(proposalId);
        if (newState === 'Executed') {
          return { 
            success: true, 
            executed: true, 
            reason: 'Proposal was already executed by someone else' 
          };
        }
        
        return { 
          success: false, 
          executed: false, 
          reason: `Failed to execute proposal: ${execError.message}` 
        };
      }
    } catch (error) {
      console.error('Error verifying/finalizing proposal:', error);
      return { success: false, executed: false, reason: error.message };
    }
  }
  
  /**
   * Get all proposals (active or not)
   * @returns {Promise<Array>} Array of all proposals
   */
  async getAllProposals() {
    try {
      // Get all proposals from the service
      const proposals = await this.service.getAllProposals();
      
      // Format the proposals with additional metadata if needed
      return proposals.map(proposal => {
        // Calculate some useful metadata
        const shortenedId = proposal.id.substring(0, 8);
        const stateFormatted = proposal.state.charAt(0).toUpperCase() + proposal.state.slice(1).toLowerCase();
        
        // Add metadata to the proposal
        return {
          ...proposal,
          shortenedId,
          stateFormatted,
          // Add formatted vote counts
          votes: {
            ...proposal.votes,
            // Format the vote counts with commas for better readability
            forVotesFormatted: Number(proposal.votes.forVotes).toLocaleString(),
            againstVotesFormatted: Number(proposal.votes.againstVotes).toLocaleString(),
            abstainVotesFormatted: Number(proposal.votes.abstainVotes).toLocaleString()
          }
        };
      });
    } catch (error) {
      console.error('Error getting all proposals:', error);
      return [];
    }
  }
}

module.exports = BlockchainManager;
