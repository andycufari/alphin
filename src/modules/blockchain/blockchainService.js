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
   * @param {Object} config.databaseService - Database service for storing data
   */
  constructor(config) {
    const { rpcUrl, tokenAddress, governorAddress, adminPrivateKey, databaseService } = config;
    
    // Store database service if provided
    this.databaseService = databaseService;
    
    // Store the network name from environment
    this.networkName = process.env.BLOCKCHAIN_NETWORK;
    
    // Store the complete config for future reference
    this.config = { 
      ...config,
      networkName: this.networkName
    };
    
    // Check if blockchain features should be enabled
    this.blockchainEnabled = !!(rpcUrl && tokenAddress && governorAddress && adminPrivateKey &&
                               adminPrivateKey !== 'your_admin_wallet_private_key');
    
    // Initialize mock data for when blockchain is disabled
    this.mockProposalData = [
      {
        id: `mock-${Date.now()}`,
        proposalId: `mock-${Date.now()}`,
        title: "Mock Proposal (Blockchain Disabled)",
        description: "This is a mock proposal because blockchain features are disabled.",
        state: "Active",
        proposer: "0x0000000000000000000000000000000000000000",
        votes: {
          forVotes: "0",
          againstVotes: "0",
          abstainVotes: "0"
        }
      }
    ];
    
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
        
        // Save ABIs for later use
        this.tokenAbi = tokenABI;
        this.governorAbi = governorABI;
        
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
        return {
          status: 'error',
          delegationError: true,
          message: 'No tokens to delegate'
        };
      }

      // Try admin delegation first - this is a custom method that might be added to your token contract
      try {
        console.log("Attempting adminDelegateFor method if available...");
        // Check if adminDelegateFor method exists on the token contract
        if (typeof this.tokenContract.adminDelegateFor === 'function') {
          const gasEstimate = await this.tokenContract.estimateGas.adminDelegateFor(
            delegatorAddress,
            delegateeAddress
          );
          const gasLimit = gasEstimate.mul(12).div(10); // Add 20% buffer
          
          const tx = await this.tokenContract.adminDelegateFor(
            delegatorAddress,
            delegateeAddress,
            { gasLimit }
          );
          
          const receipt = await tx.wait();
          console.log(`Admin delegation confirmed in block ${receipt.blockNumber}`);
          
          return {
            status: 'success',
            txHash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
            method: 'admin-delegation'
          };
        }
      } catch (adminDelegateError) {
        console.log(`Admin delegation not available or failed: ${adminDelegateError.message}`);
        // Continue to try meta-transaction
      }

      // Use delegateBySig for meta-transaction delegation
      return await this.delegateVotesBySig(delegatorAddress, delegateeAddress);
    } catch (error) {
      console.error('Error delegating votes:', error);

      // Special handling for reverted transactions
      if (error.message.includes('execution reverted')) {
        console.log('Delegation transaction reverted - likely a permission issue');

        return {
          status: 'error',
          delegationError: true,
          message: 'Token delegation failed. This usually happens because the token contract does not support delegation by the admin wallet.',
          technicalError: error.message
        };
      }

      return {
        status: 'error',
        delegationError: true,
        message: `Failed to delegate votes: ${error.message}`
      };
    }
  }

  /**
   * Delegate voting power using user's signature (meta-transaction)
   * @param {string} delegatorAddress - Address delegating voting power
   * @param {string} delegateeAddress - Address receiving voting power
   * @returns {Promise<Object>} - Transaction details
   */
  async delegateVotesBySig(delegatorAddress, delegateeAddress) {
    if (!this.blockchainEnabled) {
      return { status: 'error', message: 'Blockchain features are disabled' };
    }

    console.log(`Attempting to delegate votes with meta-transaction from ${delegatorAddress} to ${delegateeAddress}...`);

    try {
      // Get the nonce for the delegator
      const nonce = await this.tokenContract.nonces(delegatorAddress);
      
      // Set expiry to 1 hour from now
      const expiry = Math.floor(Date.now() / 1000) + 3600;

      // Get chain ID for domain
      const chainId = (await this.provider.getNetwork()).chainId;
      
      // Get token name for domain
      let tokenName;
      try {
        tokenName = await this.tokenContract.name();
      } catch (nameError) {
        console.warn('Could not get token name, using default:', nameError.message);
        tokenName = 'Token';
      }

      // Create the EIP-712 domain for the token contract
      const domain = {
        name: tokenName,
        version: '1',
        chainId: chainId,
        verifyingContract: this.tokenAddress
      };

      // Define the delegation type structure according to ERC20Votes spec
      const types = {
        Delegation: [
          { name: 'delegatee', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expiry', type: 'uint256' }
        ]
      };

      // Create the delegation data
      const value = { 
        delegatee: delegateeAddress, 
        nonce: nonce.toString(), 
        expiry: expiry 
      };

      console.log(`Creating delegation signature with params:`, {
        delegatee: delegateeAddress,
        nonce: nonce.toString(),
        expiry: expiry
      });

      // Create a temporary wallet from the delegator's private key for signing
      // This is a mock implementation - in your case, you'll need the actual user's wallet
      // You likely have this in your walletManager where you decrypt the user's wallet
      // For this example, I'm assuming the user has already provided their private key
      let signingWallet;
      
      // For this part to work, you need to get the user's private key securely
      // This should be integrated with your walletManager system
      // For testing only, if delegatorAddress is the admin wallet, use that
      if (delegatorAddress.toLowerCase() === this.adminWallet.address.toLowerCase()) {
        signingWallet = this.adminWallet;
        console.log('Using admin wallet for signing (testing only)');
      } else {
        // In real implementation, you would do something like:
        // signingWallet = await this.walletManager.getDecryptedWallet(delegatorAddress);
        
        // For now, simulate by using the admin wallet but log a warning
        signingWallet = this.adminWallet;
        console.warn('IMPORTANT: Using admin wallet for signing - NOT FOR PRODUCTION');
      }

      // Sign the delegation data
      const signature = await signingWallet._signTypedData(domain, types, value);
      const sig = ethers.utils.splitSignature(signature);

      console.log(`Generated signature for delegation: v=${sig.v}, r=${sig.r.substring(0, 10)}..., s=${sig.s.substring(0, 10)}...`);
      
      // Connect to the token contract with the admin wallet to pay gas
      const tokenWithSigner = this.tokenContract.connect(this.adminWallet);

      // Use a higher gas limit for safety
      const gasLimit = ethers.BigNumber.from("1000000"); // 1M gas units
      
      // Try to estimate gas first
      let tx;
      try {
        const gasEstimate = await tokenWithSigner.estimateGas.delegateBySig(
          delegateeAddress, nonce, expiry, sig.v, sig.r, sig.s
        );
        const gasWithBuffer = gasEstimate.mul(12).div(10); // Add 20% buffer
        
        console.log(`Gas estimate for delegateBySig: ${gasEstimate.toString()} (with buffer: ${gasWithBuffer.toString()})`);
        
        tx = await tokenWithSigner.delegateBySig(
          delegateeAddress, nonce, expiry, sig.v, sig.r, sig.s, 
          { gasLimit: gasWithBuffer }
        );
      } catch (gasError) {
        console.warn(`Gas estimation failed for delegateBySig: ${gasError.message}`);
        
        // Try with fixed gas limit
        tx = await tokenWithSigner.delegateBySig(
          delegateeAddress, nonce, expiry, sig.v, sig.r, sig.s, 
          { gasLimit }
        );
      }

      console.log(`Delegation transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      console.log(`Delegation confirmed in block ${receipt.blockNumber}`);

      return { 
        status: 'success',
        txHash: receipt.transactionHash, 
        blockNumber: receipt.blockNumber,
        method: 'meta-transaction'
      };
    } catch (error) {
      console.error('Error delegating votes by signature:', error);
      
      // Provide a detailed error response
      return {
        status: 'error',
        delegationError: true,
        message: `Failed to delegate votes: ${error.message}`,
        method: 'meta-transaction-failed'
      };
    }
  }

  /**
   * Utility method to auto-delegate tokens for a new user
   * @param {string} userAddress - Address of the new user
   * @returns {Promise<boolean>} - Success status
   */
  async autoDelegate(userAddress) {
    try {
      console.log(`Auto-delegating tokens for new user ${userAddress}`);
      
      // Self-delegation is recommended for new users
      const result = await this.delegateVotes(userAddress, userAddress);
      
      if (result.status === 'success') {
        console.log(`Successfully auto-delegated tokens for ${userAddress}`);
        return true;
      } else {
        console.warn(`Auto-delegation failed for ${userAddress}: ${result.message}`);
        return false;
      }
    } catch (error) {
      console.error(`Error in auto-delegation for ${userAddress}:`, error);
      return false;
    }
  }

  /**
   * Check if a user has delegated their tokens
   * @param {string} userAddress - User's wallet address
   * @returns {Promise<boolean>} - True if delegated
   */
  async isTokenDelegated(userAddress) {
    try {
      // Check who the user has delegated to
      const delegatee = await this.tokenContract.delegates(userAddress);
      
      // If address is non-zero, tokens are delegated
      return delegatee !== ethers.constants.AddressZero;
    } catch (error) {
      console.error(`Error checking delegation status for ${userAddress}:`, error);
      return false;
    }
  }

  /**
   * Integrate with wallet manager to handle proper delegation during token transfer
   * This method should be called from your blockchain manager after sending welcome tokens
   * @param {string} userAddress - User's wallet address 
   * @param {Object} userWallet - User's decrypted wallet (if available)
   * @returns {Promise<Object>} Result of delegation attempt
   */
  async handleNewUserDelegation(userAddress, userWallet = null) {
    try {
      // First check if already delegated
      const isDelegated = await this.isTokenDelegated(userAddress);
      
      if (isDelegated) {
        console.log(`User ${userAddress} already has delegated tokens`);
        return {
          success: true,
          alreadyDelegated: true
        };
      }
      
      // If we have the user's wallet, we can do proper delegation
      if (userWallet) {
        // Implement user wallet based delegation
        // This should be similar to your existing code but with proper signing
      }
      
      // Otherwise try auto-delegation
      const delegationSuccess = await this.autoDelegate(userAddress);
      
      return {
        success: delegationSuccess,
        method: 'auto-delegation'
      };
    } catch (error) {
      console.error(`Error in new user delegation flow:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Modified version of sendWelcomeTokens that handles delegation properly
   * @param {string} toAddress - User's wallet address
   * @param {number|string} amount - Amount of tokens to transfer
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} - Transaction details
   */
  async sendWelcomeTokensWithDelegation(toAddress, amount, options = {}) {
    if (!this.blockchainEnabled) {
      return { status: 'error', message: 'Blockchain features are disabled' };
    }
    
    console.log(`Transferring ${amount} tokens to ${toAddress} with delegation`);
    
    try {
      // First transfer tokens
      const transferResult = await this.transferTokens(toAddress, amount);
      console.log(`Transfer result: ${JSON.stringify(transferResult, null, 2)}`);
      
      // Esperar confirmación del transfer
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verificar balance después del transfer
      const balanceAfterTransfer = await this.getTokenBalance(toAddress);
      console.log(`Balance after transfer: ${balanceAfterTransfer}`);
      
      if (balanceAfterTransfer === '0') {
        throw new Error('Token transfer failed - balance is still 0');
      }
      
      // Intentar delegación
      let delegationResult = {
        success: false,
        attempted: true
      };
      
      try {
        // Intentar delegación hasta 3 veces
        for (let i = 0; i < 3; i++) {
          if (i > 0) {
            console.log(`Retrying delegation attempt ${i + 1}/3...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          const result = await this.delegateVotes(toAddress, toAddress);
          const isDelegated = await this.isTokenDelegated(toAddress);
          
          if (isDelegated) {
            delegationResult = {
              success: true,
              method: 'admin-direct',
              txHash: result.txHash,
              attempt: i + 1
            };
            break;
          }
        }
      } catch (delegationError) {
        console.error('All delegation attempts failed:', delegationError);
        delegationResult.error = delegationError.message;
      }
      
      // Return combined result with detailed logging
      const finalResult = {
        status: 'success',
        txHash: transferResult.txHash,
        blockNumber: transferResult.blockNumber,
        amount: amount,
        delegation: delegationResult
      };
      
      console.log('Final transaction result:', JSON.stringify(finalResult, null, 2));
      
      return finalResult;
    } catch (error) {
      console.error('Error sending tokens with delegation:', error);
      return {
        status: 'error',
        message: error.message
      };
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
      // Log the wallet address from which the transaction is being sent
      console.log(`Sending transaction from wallet: ${this.adminWallet.address}`);

      // Estimate gas limit for the transaction
      const gasEstimate = await this.governorContract.estimateGas.propose(
        targets,
        values,
        calldatas,
        fullDescription
      );
      const gasLimit = gasEstimate.mul(12).div(10); // Add 20% buffer to gas estimate

      // Submit proposal to governor
      const tx = await this.governorContract.propose(
        targets,
        values,
        calldatas,
        fullDescription,
        { gasLimit }
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
   * Vote on proposal using user's signature (meta-transaction)
   * @param {ethers.Wallet} userWallet - User's wallet for voting
   * @param {string} proposalId - ID of the proposal
   * @param {number} voteType - 0: against, 1: for, 2: abstain
   * @returns {Promise<Object>} - Transaction details
   */
  async voteOnProposal(userWallet, proposalId, voteType) {
    if (!this.blockchainEnabled) {
      console.log('Blockchain disabled - simulating vote on proposal');
      return { 
        txHash: `mock-${Date.now()}`, 
        success: true,
        method: 'simulation'
      };
    }

    const voterAddress = userWallet.address;
    console.log(`Attempting to vote on proposal ${proposalId} for voter ${voterAddress}, vote type: ${voteType}`);

    try {
      // Validation steps
      await this.validateProposalState(proposalId);
      console.log(`Proposal ${proposalId} is in active state`);
      await this.validateUserVotingPower(proposalId, voterAddress);
      console.log(`User ${voterAddress} has sufficient voting power`);

      // Try meta-transaction first (gasless voting)
      try {
        const metaTxResult = await this.voteWithMetaTransaction(userWallet, proposalId, voteType);
        return {
          ...metaTxResult,
          success: true,
          method: 'meta-transaction'
        };
      } catch (metaTxError) {
        console.error('Meta-transaction voting failed:', metaTxError);
        
        // If meta-transaction fails with a specific error that indicates
        // the user has already voted, we should properly report this
        if (metaTxError.message.includes('already cast') || 
            metaTxError.message.includes('AlreadyCast') ||
            metaTxError.message.includes('already voted')) {
          return {
            success: false,
            method: 'validation',
            error: 'You have already voted on this proposal'
          };
        }
        
        // All methods failed
        return {
          success: false,
          method: 'all-methods-failed',
          error: metaTxError.message
        };
      }
    } catch (error) {
      console.error(`Error in voteOnProposal:`, error);
      return this.handleVoteError(error);
    }
  }

  /**
   * Vote with meta-transaction - Complete rewrite with proper EIP-712
   */
  async voteWithMetaTransaction(userWallet, proposalId, voteType) {
    console.log(`Attempting to vote with meta-transaction for ${userWallet.address} on proposal ${proposalId}, vote type: ${voteType}`);
    
    try {
      // 1. Get the correct domain data from the GOVERNOR contract, not the token
      const chainId = (await this.provider.getNetwork()).chainId;
      const governorName = await this.governorContract.name();
      
      // EIP-712 domain for governor
      const domain = {
        name: governorName,
        version: '1', // Standard version for OpenZeppelin contracts
        chainId: chainId,
        verifyingContract: this.governorAddress
      };
      
      console.log("Using governor domain:", domain);
      
      // 2. Create the correct typed data structure for a vote
      // This MUST match the governor contract's Ballot struct
      const types = {
        Ballot: [
          { name: 'proposalId', type: 'uint256' },
          { name: 'support', type: 'uint8' }
        ]
      };
      
      // 3. Format the vote data correctly
      const proposalIdBN = ethers.BigNumber.from(proposalId);
      const value = { 
        proposalId: proposalIdBN.toString(), 
        support: voteType 
      };
      
      console.log("Preparing to sign vote data:", value);
      
      // 4. Get the user to sign the typed data
      const signature = await userWallet._signTypedData(domain, types, value);
      const sig = ethers.utils.splitSignature(signature);
      
      console.log(`Generated signature for vote: v=${sig.v}, r=${sig.r.substring(0, 10)}..., s=${sig.s.substring(0, 10)}...`);
      
      // 5. Submit the vote using admin wallet (to pay gas)
      const governorWithSigner = this.governorContract.connect(this.adminWallet);
      
      // Try with gas estimation
      let tx;
      try {
        const gasEstimate = await governorWithSigner.estimateGas.castVoteBySig(
          proposalIdBN, 
          voteType, 
          sig.v, 
          sig.r, 
          sig.s
        );
        
        // Add 20% buffer to gas estimate
        const gasWithBuffer = gasEstimate.mul(12).div(10);
        
        console.log(`Gas estimate for castVoteBySig: ${gasEstimate.toString()} (with buffer: ${gasWithBuffer.toString()})`);
        
        tx = await governorWithSigner.castVoteBySig(
          proposalIdBN, 
          voteType, 
          sig.v, 
          sig.r, 
          sig.s, 
          { gasLimit: gasWithBuffer }
        );
      } catch (gasError) {
        console.warn(`Gas estimation failed for castVoteBySig: ${gasError.message}`);
        
        // Try with a fixed gas limit
        const gasLimit = ethers.BigNumber.from("1000000"); // 1M gas units
        
        tx = await governorWithSigner.castVoteBySig(
          proposalIdBN, 
          voteType, 
          sig.v, 
          sig.r, 
          sig.s, 
          { gasLimit }
        );
      }
      
      console.log(`Vote transaction sent: ${tx.hash}`);
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      console.log(`Vote confirmed in block ${receipt.blockNumber}`);
      
      return {
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        success: receipt.status === 1
      };
    } catch (error) {
      console.error('Error voting with meta-transaction:', error);
      
      // Improve error messages for common issues
      if (error.message.includes('execution reverted')) {
        const revertReason = error.message.includes(':') 
          ? error.message.split(':').pop().trim() 
          : 'Transaction reverted';
          
        throw new Error(`Vote failed: ${revertReason}`);
      }
      
      throw error;
    }
  }

  /**
   * Handle vote errors with user-friendly messages
   */
  handleVoteError(error) {
    // Extract a more user-friendly error message
    let userMessage = 'An error occurred while processing your vote';
    let methodType = 'validation';
    
    if (error.message.includes('not in active state')) {
      userMessage = 'This proposal is not currently active for voting';
    } else if (error.message.includes('already voted') || 
               error.message.includes('AlreadyCast') ||
               error.message.includes('already cast vote')) {
      userMessage = 'You have already voted on this proposal';
    } else if (error.message.includes('no voting power')) {
      userMessage = 'You had no voting power at the time this proposal was created. Make sure your tokens were delegated before the proposal was created.';
    } else {
      methodType = 'system-error';
      userMessage = `System error: ${error.message.substring(0, 100)}`;
    }
    
    return {
      success: false,
      method: methodType,
      error: userMessage
    };
  }

  /**
   * Validate that the proposal is in the active state
   */
  async validateProposalState(proposalId) {
    // Get the current state of the proposal
    const proposalState = await this.governorContract.state(proposalId);
    console.log(`Proposal ${proposalId} is in state: ${proposalState} (0=Pending, 1=Active, 2=Canceled, 3=Defeated, 4=Succeeded, 5=Queued, 6=Expired, 7=Executed)`);

    // Check if the proposal is active (state 1)
    if (proposalState !== 1) {
      const states = ['Pending', 'Active', 'Canceled', 'Defeated', 'Succeeded', 'Queued', 'Expired', 'Executed'];
      throw new Error(`Proposal is not in active state. Current state: ${states[proposalState]}`);
    }
  }

  /**
   * Validate that the user has voting power for this proposal
   */
  async validateUserVotingPower(proposalId, voterAddress) {
    // First check if they've already voted
    try {
      await this.simulateVote(proposalId, voterAddress);
    } catch (error) {
      throw error;
    }
    
    // Then check if they have voting power
    await this.checkVotingPowerAtSnapshot(proposalId, voterAddress);
  }

  /**
   * Simulate a vote to check if the user has already voted
   */
  async simulateVote(proposalId, voterAddress) {
    try {
      // We'll do a static call to the vote function to see if it would revert
      await this.governorContract.callStatic.castVote(proposalId, 1, { from: voterAddress });
      console.log(`User ${voterAddress} has not voted on proposal ${proposalId} yet`);
    } catch (callError) {
      // Check if the error is because they've already voted
      if (callError.message.includes('already cast vote') || 
          callError.message.includes('AlreadyCast') || 
          callError.message.includes('already voted')) {
        throw new Error('User has already voted on this proposal');
      }
      
      // If it's a different error, log it but don't throw
      console.log(`Vote simulation error not related to already voted: ${callError.message}`);
    }
  }

  /**
   * Check if the user had voting power at the proposal snapshot
   */
  async checkVotingPowerAtSnapshot(proposalId, voterAddress) {
    // Get the snapshot block for this proposal
    const snapshotBlock = await this.governorContract.proposalSnapshot(proposalId);
    console.log(`Snapshot block for proposal ${proposalId}: ${snapshotBlock}`);
    
    // Get the user's voting power at that block
    const votingPower = await this.governorContract.getVotes(voterAddress, snapshotBlock);
    console.log(`User ${voterAddress} had ${votingPower.toString()} voting power at snapshot block ${snapshotBlock}`);
    
    // Check if they had any voting power
    if (votingPower.isZero()) {
      throw new Error('User had no voting power at the proposal snapshot. Make sure tokens were delegated before the proposal was created.');
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
      const fromBlock = Math.max(0, currentBlock - 8000); // Last 10,000 blocks
      
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

  /**
   * Get proposal state description based on state number
   * @param {number} stateNum - Numeric state from contract
   * @returns {string} User-friendly state description
   */
  getProposalStateDescription(stateNum) {
    // Map numeric states to human-readable states
    const states = [
      'Pending',    // 0
      'Active',     // 1
      'Canceled',   // 2
      'Defeated',   // 3
      'Succeeded',  // 4
      'Queued',     // 5
      'Expired',    // 6
      'Executed'    // 7
    ];
    return states[stateNum] || 'Unknown';
  }

  /**
   * Execute a proposal that has passed voting
   * @param {string} proposalId - ID of the proposal to execute
   * @returns {Promise<{txHash: string}>} Transaction receipt
   */
  async executeProposal(proposalId) {
    if (!this.blockchainEnabled) {
      console.log('Blockchain is disabled. Simulating proposal execution...');
      return { txHash: this.generateRandomHash() };
    }
    
    try {
      // Ensure proposal exists and is in Succeeded state
      const proposalState = await this.getProposalState(proposalId);
      if (proposalState !== 'Succeeded') {
        throw new Error(`Proposal is in ${proposalState} state and cannot be executed`);
      }
      
      // Connect admin wallet to provider
      const adminWallet = new ethers.Wallet(this.adminPrivateKey, this.provider);
      
      // Get proposal info to retrieve the details needed for execution
      const proposal = await this.getProposalById(proposalId);
      if (!proposal || !proposal.descriptionHash) {
        throw new Error('Proposal details cannot be retrieved');
      }
      
      console.log(`Executing proposal ${proposalId}...`);
      
      // Create governor contract instance connected to admin wallet
      const governor = new ethers.Contract(
        this.governorAddress,
        this.governorAbi,
        adminWallet
      );
      
      // Execute the proposal
      const targets = proposal.targets || [];
      const values = proposal.values || [];
      const calldatas = proposal.calldatas || [];
      const descriptionHash = proposal.descriptionHash;
      
      console.log(`Execute params: targets=${targets}, values=${values}, calldatas length=${calldatas.length}, descHash=${descriptionHash}`);
      
      // Set a higher gas limit for execution as it can be complex
      const gasLimit = ethers.utils.hexlify(1000000); // 1M gas units
      
      // Execute the proposal transaction
      const tx = await governor.execute(
        targets,
        values,
        calldatas,
        descriptionHash,
        { gasLimit }
      );
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      console.log(`Proposal executed in tx: ${receipt.transactionHash}`);
      
      return { txHash: receipt.transactionHash };
    } catch (error) {
      console.error('Error executing proposal:', error);
      throw error;
    }
  }
  
  /**
   * Get a block explorer URL for a transaction
   * @param {string} txHash - Transaction hash
   * @returns {string} Block explorer URL
   */
  getBlockExplorerUrl(txHash) {
    // Get network from stored property or environment variable
    const network = this.networkName || process.env.BLOCKCHAIN_NETWORK || '';
    
    // Define explorer URLs for different networks
    const explorerUrls = {
      'sepolia': 'https://sepolia.etherscan.io',
      'mantleTestnet': 'https://explorer.sepolia.mantle.xyz',
      'mantle': 'https://explorer.mantle.xyz',
      'goerli': 'https://goerli.etherscan.io',
      'mainnet': 'https://etherscan.io'
    };
    
    // Get the appropriate explorer URL
    const baseUrl = explorerUrls[network] || '';
    
    if (!baseUrl) {
      console.log(`No block explorer URL configured for network: ${network}`);
      return '';
    }
    
    return `${baseUrl}/tx/${txHash}`;
  }

  /**
   * Get information about a proposal
   * @param {string} proposalId - ID of the proposal
   */
  async getProposalById(proposalId) {
    if (!this.blockchainEnabled) {
      return this.mockProposalData.find(p => p.id === proposalId);
    }

    try {
      const governor = new ethers.Contract(this.governorAddress, this.governorAbi, this.provider);
      const proposal = await governor.proposals(proposalId);

      // Format the proposal data
      return {
        id: proposalId,
        proposalId: proposalId,
        proposer: proposal.proposer,
        description: '', // Not stored in the proposals mapping
        startBlock: proposal.startBlock.toString(),
        endBlock: proposal.endBlock.toString(),
        votes: {
          forVotes: ethers.utils.formatUnits(proposal.forVotes, this.tokenDecimals),
          againstVotes: ethers.utils.formatUnits(proposal.againstVotes, this.tokenDecimals),
          abstainVotes: ethers.utils.formatUnits(proposal.abstainVotes, this.tokenDecimals)
        }
      };
    } catch (error) {
      console.error(`Error getting proposal info for ${proposalId}:`, error);
      return null;
    }
  }

  /**
   * Get all proposals (active or not)
   * @returns {Promise<Array>} Array of proposals
   */
  async getAllProposals() {
    if (!this.blockchainEnabled) {
      return this.mockProposalData || [];
    }

    try {
      // Ensure we have the governor ABI
      if (!this.governorAbi) {
        console.error('Governor ABI not found, cannot get proposals');
        return [];
      }
      
      // Get proposal created events from contract
      const governor = new ethers.Contract(
        this.governorAddress,
        this.governorAbi,
        this.provider
      );
      
      // Get filter for ProposalCreated events
      const filter = governor.filters.ProposalCreated();
      
      // Get all events from the last 10000 blocks or from contract deployment
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 10000);
      
      const events = await governor.queryFilter(filter, fromBlock, 'latest');
      
      // Process events into proposal objects
      const proposals = await Promise.all(events.map(async (event) => {
        if (!event.args) {
          console.warn('Proposal event missing args, skipping...');
          return null;
        }
        
        const proposalId = event.args.proposalId.toString();
        let state = 'Unknown';
        
        try {
          state = await this.getProposalState(proposalId);
        } catch (stateError) {
          console.warn(`Could not get state for proposal ${proposalId}:`, stateError.message);
        }
        
        return {
          id: proposalId,
          proposalId: proposalId,
          proposer: event.args.proposer,
          targets: event.args.targets || [],
          values: Array.isArray(event.args.values) 
            ? event.args.values.map(v => v.toString())
            : [],
          signatures: event.args.signatures || [],
          calldatas: event.args.calldatas || [],
          startBlock: event.args.startBlock ? event.args.startBlock.toString() : '0',
          endBlock: event.args.endBlock ? event.args.endBlock.toString() : '0',
          description: event.args.description || '',
          descriptionHash: event.args.descriptionHash || '',
          state: state,
          createdAt: event.blockNumber || 0,
          votes: {
            forVotes: '0',
            againstVotes: '0',
            abstainVotes: '0'
          }
        };
      }));
      
      // Filter out nulls from any failed mappings
      const validProposals = proposals.filter(p => p !== null);
      
      // Sort proposals by creation time or block number (newest first)
      return validProposals.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error('Error getting all proposals:', error);
      return [];
    }
  }

  /**
   * Get the state of a proposal as a string
   * @param {string} proposalId - ID of the proposal to check
   * @returns {Promise<string>} - String representation of the proposal state
   */
  async getProposalState(proposalId) {
    if (!this.blockchainEnabled) {
      return 'Active'; // Default state for mock proposals
    }
    
    try {
      // Check if we have the governorAbi
      if (!this.governorAbi) {
        console.warn('Governor ABI not available for getProposalState');
        return 'Unknown';
      }
      
      // Connect to contract with provider (read-only)
      const governor = new ethers.Contract(
        this.governorAddress,
        this.governorAbi,
        this.provider
      );
      
      // Try to call the state function
      try {
        const stateNum = await governor.state(proposalId);
        return this.getProposalStateDescription(stateNum);
      } catch (stateError) {
        console.warn('Error getting proposal state using standard method:', stateError.message);
        
        // Fallback: try to get the proposal data and infer the state
        try {
          const proposal = await governor.proposals(proposalId);
          
          // Check if proposal exists and try to infer state from timestamps/blocks
          if (proposal) {
            const currentBlock = await this.provider.getBlockNumber();
            const startBlock = proposal.startBlock ? proposal.startBlock.toNumber() : 0;
            const endBlock = proposal.endBlock ? proposal.endBlock.toNumber() : 0;
            
            if (currentBlock < startBlock) {
              return 'Pending';
            } else if (currentBlock >= startBlock && currentBlock <= endBlock) {
              return 'Active';
            } else {
              // If voting is over, check vote counts
              const forVotes = proposal.forVotes || 0;
              const againstVotes = proposal.againstVotes || 0;
              
              if (forVotes.gt(againstVotes)) {
                return 'Succeeded';
              } else {
                return 'Defeated';
              }
            }
          }
        } catch (proposalError) {
          console.warn('Error getting proposal data:', proposalError.message);
        }
        
        // Default fallback
        return 'Unknown';
      }
    } catch (error) {
      console.error('Error in getProposalState:', error);
      return 'Unknown';
    }
  }
}

module.exports = BlockchainService;
