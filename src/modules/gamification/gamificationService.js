/**
 * Gamification service for rewarding DAO participation
 */
class GamificationService {
  /**
   * Create GamificationService instance
   * @param {Object} blockchainManager - Blockchain service manager
   */
  constructor(blockchainManager) {
    this.blockchain = blockchainManager;
    this.voteReward = process.env.VOTE_REWARD_AMOUNT || "1";
    this.proposalReward = process.env.PROPOSAL_REWARD_AMOUNT || "10";
    this.approvedProposalMultiplier = process.env.APPROVED_PROPOSAL_MULTIPLIER || "2";
  }
  
  /**
   * Reward a user for voting
   * @param {string} userAddress - User's wallet address
   * @returns {Promise<Object>} - Transaction details
   */
  async rewardForVoting(userAddress) {
    console.log(`Rewarding ${userAddress} for voting with ${this.voteReward} tokens`);
    
    try {
      // Transfer tokens as reward
      const result = await this.blockchain.service.transferTokens(userAddress, this.voteReward);
      
      return {
        success: true,
        amount: this.voteReward,
        txHash: result.txHash
      };
    } catch (error) {
      console.error('Error rewarding for voting:', error);
      // Don't throw - gamification should be non-blocking
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Reward a user for creating a proposal
   * @param {string} userAddress - User's wallet address
   * @param {boolean} [approved=false] - Whether the proposal was approved
   * @returns {Promise<Object>} - Transaction details
   */
  async rewardForProposal(userAddress, approved = false) {
    console.log(`Rewarding ${userAddress} for creating a proposal`);
    
    try {
      // Calculate reward amount
      let amount = this.proposalReward;
      
      // If proposal was approved, multiply the reward
      if (approved) {
        amount = parseFloat(this.proposalReward) * parseFloat(this.approvedProposalMultiplier);
        console.log(`Proposal was approved, increasing reward to ${amount}`);
      }
      
      // Usar sendWelcomeTokensWithDelegation en lugar de transferTokens
      const result = await this.blockchain.service.sendWelcomeTokensWithDelegation(
        userAddress,
        amount.toString()
      );
      
      console.log(`Reward transaction completed with delegation: ${result.txHash}`);
      
      return {
        success: true,
        amount: amount.toString(),
        txHash: result.txHash,
        delegation: result.delegation
      };
    } catch (error) {
      console.error('Error rewarding for proposal:', error);
      // Don't throw - gamification should be non-blocking
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Process rewards for a proposal that completed voting
   * @param {string} proposalId - ID of the proposal
   * @param {string} proposerAddress - Address of the proposal creator
   * @returns {Promise<Object>} - Reward details
   */
  async processProposalCompletionRewards(proposalId, proposerAddress) {
    console.log(`Processing completion rewards for proposal ${proposalId}`);
    
    try {
      // Get proposal info
      const proposalInfo = await this.blockchain.getProposalInfo(proposalId);
      
      // Check if proposal succeeded
      const wasApproved = proposalInfo.state === 'Succeeded';
      
      // Reward proposer with bonus if approved
      if (wasApproved) {
        console.log(`Proposal ${proposalId} was approved, rewarding proposer with bonus`);
        return await this.rewardForProposal(proposerAddress, true);
      }
      
      return {
        success: true,
        message: 'No additional rewards - proposal did not succeed'
      };
    } catch (error) {
      console.error('Error processing proposal completion rewards:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async rewardProposalCreation(userAddress) {
    try {
        console.log(`Rewarding ${userAddress} for creating a proposal`);
        const rewardAmount = "100"; // 100 tokens for creating a proposal
        
        // Usar el método que incluye delegación
        const result = await this.blockchain.sendWelcomeTokensWithDelegation(
            userAddress,
            rewardAmount
        );
        
        console.log(`Reward transaction completed: ${result.txHash}`);
        if (result.delegation?.success) {
            console.log(`Tokens automatically delegated for ${userAddress}`);
        }
        
        return result;
    } catch (error) {
        console.error('Error rewarding proposal creation:', error);
        throw error;
    }
  }
}

module.exports = GamificationService;
