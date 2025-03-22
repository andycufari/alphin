// Import required libraries
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

/**
 * Service for blockchain interactions using OpenZeppelin governance standards
 */
class BlockchainService {
  /**
   * Constructor for blockchain service
   * @param {Object} config - Configuration for the service
   * @param {string} config.rpcUrl - URL of the RPC provider
   * @param {string} config.tokenAddress - Address of the token contract (ERC20Votes)
   * @param {string} config.governorAddress - Address of the governor contract
   * @param {string} config.adminPrivateKey - Private key of the admin wallet (for gas fees)
   */
  constructor(config) {
    const { rpcUrl, tokenAddress, governorAddress, adminPrivateKey } = config;
    
    // Save addresses and configure provider
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    this.tokenAddress = tokenAddress;
    this.governorAddress = governorAddress;
    this.adminWallet = new ethers.Wallet(adminPrivateKey, this.provider);
    
    // Validate required configuration
    if (!rpcUrl) throw new Error('RPC URL is required');
    if (!tokenAddress) throw new Error('Token address is required');
    if (!governorAddress) throw new Error('Governor address is required');
    
    console.log(`Initializing Alfin blockchain service...`);
    
    // Load ABIs from JSON files
    try {
      const tokenABIPath = path.join(__dirname, '../../../contracts/abis/ERC20VotesToken.json');
      const governorABIPath = path.join(__dirname, '../../../contracts/abis/Governor.json');
      
      // Load ABIs
      const tokenABI = require(tokenABIPath);
      const governorABI = require(governorABIPath);
      
      // Initialize contracts
      this.tokenContract = new ethers.Contract(
        this.tokenAddress,
        tokenABI,
        this.adminWallet
      );
      
      this.governorContract = new ethers.Contract(
        this.governorAddress,
        governorABI,
        this.adminWallet
      );
      
      console.log(`BlockchainService initialized with token ${this.tokenAddress} and governor ${this.governorAddress}`);
    } catch (error) {
      console.error("Error initializing contracts:", error);
      throw new Error(`Failed to initialize contracts: ${error.message}`);
    }
  }

  /**
   * Transfer tokens from admin wallet to a new user
   * @param {string} toAddress - User's wallet address
   * @param {number|string} amount - Amount of tokens to transfer
   * @returns {Promise<Object>} - Transaction details
   */
  async transferTokens(toAddress, amount) {
    console.log(`Transferring ${amount} tokens to ${toAddress}`);
    
    try {
      // Check admin balance
      const adminBalance = await this.tokenContract.balanceOf(this.adminWallet.address);
      const decimals = await this.tokenContract.decimals();
      const amountWithDecimals = ethers.utils.parseUnits(amount.toString(), decimals);
      
      console.log(`Admin balance: ${ethers.utils.formatUnits(adminBalance, decimals)}`);
      
      if (adminBalance.lt(amountWithDecimals)) {
        throw new Error(`Insufficient admin balance for transfer`);
      }
      
      // Execute transfer with gas estimation
      const gasLimit = await this.tokenContract.estimateGas.transfer(toAddress, amountWithDecimals);
      const tx = await this.tokenContract.transfer(toAddress, amountWithDecimals, {
        gasLimit: gasLimit.mul(12).div(10) // Add 20% buffer
      });
      
      console.log(`Transfer transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      console.log(`Transfer confirmed in block ${receipt.blockNumber}`);
      
      return {
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        status: receipt.status === 1 ? 'success' : 'failed'
      };
    } catch (error) {
      console.error('Error transferring tokens:', error);
      throw new Error(`Failed to transfer tokens: ${error.message}`);
    }
  }

  /**
   * Delegate voting power
   * @param {string} delegatorAddress - Address delegating voting power
   * @param {string} delegateeAddress - Address receiving voting power
   * @returns {Promise<Object>} - Transaction details
   */
  async delegateVotes(delegatorAddress, delegateeAddress) {
    console.log(`Delegating votes from ${delegatorAddress} to ${delegateeAddress}`);
    
    try {
      // Check token balance
      const balance = await this.tokenContract.balanceOf(delegatorAddress);
      
      if (balance.isZero()) {
        throw new Error('No tokens to delegate');
      }
      
      // Execute delegation
      const tx = await this.tokenContract.delegate(delegateeAddress, {
        gasLimit: 100000
      });
      
      console.log(`Delegation transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      return {
        status: 'success',
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      console.error('Error delegating votes:', error);
      
      // Special handling for self-delegation permission error
      if (error.message.includes('permission')) {
        return {
          status: 'error',
          requiresUserAction: true,
          message: 'You need to delegate your tokens directly through your wallet.'
        };
      }
      
      throw new Error(`Failed to delegate votes: ${error.message}`);
    }
  }
  
  /**
   * Get token balance for an address
   * @param {string} address - Wallet address to check
   * @returns {Promise<string>} - Token balance as formatted string
   */
  async getTokenBalance(address) {
    try {
      const balance = await this.tokenContract.balanceOf(address);
      const decimals = await this.tokenContract.decimals();
      return ethers.utils.formatUnits(balance, decimals);
    } catch (error) {
      console.error('Error getting token balance:', error);
      throw new Error(`Failed to get token balance: ${error.message}`);
    }
  }
  
  /**
   * Create a new proposal
   * @param {Object} proposal - Proposal details
   * @param {string} proposal.title - Proposal title
   * @param {string} proposal.description - Proposal description
   * @param {Array<string>} proposal.targets - Contract addresses to call
   * @param {Array<string>} proposal.values - ETH values to send with calls
   * @param {Array<string>} proposal.calldatas - Function call data
   * @returns {Promise<Object>} - Proposal creation result
   */
  async createProposal(proposal) {
    const { title, description, targets, values, calldatas } = proposal;
    console.log(`Creating proposal: ${title}`);
    
    // Format description with title
    const fullDescription = `# ${title}\n\n${description}`;
    
    try {
      // Submit proposal to governor
      const tx = await this.governorContract.propose(
        targets,
        values,
        calldatas,
        fullDescription,
        { gasLimit: 2000000 }
      );
      
      console.log(`Proposal transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      // Get proposal ID from the ProposalCreated event
      const proposalId = this.getProposalIdFromReceipt(receipt);
      
      return {
        proposalId: proposalId,
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      console.error('Error creating proposal:', error);
      throw new Error(`Failed to create proposal: ${error.message}`);
    }
  }
  
  /**
   * Extract proposal ID from transaction receipt
   * @param {Object} receipt - Transaction receipt
   * @returns {string} - Proposal ID
   */
  getProposalIdFromReceipt(receipt) {
    try {
      // Find ProposalCreated event in logs
      const proposalCreatedEvent = receipt.events.find(
        event => event.event === 'ProposalCreated'
      );
      
      if (proposalCreatedEvent && proposalCreatedEvent.args) {
        return proposalCreatedEvent.args.proposalId.toString();
      }
      
      // Fallback: Generate proposal ID based on timestamp
      const timestamp = Math.floor(Date.now() / 1000);
      return `prop-${timestamp}`;
    } catch (error) {
      console.error('Error extracting proposal ID:', error);
      const timestamp = Math.floor(Date.now() / 1000);
      return `prop-${timestamp}`;
    }
  }
  
  /**
   * Cast a vote on a proposal
   * @param {ethers.Wallet} userWallet - User's wallet
   * @param {string} proposalId - ID of the proposal
   * @param {number} support - Vote type (0=against, 1=for, 2=abstain)
   * @returns {Promise<Object>} - Voting result
   */
  async voteOnProposal(userWallet, proposalId, support) {
    console.log(`Voting on proposal ${proposalId} with support ${support}`);
    
    try {
      // Check proposal state
      const state = await this.governorContract.state(proposalId);
      
      // State 1 is Active in OpenZeppelin Governor
      if (state !== 1) {
        const states = ['Pending', 'Active', 'Canceled', 'Defeated', 'Succeeded', 'Queued', 'Expired', 'Executed'];
        throw new Error(`Proposal is not active for voting. Current state: ${states[state]}`);
      }
      
      // Check voting power
      const blockNumber = await this.provider.getBlockNumber();
      const votingPower = await this.governorContract.getVotes(userWallet.address, blockNumber - 1);
      
      if (votingPower.isZero()) {
        throw new Error('No voting power. Make sure you have delegated your tokens.');
      }
      
      // Connect the governor contract to user's wallet
      const governorWithSigner = this.governorContract.connect(userWallet);
      
      // Cast vote with reason
      const tx = await governorWithSigner.castVoteWithReason(
        proposalId, 
        support,
        `Vote cast via Alfin DAO Bot`,
        { gasLimit: 200000 }
      );
      
      console.log(`Vote transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      return {
        success: true,
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        support: support === 0 ? 'Against' : support === 1 ? 'For' : 'Abstain'
      };
    } catch (error) {
      console.error('Error voting on proposal:', error);
      throw new Error(`Failed to vote on proposal: ${error.message}`);
    }
  }
  
  /**
   * Get information about a proposal
   * @param {string} proposalId - ID of the proposal
   * @returns {Promise<Object>} - Proposal information
   */
  async getProposalInfo(proposalId) {
    try {
      // Get proposal state
      const state = await this.governorContract.state(proposalId);
      const states = ['Pending', 'Active', 'Canceled', 'Defeated', 'Succeeded', 'Queued', 'Expired', 'Executed'];
      
      // Get vote counts
      let votes = { forVotes: '0', againstVotes: '0', abstainVotes: '0' };
      
      if (state !== 0) { // If not in Pending state
        try {
          const proposalVotes = await this.governorContract.proposalVotes(proposalId);
          const decimals = await this.tokenContract.decimals();
          
          votes = {
            forVotes: ethers.utils.formatUnits(proposalVotes.forVotes, decimals),
            againstVotes: ethers.utils.formatUnits(proposalVotes.againstVotes, decimals),
            abstainVotes: ethers.utils.formatUnits(proposalVotes.abstainVotes, decimals)
          };
        } catch (error) {
          console.warn('Could not get proposal votes:', error.message);
        }
      }
      
      return {
        id: proposalId,
        state: states[state],
        votes
      };
    } catch (error) {
      console.error('Error getting proposal info:', error);
      throw new Error(`Failed to get proposal info: ${error.message}`);
    }
  }
  
  /**
   * Get active proposals
   * @returns {Promise<Array>} - List of active proposals
   */
  async getActiveProposals() {
    try {
      // Get the current block number
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 10000); // Last 10,000 blocks
      
      // Get ProposalCreated events
      const filter = this.governorContract.filters.ProposalCreated();
      const events = await this.governorContract.queryFilter(filter, fromBlock);
      
      console.log(`Found ${events.length} proposal events`);
      
      // Filter for active proposals
      const activeProposals = [];
      
      for (const event of events) {
        const proposalId = event.args.proposalId.toString();
        
        try {
          const state = await this.governorContract.state(proposalId);
          
          if (state === 1) { // Active state
            const description = event.args.description;
            const title = description.split('\n')[0].replace('# ', '');
            
            activeProposals.push({
              proposalId,
              title,
              description: description.substring(title.length + 2).trim(),
              proposer: event.args.proposer
            });
          }
        } catch (error) {
          console.warn(`Error checking proposal ${proposalId}:`, error.message);
        }
      }
      
      return activeProposals;
    } catch (error) {
      console.error('Error getting active proposals:', error);
      return []; // Return empty array on error
    }
  }
}

module.exports = BlockchainService;
