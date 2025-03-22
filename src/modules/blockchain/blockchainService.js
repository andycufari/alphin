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
    
    // Check if blockchain features should be enabled
    this.blockchainEnabled = !!(rpcUrl && tokenAddress && governorAddress && adminPrivateKey &&
                               adminPrivateKey !== 'your_admin_wallet_private_key');
    
    if (!this.blockchainEnabled) {
      console.log('Blockchain features are disabled - some or all required blockchain configuration is missing');
      return;
    }
    
    // Save addresses and configure provider
    try {
      this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      this.tokenAddress = tokenAddress;
      this.governorAddress = governorAddress;
      this.adminWallet = new ethers.Wallet(adminPrivateKey, this.provider);
      
      console.log(`Initializing Alphin blockchain service...`);
      
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
        this.blockchainEnabled = false;
      }
    } catch (error) {
      console.error("Error initializing blockchain service:", error);
      this.blockchainEnabled = false;
    }
  }

  /**
   * Transfer tokens from admin wallet to a new user
   * @param {string} toAddress - User's wallet address
   * @param {number|string} amount - Amount of tokens to transfer
   * @returns {Promise<Object>} - Transaction details
   */
  async transferTokens(toAddress, amount) {
    if (!this.blockchainEnabled) {
      return { status: 'error', message: 'Blockchain features are disabled' };
    }
    
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
   * Delegate voting power using the admin wallet to pay for gas
   * @param {string} delegatorAddress - Address delegating voting power
   * @param {string} delegateeAddress - Address receiving voting power
   * @returns {Promise<Object>} - Transaction details
   */
  async delegateVotes(delegatorAddress, delegateeAddress) {
    if (!this.blockchainEnabled) {
      return { status: 'error', message: 'Blockchain features are disabled' };
    }
    
    console.log(`Delegating votes from ${delegatorAddress} to ${delegateeAddress}`);
    
    try {
      // Check token balance
      const balance = await this.tokenContract.balanceOf(delegatorAddress);
      
      if (balance.isZero()) {
        throw new Error('No tokens to delegate');
      }
      
      // First try using the adminDelegateFor function which is more secure
      // This function should be added to the token contract to allow the admin to delegate on behalf of users
      try {
        console.log('Attempting to use adminDelegateFor function...');
        
        // Check if the function exists on the contract
        if (typeof this.tokenContract.adminDelegateFor === 'function') {
          // Add 30% buffer to gas estimate
          const gasLimit = 200000; // Safe default
          
          // Call the adminDelegateFor function
          const tx = await this.tokenContract.adminDelegateFor(
            delegatorAddress, 
            delegateeAddress,
            { gasLimit }
          );
          
          console.log(`Admin delegation transaction sent: ${tx.hash}`);
          
          // Wait for confirmation
          const receipt = await tx.wait();
          
          return {
            status: 'success',
            method: 'adminDelegateFor',
            txHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber
          };
        } else {
          console.log('adminDelegateFor function not found on contract, falling back to standard delegation');
        }
      } catch (adminError) {
        console.warn('Error using adminDelegateFor:', adminError.message);
        console.log('Falling back to standard delegation method...');
      }
      
      // Standard delegation method - this might not work if the contract doesn't support it
      // Get the function signature and encoded parameters for the delegate call
      const data = this.tokenContract.interface.encodeFunctionData('delegate', [delegateeAddress]);
      
      // Estimate gas for the transaction with a safe fallback
      let gasLimit;
      try {
        const gasEstimate = await this.provider.estimateGas({
          from: this.adminWallet.address,
          to: this.tokenAddress,
          data: data
        });
        
        // Add 30% buffer to gas estimate
        gasLimit = gasEstimate.mul(13).div(10);
      } catch (gasError) {
        console.warn('Error estimating gas:', gasError.message);
        gasLimit = ethers.BigNumber.from("200000"); // Safe default for ethers v5
        // For ethers v6, use: gasLimit = ethers.parseUnits("200000", "wei");
      }
      
      // Create and send the transaction
      const tx = await this.adminWallet.sendTransaction({
        to: this.tokenAddress,
        data: data,
        gasLimit: gasLimit
      });
      
      console.log(`Delegation transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      return {
        status: 'success',
        method: 'standardDelegate',
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      console.error('Error delegating votes:', error);
      
      // Special handling for reverted transactions
      if (error.message.includes('execution reverted')) {
        // This usually happens because the admin wallet doesn't have permission
        console.log('Delegation transaction reverted - likely a permission issue');
        
        return {
          status: 'error',
          delegationError: true,
          message: 'Token delegation failed. This usually happens because the token contract does not support delegation by the admin wallet.',
          technicalError: error.message
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
    if (!this.blockchainEnabled) {
      return "0.0"; // Return zero balance if blockchain is disabled
    }
    
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
    if (!this.blockchainEnabled) {
      return { 
        status: 'error', 
        message: 'Blockchain features are disabled',
        proposalId: `mock-${Date.now()}`
      };
    }
    
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
   * @param {string} voterAddress - Address of the voter
   * @param {string} proposalId - ID of the proposal
   * @param {number} support - Vote type (0=against, 1=for, 2=abstain)
   * @param {string} reason - Optional reason for the vote
   * @returns {Promise<Object>} - Transaction receipt
   */
  async castVote(voterAddress, proposalId, support, reason = '') {
    try {
      const wallet = new ethers.Wallet(this.getPrivateKey(voterAddress), this.provider);
      const governor = this.governorContract.connect(wallet);
      
      const tx = await governor.castVoteWithReason(
        proposalId,
        support,
        reason || `Vote cast via Alphin DAO Bot`
      );
      
      return await tx.wait();
    } catch (error) {
      console.error(`Error casting vote:`, error);
      throw new Error('Failed to cast vote. Please try again later.');
    }
  }
  
  /**
   * Get information about a proposal
   * @param {string} proposalId - ID of the proposal
   * @returns {Promise<Object>} - Proposal information
   */
  async getProposalInfo(proposalId) {
    if (!this.blockchainEnabled) {
      return {
        id: proposalId,
        title: "Mock Proposal (Blockchain Disabled)",
        description: "This is a mock proposal because blockchain features are disabled.",
        status: "active",
        forVotes: "0",
        againstVotes: "0",
        abstainVotes: "0"
      };
    }
    
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
   * @returns {Promise<Array<Object>>} - List of active proposals
   */
  async getActiveProposals() {
    if (!this.blockchainEnabled) {
      return [{
        id: `mock-${Date.now()}`,
        title: "Mock Proposal (Blockchain Disabled)",
        description: "This is a mock proposal because blockchain features are disabled.",
        status: "active",
        proposer: "0x0000000000000000000000000000000000000000",
        forVotes: "0",
        againstVotes: "0",
        abstainVotes: "0"
      }];
    }
    
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
