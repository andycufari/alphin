/**
 * Service for monitoring proposal states and triggering actions when they change
 */
class ProposalMonitor {
  /**
   * Create a new ProposalMonitor
   * @param {Object} blockchainManager - BlockchainManager instance
   * @param {Object} databaseService - DatabaseService instance
   * @param {Object} telegramBot - TelegramBot instance
   * @param {string} communityGroupId - Telegram ID of the community group
   */
  constructor(blockchainManager, databaseService, telegramBot, communityGroupId) {
    this.blockchain = blockchainManager;
    this.db = databaseService;
    this.bot = telegramBot;
    this.communityGroupId = communityGroupId;
    this.isMonitoring = false;
    this.monitorInterval = null;
  }
  
  /**
   * Start monitoring for proposal state changes
   * @param {number} intervalMs - Monitoring interval in milliseconds (default: 5 minutes)
   */
  startMonitoring(intervalMs = 300000) {
    if (this.isMonitoring) {
      console.log('Proposal monitoring already running');
      return;
    }
    
    console.log(`Starting proposal monitor with interval ${intervalMs}ms`);
    this.isMonitoring = true;
    
    // Immediately run a check
    this.checkProposalStates();
    
    // Set up regular interval for checking
    this.monitorInterval = setInterval(() => {
      this.checkProposalStates();
    }, intervalMs);
  }
  
  /**
   * Stop monitoring for proposal state changes
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }
    
    console.log('Stopping proposal monitor');
    clearInterval(this.monitorInterval);
    this.monitorInterval = null;
    this.isMonitoring = false;
  }
  
  /**
   * Check all active proposals for state changes
   */
  async checkProposalStates() {
    try {
      console.log('Checking proposal states...');
      
      // Get all proposals from blockchain
      let allProposals = [];
      try {
        allProposals = await this.blockchain.getAllProposals();
      } catch (error) {
        console.error('Error getting all proposals:', error);
        return; // Exit if we can't get the proposals
      }
      
      if (!allProposals || allProposals.length === 0) {
        console.log('No proposals found to monitor');
        return;
      }
      
      // For each proposal, check if state has changed
      for (const proposal of allProposals) {
        try {
          await this.checkProposalStateChange(proposal);
        } catch (error) {
          console.error(`Error checking state for proposal ${proposal.id}:`, error);
          // Continue with next proposal
        }
      }
      
      console.log('Proposal state check completed');
    } catch (error) {
      console.error('Error checking proposal states:', error);
    }
  }
  
  /**
   * Check if a single proposal's state has changed
   * @param {Object} proposal - Current proposal data from blockchain
   */
  async checkProposalStateChange(proposal) {
    try {
      if (!proposal || !proposal.id) {
        console.warn('Invalid proposal data passed to checkProposalStateChange');
        return;
      }
      
      // Check if state has changed in our database
      let stateChange = { changed: false, oldState: null };
      try {
        stateChange = await this.db.hasProposalStateChanged(proposal.id, proposal.state);
      } catch (dbError) {
        console.error(`Error checking proposal state change:`, dbError);
        console.log(`Continuing with proposal ${proposal.id} using default state change values`);
        // We'll continue with the default values set above
      }
      
      // Update proposal in cache regardless of state change
      try {
        await this.db.updateProposalCache(proposal);
      } catch (updateError) {
        console.error(`Error updating proposal cache:`, updateError);
        console.log(`Failed to update cache for proposal ${proposal.id}`);
        // Continue even if update fails
      }
      
      // If state has changed and it's significant, notify community
      if (stateChange.changed && this.isSignificantStateChange(stateChange.oldState, proposal.state)) {
        try {
          await this.notifyProposalStateChange(proposal, stateChange.oldState);
        } catch (notifyError) {
          console.error(`Error notifying about state change:`, notifyError);
        }
      }
    } catch (error) {
      console.error(`Error in checkProposalStateChange for ${proposal?.id || 'unknown'}:`, error);
    }
  }
  
  /**
   * Determine if a state change is significant enough to notify users
   * @param {string} oldState - Previous proposal state
   * @param {string} newState - New proposal state
   * @returns {boolean} - True if the state change is significant
   */
  isSignificantStateChange(oldState, newState) {
    // These state transitions are significant
    const significantTransitions = {
      'Active': ['Succeeded', 'Defeated', 'Expired'],
      'Succeeded': ['Executed', 'Expired'],
      null: ['Active'] // New proposal becoming active
    };
    
    // Check if the transition is in our list
    return significantTransitions[oldState] && 
           significantTransitions[oldState].includes(newState);
  }
  
  /**
   * Notify community about a proposal state change
   * @param {Object} proposal - Current proposal data
   * @param {string} oldState - Previous proposal state
   */
  async notifyProposalStateChange(proposal, oldState) {
    if (!this.communityGroupId || !this.bot) {
      console.log('Cannot notify: missing community group ID or bot');
      return;
    }
    
    try {
      const proposalId = proposal.id;
      const shortId = proposalId.substring(0, 8);
      const title = proposal.title || `Proposal #${shortId}`;
      
      let message, emoji;
      
      // Format message based on the new state
      switch (proposal.state) {
        case 'Succeeded':
          emoji = '✅';
          message = `*Proposal Approved!*\n\n*${title}* (ID: \`${shortId}\`) has passed!\n\n*Final Votes:*\n✅ For: ${proposal.votes.forVotes}\n❌ Against: ${proposal.votes.againstVotes}\n⚪ Abstain: ${proposal.votes.abstainVotes}\n\nThe proposal is now ready to be executed by a DAO admin.`;
          break;
          
        case 'Defeated':
          emoji = '❌';
          message = `*Proposal Rejected*\n\n*${title}* (ID: \`${shortId}\`) did not receive enough votes to pass.\n\n*Final Votes:*\n✅ For: ${proposal.votes.forVotes}\n❌ Against: ${proposal.votes.againstVotes}\n⚪ Abstain: ${proposal.votes.abstainVotes}`;
          break;
          
        case 'Executed':
          emoji = '🚀';
          message = `*Proposal Executed*\n\n*${title}* (ID: \`${shortId}\`) has been executed and its changes are now in effect!\n\nThank you to all members who participated in this governance decision.`;
          break;
          
        case 'Expired':
          emoji = '⏱️';
          message = `*Proposal Expired*\n\n*${title}* (ID: \`${shortId}\`) has expired without being executed.\n\n*Final Votes:*\n✅ For: ${proposal.votes.forVotes}\n❌ Against: ${proposal.votes.againstVotes}\n⚪ Abstain: ${proposal.votes.abstainVotes}`;
          break;
          
        case 'Active':
          // Only notify for new proposals becoming active
          if (!oldState) {
            emoji = '🗳️';
            message = `*New Proposal Available for Voting*\n\n*${title}* (ID: \`${shortId}\`) is now open for voting!\n\nUse @AlphinDAO_bot to cast your vote.`;
          }
          break;
          
        default:
          // Don't notify for other state changes
          return;
      }
      
      // Send notification to community group
      if (message) {
        await this.bot.sendMessage(
          this.communityGroupId,
          `${emoji} ${message}`,
          { parse_mode: 'Markdown' }
        );
        
        console.log(`Notified community about proposal ${proposalId} state change: ${oldState} -> ${proposal.state}`);
      }
    } catch (error) {
      console.error(`Error notifying about proposal state change:`, error);
    }
  }
  
  /**
   * Check if a proposal has reached approval or rejection thresholds
   * @param {Object} proposal - Current proposal data from blockchain
   * @returns {Object} Result with whether proposal is approved or rejected
   */
  async checkProposalResult(proposal) {
    try {
      // Get the proposal votes
      const forVotes = parseFloat(proposal.votes.forVotes);
      const againstVotes = parseFloat(proposal.votes.againstVotes);
      const abstainVotes = parseFloat(proposal.votes.abstainVotes);
      const totalVotes = forVotes + againstVotes + abstainVotes;
      
      // Default quorum (can be customized based on DAO settings)
      const quorumPercentage = 0.04; // 4% of total supply needed for quorum
      const totalSupply = 100000; // This should be fetched from the token contract
      const quorumThreshold = totalSupply * quorumPercentage;
      
      // Calculate percentages
      const forPercentage = totalVotes > 0 ? (forVotes / totalVotes) * 100 : 0;
      const againstPercentage = totalVotes > 0 ? (againstVotes / totalVotes) * 100 : 0;
      
      // Check quorum
      const hasQuorum = totalVotes >= quorumThreshold;
      
      // Simple majority rule (can be customized based on DAO governance rules)
      const isApproved = hasQuorum && forVotes > againstVotes;
      const isRejected = hasQuorum && againstVotes >= forVotes;
      
      return {
        isApproved,
        isRejected,
        hasQuorum,
        forPercentage,
        againstPercentage,
        totalVotes,
        quorumThreshold,
        quorumPercentage: (totalVotes / totalSupply) * 100
      };
    } catch (error) {
      console.error(`Error checking proposal result:`, error);
      return {
        isApproved: false,
        isRejected: false,
        hasQuorum: false,
        error: error.message
      };
    }
  }
}

module.exports = ProposalMonitor;
