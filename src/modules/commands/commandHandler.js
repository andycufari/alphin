/**
 * Command handler for Telegram bot
 */
class CommandHandler {
  /**
   * Create CommandHandler instance
   * @param {Object} bot - Telegram bot instance
   * @param {Object} blockchainManager - Blockchain service manager
   * @param {Object} walletManager - Wallet manager
   * @param {Object} aiService - AI service
   * @param {Object} textProcessor - Text processor
   * @param {Object} gamificationService - Gamification service
   * @param {string} communityGroupId - Telegram ID of the community group
   */
  constructor(
    bot, 
    blockchainManager, 
    walletManager, 
    aiService,
    textProcessor,
    gamificationService,
    databaseService,
    communityGroupId
  ) {
    this.bot = bot;
    this.blockchain = blockchainManager;
    this.wallets = walletManager;
    this.ai = aiService;
    this.textProcessor = textProcessor;
    this.gamification = gamificationService;
    this.db = databaseService;
    this.communityGroupId = communityGroupId;
    
    this.registerCommands();
  }
  
  /**
   * Format text safely for Telegram markdown
   * @param {string} text - The text to format
   * @returns {string} - Safely formatted text
   */
  safeMarkdown(text) {
    if (!text) return '';
    
    // Escape characters that have special meaning in Markdown
    return String(text)
      .replace(/\_/g, '\\_')  // Escape underscores
      .replace(/\*/g, '\\*')  // Escape asterisks
      .replace(/\[/g, '\\[')  // Escape square brackets
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')  // Escape parentheses
      .replace(/\)/g, '\\)')
      .replace(/\~/g, '\\~')  // Escape tildes
      .replace(/\`/g, '\\`')  // Escape backticks
      .replace(/\>/g, '\\>')  // Escape greater than
      .replace(/\#/g, '\\#')  // Escape hash
      .replace(/\+/g, '\\+')  // Escape plus
      .replace(/\-/g, '\\-')  // Escape minus
      .replace(/\=/g, '\\=')  // Escape equals
      .replace(/\|/g, '\\|')  // Escape pipe
      .replace(/\{/g, '\\{')  // Escape curly braces
      .replace(/\}/g, '\\}')
      .replace(/\./g, '\\.')  // Escape dots
      .replace(/\!/g, '\\!'); // Escape exclamation
  }
  
  /**
   * Sanitize error messages for safe display in Telegram
   * @param {string} errorMsg - The error message to sanitize
   * @param {number} maxLength - Maximum length before truncation
   * @returns {string} - Safely formatted error message
   */
  sanitizeErrorForTelegram(errorMsg, maxLength = 100) {
    if (!errorMsg) {
      return 'Unknown error';
    }
    
    // Convert to string if not already a string
    let errorString = String(errorMsg);
    
    // Remove complex JSON and object content 
    errorString = errorString.replace(/\{[^}]+\}/g, "{...}");
    errorString = errorString.replace(/\[[^\]]]+\]/g, "[...]");
    
    // Remove any URLs that might be in the error
    errorString = errorString.replace(/(https?:\/\/[^\s]+)/g, "URL");
    
    // Truncate to max length
    if (errorString.length > maxLength) {
      errorString = errorString.substring(0, maxLength - 3) + '...';
    }
    
    // Remove any special Markdown characters completely instead of escaping them
    // _ * [ ] ( ) ~ ` > # + - = | { } . ! are special in Telegram Markdown
    errorString = errorString.replace(/[_*[\]()~`>#+=\-|{}.!]/g, " ");
    
    // Remove extra spaces
    errorString = errorString.replace(/\s+/g, " ").trim();
    
    return errorString;
  }
  
  /**
   * Register all command handlers
   */
  registerCommands() {
    // Different command sets for private chats vs group chats
    this.bot.setMyCommands([
      { command: 'start', description: '🚀 Start interacting with the DAO' },
      { command: 'join', description: '🔑 Join the DAO' },
      { command: 'balance', description: '💰 Check your token balance' },
      { command: 'proposal', description: '📝 Create a new proposal' },
      { command: 'proposals', description: '🗳️ View active proposals' },
      { command: 'help', description: '❓ Get help' },
      { command: 'whatisdao', description: '🏛️ Learn about DAOs' }
    ], { scope: { type: 'all_private_chats' } });
    
    // Limited commands for groups - only help and whatisdao
    this.bot.setMyCommands([
      { command: 'help', description: '❓ Get help with Alphin DAO' },
      { command: 'whatisdao', description: '🏛️ Learn about Alphin DAO' },
      { command: 'proposals', description: '🗳️ View active proposals' }
    ], { scope: { type: 'all_group_chats' } });
    
    // Command handlers
    this.bot.onText(/^\/start$/, this.handleStart.bind(this));
    this.bot.onText(/^\/join$/, this.handleJoinDAO.bind(this));
    this.bot.onText(/^\/proposal$/, this.handleCreateProposal.bind(this));
    this.bot.onText(/^\/proposals$/, this.handleListProposals.bind(this));
    this.bot.onText(/^\/balance$/, this.handleCheckBalance.bind(this));
    this.bot.onText(/^\/help$/, this.handleHelp.bind(this));
    this.bot.onText(/^\/whatisdao$/, this.handleWhatIsDAO.bind(this));
    
    // Handle button callbacks
    this.bot.on('callback_query', this.handleCallbackQuery.bind(this));
    
    // Admin commands
    this.bot.onText(/^\/execute(?:\s+([a-zA-Z0-9]+))?$/, async (msg, match) => {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const proposalId = match[1];
      
      if (!proposalId) {
        return this.bot.sendMessage(
          chatId,
          'Please provide a proposal ID to execute. Usage: /execute [proposalId]'
        );
      }
      
      await this.handleExecuteProposal(chatId, userId, proposalId);
    });
  }
  
  /**
   * Handle /start command
   * @param {Object} msg - Telegram message object
   */
  async handleStart(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const isPrivateChat = msg.chat.type === 'private';
    
    // Determine if this is a deep link with parameters
    if (msg.text.includes('start vote_')) {
      const match = msg.text.match(/\/start vote_(.+)_(.+)/);
      if (match) {
        const proposalId = match[1];
        const voteType = match[2];
        return this.handleVoteAction(chatId, userId, proposalId, voteType);
      }
    } else if (msg.text.includes('start=proposals')) {
      // Special deep link to show active proposals
      return this.handleListProposals(msg);
    }
    
    // In group chats, provide a simple informational message
    if (!isPrivateChat) {
      return this.bot.sendMessage(
        chatId,
        `👋 Hi! I'm the Alphin DAO bot. To interact with the DAO, please message me directly at @AlphinDAO_bot.\n\nIn private chat, you can join the DAO, create proposals, vote, and more!`,
        { reply_to_message_id: msg.message_id }
      );
    }
    
    // For private chats, check if user is already a DAO member
    const isMember = await this.wallets.hasWallet(userId);
    
    let welcomeMessage = `Welcome to Alphin, your DAO assistant! 🚀\n\n`;
    let keyboard;
    
    if (isMember) {
      // Message for existing members
      welcomeMessage += `What would you like to do today?\n\n• 📝 Create new proposals\n• 🗳️ View and vote on proposals\n• 💰 Check your token balance\n• ❓ Get help with DAO functions`;
      
      keyboard = {
      reply_markup: {
        keyboard: [
            [{ text: '📝 Create Proposal' }, { text: '🗳️ View Proposals' }],
            [{ text: '💰 Check Balance' }, { text: '❓ Help' }],
            [{ text: '🏁 Back to Start' }]
          ],
          resize_keyboard: true
        }
      };
    } else {
      // Message for new users
      welcomeMessage += `Alphin DAO is a community-governed organization where decisions are made collectively.\n\nTo get started:\n\n• 🔑 Join the DAO and get tokens\n• ❓ Learn more about how DAOs work`;
      
      keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '🔑 Join DAO' }],
            [{ text: '❓ What is a DAO?' }]
          ],
          resize_keyboard: true
        }
      };
    }
    
    // Send welcome message with appropriate menu options (private chat only)
    this.bot.sendMessage(chatId, welcomeMessage, keyboard);
  }
  
  /**
   * Handle /join command
   * @param {Object} msg - Telegram message object
   */
  async handleJoinDAO(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username;
    
    // Only process private messages for actions requiring signing
    if (msg.chat.type !== 'private') {
      return this.bot.sendMessage(chatId, 'Please talk to me directly to join the DAO.');
    }
    
    try {
      // Check if user already has a wallet
      const hasWallet = await this.wallets.hasWallet(userId);
      
      if (hasWallet) {
        const address = await this.wallets.getWalletAddress(userId);
        const balance = await this.blockchain.getTokenBalance(address);
        
        // Get blockchain explorer URL based on network
        const network = process.env.BLOCKCHAIN_NETWORK || 'sepolia';
        const explorerUrl = this.getExplorerUrl(network, address);
        
        // Get the DAO group link from the .env file
        const groupLink = process.env.DAO_GROUP_LINK;
        
        return this.bot.sendMessage(
          chatId,
          `You are already a member of the DAO!\n\nJoin us on our private channel to keep you updated: [Join DAO Group](${groupLink})\n\nYour wallet address: \`${address}\`\nYour token balance: ${balance} tokens\n\n[View on Block Explorer](${explorerUrl})`,
          { parse_mode: 'Markdown' }
        );
      }
      
      // Prompt for PIN setup
      const message = await this.bot.sendMessage(
        chatId,
        'To join the DAO, you need to set up a PIN to secure your wallet. This PIN will be used to sign transactions.\n\nPlease enter a PIN (4-8 digits):',
        { reply_markup: { force_reply: true } }
      );
      
      // Setup awaiting PIN state
      this.textProcessor.setupAwaitingPin(userId, async (pin) => {
        try {
          // Send initial status message
          const statusMsg = await this.bot.sendMessage(
            chatId,
            '🔄 *Processing your request*\n\nStatus: Creating your wallet...',
            { parse_mode: 'Markdown' }
          );
          
          // Create wallet for user
          const address = await this.wallets.createWallet(userId, pin);
          
          // Update status message - wallet created
          await this.bot.editMessageText(
            '🔄 *Processing your request*\n\nStatus: Wallet created ✅\nStatus: Sending tokens to your wallet...',
            { 
              chat_id: chatId, 
              message_id: statusMsg.message_id,
              parse_mode: 'Markdown'
            }
          );
          
          // Send welcome tokens - pass userId to check if admin
          const result = await this.blockchain.sendWelcomeTokens(address, userId);
          
          // Update status message - tokens sent
          await this.bot.editMessageText(
            '🔄 *Processing your request*\n\nStatus: Wallet created ✅\nStatus: Tokens sent ✅\nStatus: Setting up voting rights...',
            { 
              chat_id: chatId, 
              message_id: statusMsg.message_id,
              parse_mode: 'Markdown'
            }
          );
          
          // Get blockchain explorer URL based on network
          const network = process.env.BLOCKCHAIN_NETWORK || 'sepolia';
          const explorerUrl = this.getExplorerUrl(network, address);
          const txExplorerUrl = this.getExplorerUrl(network, result.txHash, 'tx');
          
          // Add delegation note if it failed
          let delegationNote = '';
          let delegationStatus = 'Voting rights activated ✅';
          
          if (!result.delegationSuccess) {
            delegationStatus = 'Voting rights setup failed ❌';
            delegationNote = '\n\n⚠️ *Note:* Token delegation failed. You may need to manually delegate your tokens to vote on proposals. This is usually a temporary issue with the blockchain network.';
          }
          
          // Final status update - all done
          await this.bot.editMessageText(
            `🔄 *Processing your request*\n\nStatus: Wallet created ✅\nStatus: Tokens sent ✅\nStatus: ${delegationStatus}`,
            { 
              chat_id: chatId, 
              message_id: statusMsg.message_id,
              parse_mode: 'Markdown'
            }
          );
          
          // Format token amount with commas
          const formattedAmount = Number(result.amount).toLocaleString();
          
          // Determine token visual based on amount
          let tokenVisual = '';
          const tokenAmount = parseFloat(result.amount);
          
          if (tokenAmount < 100) {
            tokenVisual = '🥉'; // Bronze for small balance
          } else if (tokenAmount < 1000) {
            tokenVisual = '🥈'; // Silver for medium balance
          } else if (tokenAmount < 10000) {
            tokenVisual = '🥇'; // Gold for large balance
          } else {
            tokenVisual = '👑'; // Crown for very large balance
          }
          
          const groupLink = process.env.DAO_GROUP_LINK;

          // Customize message based on admin status
          let welcomeMessage;
          if (result.isAdmin) {
            welcomeMessage = `${tokenVisual} *Welcome to the DAO, Admin!* 🎉\n\nYour wallet has been created and *${formattedAmount} admin tokens* have been sent to your address.\n\nJoin us on our private channel to keep you updated: [Join DAO Group](${groupLink})\n\nWallet address: \`${address}\`\n\n[View Wallet on Block Explorer](${explorerUrl})\n[View Token Transaction](${txExplorerUrl})\n\nYour tokens ${result.delegationSuccess ? 'are' : 'should be'} delegated, so you can vote on proposals and create new ones right away! Keep your PIN secure - you'll need it for DAO actions.${delegationNote}`;
          } else {
            welcomeMessage = `${tokenVisual} *Welcome to the DAO!* 🎉\n\nYour wallet has been created and *${formattedAmount} tokens* have been sent to your address.\n\nJoin us on our private channel to keep you updated: [Join DAO Group](${groupLink})\n\nWallet address: \`${address}\`\n\n[View Wallet on Block Explorer](${explorerUrl})\n[View Token Transaction](${txExplorerUrl})\n\nYour tokens ${result.delegationSuccess ? 'are' : 'should be'} delegated, so you can vote on proposals right away! Keep your PIN secure - you'll need it for DAO actions.${delegationNote}`;
          }
          
          this.bot.sendMessage(
            chatId,
            welcomeMessage,
            { parse_mode: 'Markdown' }
          );
          
          // Notify community group if configured
          if (this.communityGroupId) {
            const usernameDisplay = username 
              ? `@${username}` 
              : msg.from.first_name 
                ? `${msg.from.first_name}${msg.from.last_name ? ' ' + msg.from.last_name : ''}` 
                : 'A new member';
                
            const roleMessage = result.isAdmin ? ' as an admin' : '';
            
            try {
              await this.bot.sendMessage(
              this.communityGroupId,
                `🌟 *New Member Alert!*\n\n${tokenVisual} ${usernameDisplay} has joined Alphin DAO${roleMessage}!\n\n💰 *${formattedAmount} tokens* have been granted\n\nThey can now participate in proposals and voting.\n\n*Let's give them a warm welcome!* 👋`,
                { parse_mode: 'Markdown' }
              );
            } catch (groupError) {
              console.log(`Failed to send message to community group: ${groupError.message}`);
              
              // If the error is about supergroup, try to use the new chat ID
              if (groupError.message.includes('supergroup chat')) {
                try {
                  // Try to handle the supergroup migration
                  const migrationInfo = groupError.response?.parameters;
                  if (migrationInfo && migrationInfo.migrate_to_chat_id) {
                    console.log(`Group migrated to supergroup with ID: ${migrationInfo.migrate_to_chat_id}`);
                    await this.bot.sendMessage(
                      migrationInfo.migrate_to_chat_id,
                      `🌟 *New Member Alert!*\n\n${tokenVisual} ${usernameDisplay} has joined Alphin DAO${roleMessage}!\n\n💰 *${formattedAmount} tokens* have been granted\n\nThey can now participate in proposals and voting.\n\n*Let's give them a warm welcome!* 👋`,
                      { parse_mode: 'Markdown' }
                    );
                  }
                } catch (innerError) {
                  console.log(`Failed to send message to supergroup: ${innerError.message}`);
                }
              }
              
              // No need to throw error here, the user has already joined successfully
            }
          }
        } catch (error) {
          console.error('Error in join process:', error);
          this.bot.sendMessage(chatId, `Error joining the DAO: ${error.message}`);
        }
      });
      
      // Save message ID to delete it later (for security)
      const state = this.textProcessor.getConversationState(userId);
      state.messageToDelete = message.message_id;
      this.textProcessor.setConversationState(userId, state);
      
    } catch (error) {
      console.error('Error in join process:', error);
      this.bot.sendMessage(chatId, `Error joining the DAO: ${error.message}`);
    }
  }
  
  /**
   * Handle /proposal command
   * @param {Object} msg - Telegram message object
   */
  async handleCreateProposal(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Only process in private chat
    if (msg.chat.type !== 'private') {
      return this.bot.sendMessage(chatId, 'Please talk to me directly to create a proposal.');
    }
    
    try {
      // Check if user is a DAO member
      const hasWallet = await this.wallets.hasWallet(userId);
      
      if (!hasWallet) {
        return this.bot.sendMessage(
          chatId,
          'You need to join the DAO before creating a proposal. Use /join to get started.'
        );
      }
      
      // Get user's wallet address and check token balance
      const address = await this.wallets.getWalletAddress(userId);
      const balance = await this.blockchain.getTokenBalance(address);
      
      // Check if user has enough tokens to create a proposal
      const minimumTokens = 1; // Configurable minimum
      
      if (parseFloat(balance) < minimumTokens) {
        return this.bot.sendMessage(
          chatId,
          `You need at least ${minimumTokens} tokens to create a proposal. Current balance: ${balance} tokens.\n\nParticipate in the DAO by voting on proposals to earn more tokens!`
        );
      }
      
      // Start proposal creation flow
      this.bot.sendMessage(
        chatId,
        'Let\'s create a new DAO proposal! First, enter a title for your proposal (keep it concise):'
      );
      
      // Setup proposal creation state
      this.textProcessor.setupCreatingProposal(userId, async (pin, title, description) => {
        // Store the user info for use in the proposal announcement
        const userInfo = {
          username: msg.from.username,
          first_name: msg.from.first_name,
          last_name: msg.from.last_name,
          id: msg.from.id
        };
        
        // Call the method that handles the proposal creation with status updates
        await this.createProposalWithStatus(chatId, userId, pin, title, description, userInfo);
      });
      
    } catch (error) {
      console.error('Error starting proposal creation:', error);
      this.bot.sendMessage(chatId, `Error starting proposal creation: ${error.message}`);
    }
  }
  
  /**
   * Handle /balance command
   * @param {Object} msg - Telegram message object
   */
  async handleCheckBalance(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Only process in private chat
    if (msg.chat.type !== 'private') {
      return this.bot.sendMessage(chatId, 'Please talk to me directly to check your balance.');
    }
    
    try {
      // Check if user is a DAO member
      const hasWallet = await this.wallets.hasWallet(userId);
      
      if (!hasWallet) {
        return this.bot.sendMessage(
          chatId,
          'You need to join the DAO first. Use /join to get started.'
        );
      }
      
      // Show loading message
      const statusMsg = await this.bot.sendMessage(
        chatId,
        '🔄 *Checking your balance...*',
        { parse_mode: 'Markdown' }
      );
      
      // Get user's wallet address and token balance
      const address = await this.wallets.getWalletAddress(userId);
      
      // Update status message
      await this.bot.editMessageText(
        '🔄 *Checking your balance...*\n\nRetrieved wallet address ✅\nFetching token balance...',
        { 
          chat_id: chatId, 
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown'
        }
      );
      
      const balance = await this.blockchain.getTokenBalance(address);
      
      // Get blockchain explorer URL based on network
      const network = process.env.BLOCKCHAIN_NETWORK || 'sepolia';
      const explorerUrl = this.getExplorerUrl(network, address);
      
      // Delete the status message
      await this.bot.deleteMessage(chatId, statusMsg.message_id);
      
      // Format the balance with commas for better readability
      const formattedBalance = Number(balance).toLocaleString();
      
      // Create a visual representation of tokens based on amount
      let tokenVisual = '';
      const balanceNum = parseFloat(balance);
      
      if (balanceNum <= 0) {
        tokenVisual = '⚪'; // Empty circle for zero balance
      } else if (balanceNum < 100) {
        tokenVisual = '🥉'; // Bronze for small balance
      } else if (balanceNum < 1000) {
        tokenVisual = '🥈'; // Silver for medium balance
      } else if (balanceNum < 10000) {
        tokenVisual = '🥇'; // Gold for large balance
      } else {
        tokenVisual = '👑'; // Crown for very large balance
      }
      
      // Add user tier based on token amount
      let userTier = '';
      if (balanceNum <= 0) {
        userTier = 'Observer';
      } else if (balanceNum < 100) {
        userTier = 'Member';
      } else if (balanceNum < 1000) {
        userTier = 'Contributor';
      } else if (balanceNum < 10000) {
        userTier = 'Influencer';
      } else {
        userTier = 'Leader';
      }
      
      // Format the wallet address for better display (first 6 + last 4 chars)
      const shortAddress = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
      
      // Send the final balance message with enhanced formatting
      this.bot.sendMessage(
        chatId,
        `${tokenVisual} *Your DAO Token Balance*\n\n*${formattedBalance} tokens*\n\n` +
        `*Tier:* ${userTier}\n` +
        `*Wallet:* \`${address}\`\n\n` +
        `🔍 [View on Block Explorer](${explorerUrl})\n` +
        `\nYour tokens represent your voting power in Alphin DAO. The more tokens you have, the greater your influence on governance decisions.`,
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      console.error('Error checking balance:', error);
      this.bot.sendMessage(chatId, `Error checking balance: ${error.message}`);
    }
  }
  
  /**
   * Handle /help command
   * @param {Object} msg - Telegram message object
   */
  async handleHelp(msg) {
    const chatId = msg.chat.id;
    
    // Different behavior for private vs group chats
    if (msg.chat.type !== 'private') {
      // In group chats, direct users to private chat
      return this.bot.sendMessage(
        chatId,
        `To get full help with Alphin DAO features, please message me directly at @AlphinDAO_bot.\n\nPrivate chat provides a more interactive experience with custom menus and detailed guidance.`,
        { reply_to_message_id: msg.message_id }
      );
    }
    
    // In private chats, show help topics with inline keyboard
    const helpTopics = {
      inline_keyboard: [
        [
          { text: '🏛️ What is a DAO?', callback_data: 'help_dao' },
          { text: '🔑 Joining the DAO', callback_data: 'help_joining' }
        ],
        [
          { text: '📝 Creating Proposals', callback_data: 'help_proposals' },
          { text: '💰 Tokens & Balances', callback_data: 'help_tokens' }
        ],
        [
          { text: '🔐 Security & PIN', callback_data: 'help_security' }
        ]
      ]
    };
    
    this.bot.sendMessage(
      chatId,
      '❓ *Get Help with Alphin DAO*\n\nWhat would you like to learn more about? Choose a topic below:',
      { 
        parse_mode: 'Markdown',
        reply_markup: helpTopics 
      }
    );
  }
  
  /**
   * Handle "What is a DAO?" button/command
   * @param {Object} msg - Telegram message object
   */
  async handleWhatIsDAO(msg) {
    const chatId = msg.chat.id;
    const isPrivateChat = msg.chat.type === 'private';
    
    // Create a detailed explanation of DAOs with a focus on onboarding
    const daoExplanation = `
*What is Alphin DAO?* 🏛️

Alphin DAO is a *Decentralized Autonomous Organization* - a community that makes decisions collectively through voting.

*How it works:*

• Members hold tokens that represent voting power 🗳️
• Anyone can create proposals for the community 📝
• All members vote on proposals to approve or reject them
• Decisions are executed automatically on the blockchain

*The best part?* You don't need any technical knowledge! Alphin handles all the complex blockchain stuff behind the scenes.
${isPrivateChat ? '\nReady to join? Just tap the "🔑 Join DAO" button to get started and receive your first tokens!' : '\nTo join, start a private chat with me by clicking @AlphinDAO_bot'}
`;

    if (isPrivateChat) {
      // In private chats, show action buttons
      this.bot.sendMessage(
        chatId,
        daoExplanation,
        { 
          parse_mode: 'Markdown',
            reply_markup: {
            keyboard: [
              [{ text: '🔑 Join DAO' }],
              [{ text: '🏁 Back to Start' }]
            ],
            resize_keyboard: true
          }
        }
      );
    } else {
      // In group chats, no action buttons
            this.bot.sendMessage(
              chatId,
        daoExplanation,
        { parse_mode: 'Markdown' }
      );
    }
  }
  
  /**
   * Handle callback query from inline keyboards
   * @param {Object} callbackQuery - Callback query data
   */
  async handleCallbackQuery(callbackQuery) {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    
    try {
      // Answer callback query to stop loading animation
      await this.bot.answerCallbackQuery(callbackQuery.id);
      
      // Vote callback format: v_[proposalId]_[voteType]
      if (data.startsWith('v_')) {
        const parts = data.split('_');
        if (parts.length === 3) {
          const proposalId = parts[1];
          const voteType = parts[2];
      await this.handleVoteAction(chatId, userId, proposalId, voteType);
        }
      } 
      // Execute proposal callback: exec_[proposalId]
      else if (data.startsWith('exec_')) {
        const proposalId = data.split('_')[1];
        await this.handleExecuteProposal(chatId, userId, proposalId);
      }
      // Join DAO callback
      else if (data === 'join_dao') {
        await this.handleJoinDAO(chatId, userId);
      }
      // Check balance callback
      else if (data === 'check_balance') {
        await this.handleCheckBalance(chatId, userId);
      }
      // Create proposal callback
      else if (data === 'create_proposal') {
        await this.handleCreateProposal(chatId, userId);
      }
      // View proposals callback
      else if (data === 'view_proposals') {
        await this.handleViewProposals(chatId, userId);
      }
      // Help callback
      else if (data === 'help') {
        await this.handleHelp(chatId);
      }
    } catch (error) {
      console.error('Error handling callback query:', error);
      this.bot.sendMessage(
        chatId,
        'Sorry, there was an error processing your request. Please try again later.'
      );
    }
  }
  
  /**
   * Handle voting action
   * @param {string} chatId - Telegram chat ID
   * @param {string} userId - Telegram user ID
   * @param {string} proposalId - ID or shortened ID of the proposal
   * @param {string} voteType - Type of vote (0=against, 1=for, 2=abstain)
   */
  async handleVoteAction(chatId, userId, proposalId, voteType) {
    try {
      // Check if user is a DAO member
      const hasWallet = await this.wallets.hasWallet(userId);
      
      if (!hasWallet) {
        return this.bot.sendMessage(
          chatId,
          'You need to join the DAO before voting. Use /join to get started.'
        );
      }
      
      // Get active proposals to find the full ID if only a short ID was provided
      let fullProposalId = proposalId;
      let proposal;
      
      // If proposalId is short (likely from v_ callback), find the full ID
      if (proposalId.length <= 10) {
        try {
          // Get all active proposals
          const activeProposals = await this.blockchain.getActiveProposals();
          
          // Find the proposal that matches the short ID
          const matchingProposal = activeProposals.find(p => 
            (p.id && p.id.startsWith(proposalId)) || 
            (p.proposalId && p.proposalId.startsWith(proposalId))
          );
          
          if (matchingProposal) {
            // Use the appropriate property based on what's available
            fullProposalId = matchingProposal.id || matchingProposal.proposalId;
            proposal = await this.blockchain.getProposalInfo(fullProposalId);
          } else {
            return this.bot.sendMessage(
              chatId,
              `Error: Could not find an active proposal matching ID ${proposalId}.`
            );
          }
        } catch (error) {
          console.error('Error finding full proposal ID:', error);
          return this.bot.sendMessage(
            chatId,
            `Error: Could not retrieve proposal information. The proposal may not exist or has expired.`
          );
        }
      } else {
        // Direct fetch if full ID was provided
        try {
          proposal = await this.blockchain.getProposalInfo(fullProposalId);
        } catch (error) {
          console.error('Error getting proposal info:', error);
          return this.bot.sendMessage(
            chatId,
            `Error: Could not retrieve proposal information. The proposal may not exist or has expired.`
          );
        }
      }
      
      // Check if proposal is active
      if (proposal.state !== 'Active') {
        return this.bot.sendMessage(
          chatId,
          `This proposal is not currently active for voting. Current state: ${proposal.state}`
        );
      }
      
      // Get vote type description
      const voteTypeDesc = voteType === '0' ? 'AGAINST' : voteType === '1' ? 'FOR' : 'ABSTAIN';
      
      // Show pending message to user
      const pendingMsg = await this.bot.sendMessage(
        chatId,
        `🕒 *Processing Your Vote*\n\nYou are voting ${voteTypeDesc} on proposal ${fullProposalId.substring(0, 8)}...\n\nPlease wait while we process your vote...`,
        { parse_mode: 'Markdown' }
      );
      
      // Save pending message ID to state to ensure we can reference it later
      const state = this.textProcessor.getConversationState(userId) || {};
      state.pendingVoteMessageId = pendingMsg.message_id;
      this.textProcessor.setConversationState(userId, state);
      
      // Prompt for PIN
      const message = await this.bot.sendMessage(
        chatId,
        `Please enter your PIN to confirm your vote:\n\n_(Your vote will be cryptographically signed with your private key for true decentralization. Only gas fees are covered by the DAO.)_`,
        { 
          reply_markup: { force_reply: true },
          parse_mode: 'Markdown'
        }
      );
      
      // Setup awaiting vote PIN state
      this.textProcessor.setupAwaitingVotePin(userId, async (pin) => {
        try {
          // Get current state to retrieve message IDs
          const currentState = this.textProcessor.getConversationState(userId) || {};
          const pendingMsgId = currentState.pendingVoteMessageId;
          
          // Delete the pending message if it exists
          if (pendingMsgId) {
            try {
              await this.bot.deleteMessage(chatId, pendingMsgId);
            } catch (deleteError) {
              console.warn('Could not delete pending message:', deleteError.message);
            }
          }
          
          // Show processing message
          const votingMsg = await this.bot.sendMessage(
            chatId,
            `🔄 *Processing Your Vote*\n\nVote: ${voteTypeDesc}\nProposal: ${fullProposalId.substring(0, 8)}...\n\n*Status:* Checking credentials ⏳`,
            { parse_mode: 'Markdown' }
          );
          
          // Save voting message ID to state
          const updatedState = this.textProcessor.getConversationState(userId) || {};
          updatedState.votingMessageId = votingMsg.message_id;
          this.textProcessor.setConversationState(userId, updatedState);
          
          // Get user's wallet
          const userWallet = await this.wallets.decryptWallet(userId, pin);
          const address = await this.wallets.getWalletAddress(userId);
          
          // Update status message - make sure the message ID still exists
          try {
            await this.bot.editMessageText(
              `🔄 *Processing Your Vote*\n\nVote: ${voteTypeDesc}\nProposal: ${fullProposalId.substring(0, 8)}...\n\n*Status:* Credentials verified ✅\n*Status:* Creating your vote signature ⏳`,
              {
                chat_id: chatId,
                message_id: votingMsg.message_id,
                parse_mode: 'Markdown'
              }
            );
          } catch (editError) {
            console.warn('Could not update status message:', editError.message);
            // If we can't edit, send a new message
            const newMsg = await this.bot.sendMessage(
              chatId,
              `🔄 *Processing Your Vote*\n\nVote: ${voteTypeDesc}\nProposal: ${fullProposalId.substring(0, 8)}...\n\n*Status:* Credentials verified ✅\n*Status:* Creating your vote signature ⏳`,
              { parse_mode: 'Markdown' }
            );
            
            // Update the message ID in state
            const newState = this.textProcessor.getConversationState(userId) || {};
            newState.votingMessageId = newMsg.message_id;
            this.textProcessor.setConversationState(userId, newState);
          }
          
          // Check if user has already voted using our database
          const existingVote = await this.db.hasUserVotedOnProposal(userId, fullProposalId);
          if (existingVote) {
            const voteTypeText = existingVote.vote_type === 0 ? 'AGAINST' : existingVote.vote_type === 1 ? 'FOR' : 'ABSTAIN';
            // Delete status message
            if (currentVotingMsgId) {
              try {
                await this.bot.deleteMessage(chatId, currentVotingMsgId);
              } catch (err) {
                console.warn('Could not delete voting status message:', err.message);
              }
            }
            
            return this.bot.sendMessage(
              chatId,
              `You have already voted ${voteTypeText} on this proposal on ${new Date(existingVote.vote_timestamp * 1000).toLocaleString()}.\n\nYou cannot change your vote once it has been cast.`,
              { parse_mode: 'Markdown' }
            );
          }
          
          // Get latest state to ensure we have the most current message ID
          let latestState = this.textProcessor.getConversationState(userId) || {};
          let currentVotingMsgId = latestState.votingMessageId;
          
          // Update status to show we're creating the signature
          if (currentVotingMsgId) {
            try {
              await this.bot.editMessageText(
                `🔄 *Processing Your Vote*\n\nVote: ${voteTypeDesc}\nProposal: ${fullProposalId.substring(0, 8)}...\n\n*Status:* Credentials verified ✅\n*Status:* Creating your vote signature ✅\n*Status:* Submitting to blockchain ⏳`,
                {
                  chat_id: chatId,
                  message_id: currentVotingMsgId,
                  parse_mode: 'Markdown'
                }
              );
            } catch (updateError) {
              console.warn('Could not update status message:', updateError.message);
            }
          }
          
          // Submit vote with full proposal ID
          const result = await this.blockchain.castVote(fullProposalId, userWallet, parseInt(voteType));
          
          // Get latest state to ensure we have the most current message ID
          latestState = this.textProcessor.getConversationState(userId) || {};
          currentVotingMsgId = latestState.votingMessageId;
          
          // Check for validation errors (pre-transaction checks) 
          if (result && !result.success && result.method === 'validation') {
            if (currentVotingMsgId) {
              try {
                // Sanitize the error message
                const sanitizedError = this.sanitizeErrorForTelegram(result.error, 100);
                  
                await this.bot.editMessageText(
                  `ℹ️ *Vote Validation Check*\n\nWe checked your vote before submitting to the blockchain and found an issue:\n\n${sanitizedError}\n\nThis prevented an unnecessary transaction that would have failed.`,
                  {
                    chat_id: chatId,
                    message_id: currentVotingMsgId,
                    parse_mode: 'Markdown'
                  }
                );
                return; // Stop processing since we have a validation error
              } catch (editError) {
                console.warn('Could not update validation message:', editError.message);
                // Send a new message instead with sanitized text
                try {
                  const sanitizedError = this.sanitizeErrorForTelegram(result.error, 100);
                    
                  this.bot.sendMessage(
                    chatId,
                    `ℹ️ *Vote Validation Check*\n\nWe checked your vote before submitting to the blockchain and found an issue:\n\n${sanitizedError}\n\nThis prevented an unnecessary transaction that would have failed.`,
                    { parse_mode: 'Markdown' }
                  );
                } catch (sendError) {
                  // Last resort, send without markdown
                  this.bot.sendMessage(
                    chatId,
                    `ℹ️ Vote Validation Check\n\nWe checked your vote before submitting to the blockchain and found an issue. This prevented an unnecessary transaction that would have failed.`,
                    { parse_mode: null }
                  );
                }
                return; // Stop processing since we have a validation error
              }
            } else {
              // If we don't have a message ID, just send a new message with sanitized error
              try {
                const sanitizedError = this.sanitizeErrorForTelegram(result.error, 100);
                  
                this.bot.sendMessage(
                  chatId,
                  `ℹ️ *Vote Validation Check*\n\nWe checked your vote before submitting to the blockchain and found an issue:\n\n${sanitizedError}\n\nThis prevented an unnecessary transaction that would have failed.`,
                  { parse_mode: 'Markdown' }
                );
              } catch (error) {
                // Last resort, send without markdown
                this.bot.sendMessage(
                  chatId,
                  `ℹ️ Vote Validation Check\n\nWe checked your vote before submitting to the blockchain and found an issue. This prevented an unnecessary transaction that would have failed.`,
                  { parse_mode: null }
                );
              }
              return; // Stop processing since we have a validation error
            }
          }
          
          // Only continue with reward and notifications if vote was successful
          if (result && result.success) {
            // Update status message if message ID exists
            if (currentVotingMsgId) {
              try {
                // Get status message based on the method used
                let statusMessage;
                if (result.method === 'meta-transaction') {
                  statusMessage = `🔄 *Processing Your Vote*\n\nVote: ${voteTypeDesc}\nProposal: ${fullProposalId.substring(0, 8)}...\n\n*Status:* Credentials verified ✅\n*Status:* Vote signature created ✅\n*Status:* Vote submitted ✅\n*Status:* Processing reward ⏳`;
                } else if (result.method === 'direct-user-vote') {
                  statusMessage = `🔄 *Processing Your Vote*\n\nVote: ${voteTypeDesc}\nProposal: ${fullProposalId.substring(0, 8)}...\n\n*Status:* Credentials verified ✅\n*Status:* Direct vote submitted ✅\n*Status:* Processing reward ⏳`;
                } else {
                  statusMessage = `🔄 *Processing Your Vote*\n\nVote: ${voteTypeDesc}\nProposal: ${fullProposalId.substring(0, 8)}...\n\n*Status:* Vote submitted ✅\n*Status:* Processing reward ⏳`;
                }
                
                await this.bot.editMessageText(
                  statusMessage,
                  {
                    chat_id: chatId,
                    message_id: currentVotingMsgId,
                    parse_mode: 'Markdown'
                  }
                );
              } catch (updateError) {
                console.warn('Could not update voting status message:', updateError.message);
              }
            }
            
            // Get updated proposal info for current vote counts
            try {
              const updatedProposal = await this.blockchain.getProposalInfo(fullProposalId);
              proposal = updatedProposal; // Use the updated vote counts
            } catch (error) {
              console.warn('Could not get updated proposal info:', error.message);
              // Continue with the existing proposal info
            }
            
            // Track vote in database
            try {
              await this.db.trackUserVote(userId, fullProposalId, parseInt(voteType), result.txHash);
              console.log(`Tracked vote for user ${userId} on proposal ${fullProposalId}`);
            } catch (trackError) {
              console.error('Error tracking user vote:', trackError);
              // Continue even if tracking fails - non-critical
            }

            // Reward user for voting
            try {
              await this.gamification.rewardForVoting(address);
              
              // Delete status message before showing final success if we have a valid message ID
              if (currentVotingMsgId) {
                try {
                  await this.bot.deleteMessage(chatId, currentVotingMsgId);
                } catch (err) {
                  console.warn('Could not delete status message:', err.message);
                }
              }
              
              // Notify user - show shortened proposal ID in the message for better UX
              let votingMethod;
              let warningNote = '';
              
              // Determine voting method description based on the method used
              if (result.method === 'meta-transaction') {
                votingMethod = "Your vote was cryptographically signed with your private key and recorded on-chain";
              } else if (result.method === 'direct-user-vote') {
                votingMethod = "Your vote was submitted directly from your wallet";
              } else if (result.method === 'admin-assisted') {
                votingMethod = "Your vote was processed via admin-assisted method";
                //warningNote = "\n\n⚠️ *Note:* Meta-transaction failed, so we used an admin-assisted method as a fallback. Your vote is still recorded correctly.";
              } else {
                votingMethod = "Your vote was processed via " + result.method;
              }
              
              // Add any warning messages from the result
              if (result.warningMessage) {
                warningNote = `\n\n⚠️ *Note:* ${result.warningMessage}`;
              }
                
              this.bot.sendMessage(
                chatId,
                `✅ *Vote Cast Successfully!* 🗳️\n\n` +
                `*Vote:* ${voteTypeDesc}\n` +
                `*Proposal ID:* \`${fullProposalId.substring(0, 8)}...\`\n` +
                `*Transaction:* \`${result.txHash.substring(0, 8)}...\`\n\n` +
                `_${votingMethod}_${warningNote}\n\n` +
                `You've earned tokens as a reward for participating!`,
                { parse_mode: 'Markdown' }
              );
            } catch (rewardError) {
              console.error('Error rewarding user for voting:', rewardError);
              
              // Notify without mentioning reward
              this.bot.sendMessage(
                chatId,
                `✅ *Vote Cast Successfully!* 🗳️\n\n` +
                `*Vote:* ${voteTypeDesc}\n` +
                `*Proposal ID:* \`${fullProposalId.substring(0, 8)}...\`\n` +
                `*Transaction:* \`${result.txHash.substring(0, 8)}...\`\n\n` +
                `_Your vote was cryptographically signed with your private key and recorded on-chain_`,
                { parse_mode: 'Markdown' }
              );
            }
            
            // Update proposal in cache and check its status after the vote
            try {
              // Get updated proposal information with latest votes
              const updatedProposal = await this.blockchain.getProposalInfo(fullProposalId);
              
              // Save updated proposal to cache
              await this.db.updateProposalCache(updatedProposal);
              
              // Check if this vote makes the proposal pass or fail
              // This is a simple check - in a real DAO, use the governance rules
              const forVotes = parseFloat(updatedProposal.votes.forVotes);
              const againstVotes = parseFloat(updatedProposal.votes.againstVotes);
              const totalVotes = forVotes + againstVotes + parseFloat(updatedProposal.votes.abstainVotes);
              
              // If the vote is close to threshold or quorum, notify admins
              if (Math.abs(forVotes - againstVotes) / totalVotes < 0.1 && 
                  this.communityGroupId && totalVotes > 5) {
                try {
                  // This is a close vote - send a notification to the community
                  const forPercent = (forVotes / totalVotes * 100).toFixed(1);
                  const againstPercent = (againstVotes / totalVotes * 100).toFixed(1);
                  
                  await this.bot.sendMessage(
                    this.communityGroupId,
                    `⚠️ *Close Vote Alert!*\n\nProposal #${fullProposalId.substring(0, 8)} is very close!\n\n` +
                    `Current results:\n` +
                    `✅ For: ${forVotes} (${forPercent}%)\n` +
                    `❌ Against: ${againstVotes} (${againstPercent}%)\n\n` +
                    `Every vote counts! Make your voice heard before voting ends.`,
                    { parse_mode: 'Markdown' }
                  );
                } catch (notifyError) {
                  console.error('Error sending close vote notification:', notifyError);
                }
              }
            } catch (statusError) {
              console.error('Error checking proposal status after vote:', statusError);
              // Non-critical, continue
            }
            
            // ... rest of the code ...
          } else if (result.method === 'all-methods-failed') {
            // Handle the case where all voting methods failed - clean display for Telegram
            const sanitizedError = this.sanitizeErrorForTelegram(result.error);
            
            if (currentVotingMsgId) {
              try {
                await this.bot.editMessageText(
                  `❌ *Vote Failed*\n\nUnable to process your vote.\n\n${sanitizedError}`,
                  {
                    chat_id: chatId,
                    message_id: currentVotingMsgId,
                    parse_mode: 'Markdown'
                  }
                );
              } catch (editError) {
                console.warn('Could not update vote failed message (parse error):', editError.message);
                
                // Try again without markdown
                try {
                  await this.bot.editMessageText(
                    `❌ Vote Failed\n\nUnable to process your vote.\n\n${sanitizedError}`,
                    {
                      chat_id: chatId,
                      message_id: currentVotingMsgId,
                      parse_mode: null
                    }
                  );
                } catch (plainEditError) {
                  console.warn('Could not update vote failed message (plain text):', plainEditError.message);
                  
                  // Last resort: send a new message
                  try {
                    await this.bot.sendMessage(
                      chatId,
                      `❌ Vote Failed\n\nUnable to process your vote.`,
                      { parse_mode: null }
                    );
                  } catch (sendError) {
                    console.error('All attempts to notify user of vote failure failed:', sendError);
                  }
                }
              }
            } else {
              // No message ID to update, send a new message
              try {
                await this.bot.sendMessage(
                  chatId,
                  `❌ *Vote Failed*\n\nUnable to process your vote.\n\n${sanitizedError}`,
                  { parse_mode: 'Markdown' }
                );
              } catch (sendError) {
                console.warn('Could not send vote failed message (parse error):', sendError.message);
                
                // Try again without markdown
                try {
                  await this.bot.sendMessage(
                    chatId,
                    `❌ Vote Failed\n\nUnable to process your vote.\n\n${sanitizedError}`,
                    { parse_mode: null }
                  );
                } catch (plainSendError) {
                  console.error('All attempts to notify user of vote failure failed:', plainSendError);
                }
              }
            }
          } else if (result && result.status === 'failed' && result.method === 'simulation') {
            // ... existing code for simulation failure ...
          } else {
            // ... existing code for other vote failures ...
          }
        } catch (error) {
          console.error('Error casting vote:', error);
          
          // User-friendly error message
          let errorMsg = 'Sorry, we could not process your vote at this time.';
          
          if (error.message.includes('already voted')) {
            errorMsg = 'You have already voted on this proposal.';
          } else if (error.message.includes('Invalid PIN')) {
            errorMsg = 'Invalid PIN. Please try again with the correct PIN.';
          } else if (error.message.includes('insufficient funds')) {
            errorMsg = 'There are insufficient funds to process your vote. Please contact a DAO admin.';
          } else if (error.message.includes('rejected')) {
            errorMsg = 'Vote transaction was rejected. You may have already voted on this proposal.';
          }
          
          this.bot.sendMessage(chatId, `❌ *Vote Failed*\n\n${errorMsg}`, { parse_mode: 'Markdown' });
        }
      });

            
      // Save message ID to delete it later (for security)
      const updatedState = this.textProcessor.getConversationState(userId) || {};
      updatedState.messageToDelete = message.message_id;
      this.textProcessor.setConversationState(userId, updatedState);
    } catch (error) {
      console.error('Error in handleVoteAction:', error);
      this.bot.sendMessage(
        chatId,
        'Sorry, there was an error processing your vote. Please try again later.'
      );
    }
  }
  
  /**
   * Handle help topics
   * @param {string} chatId - Telegram chat ID
   * @param {string} topic - Help topic
   */
  async handleHelpTopic(chatId, topic) {
    try {
      const helpResponse = await this.ai.generateDAOHelp(topic);
      this.bot.sendMessage(chatId, helpResponse, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error generating help content:', error);
      
      // Fallback help messages with Telegram Markdown and emojis
      const fallbackHelp = {
        'dao': `🏛️ *What is Alphin DAO?*\n\nA DAO (Decentralized Autonomous Organization) is a community-governed entity where decisions are made collectively by members who hold voting tokens.\n\n✨ With Alphin DAO:\n• No technical knowledge needed\n• All blockchain complexity is hidden\n• You can join with a simple command\n• Participate directly from Telegram`,
        
        'joining': `🔑 *Joining Alphin DAO*\n\nJoining is simple and only takes a minute:\n\n1. Click the "Join DAO" button or use the /join command\n2. Create a PIN (4-8 digits) to secure your wallet\n3. Your wallet will be created automatically\n4. You'll receive welcome tokens to start participating\n\n*Important:* Remember your PIN! You'll need it to vote and create proposals.`,
        
        'voting': `🗳️ *Voting in Alphin DAO*\n\nVoting is easy! When you see a proposal in the community group:\n\n1. Click one of the vote buttons (Yes/No/Abstain)\n2. You'll be redirected to a private chat\n3. Enter your PIN to confirm your vote\n4. Earn tokens as a reward for participating\n\nYour vote power is based on how many tokens you hold.`,
        
        'proposals': `📝 *Creating Proposals*\n\nShare your ideas with the community:\n\n1. Use the "Create Proposal" button or /proposal command\n2. Enter a clear title and detailed description\n3. Confirm with your PIN\n4. Your proposal will be announced to all members for voting\n\n*Note:* You need tokens to create proposals. The more thoughtful proposals you make, the more influence you gain!`,
        
        'tokens': `💰 *Alphin DAO Tokens*\n\nTokens are the core of our DAO:\n\n• They represent your voting power\n• You receive tokens when joining\n• Earn more by voting on proposals\n• Earn even more by creating good proposals\n• All tokens are managed automatically\n\nCheck your balance anytime with the "Check Balance" button!`,
        
        'security': `🔐 *Security in Alphin DAO*\n\nYour security is our priority:\n\n• Your PIN secures your wallet\n• *Never* share your PIN with anyone\n• PIN messages are automatically deleted\n• Your private key never leaves the server\n• All sensitive actions happen in private chat\n\nIf you forget your PIN, you'll need to create a new wallet.`
      };
      
      const selectedHelp = fallbackHelp[topic] || `❓ *Help*\n\nSorry, I couldn't generate help content for that topic right now.\n\nTry asking about:\n• What is a DAO?\n• How voting works\n• Creating proposals\n• Tokens and rewards\n• Security`;
      
      this.bot.sendMessage(
        chatId,
        selectedHelp,
        { parse_mode: 'Markdown' }
      );
    }
  }
  
  /**
   * Get blockchain explorer URL based on network and address/transaction
   * @param {string} network - The blockchain network (e.g., 'sepolia', 'mainnet')
   * @param {string} hash - The address or transaction hash
   * @param {string} type - Type of URL ('address' or 'tx')
   * @returns {string} - The explorer URL
   */
  getExplorerUrl(network, hash, type = 'address') {
    // Define base URLs for different networks
    const explorers = {
      'mainnet': 'https://etherscan.io',
      'goerli': 'https://goerli.etherscan.io',
      'sepolia': 'https://sepolia.etherscan.io',
      'optimism': 'https://optimistic.etherscan.io',
      'arbitrum': 'https://arbiscan.io',
      'polygon': 'https://polygonscan.com',
      'bsc': 'https://bscscan.com',
      'avalanche': 'https://snowtrace.io',
      'mantletestnet': 'https://explorer.sepolia.mantle.xyz'
      // Add more networks as needed
    };
    
    // Default to Sepolia if network not found
    const baseUrl = explorers[network.toLowerCase()] || explorers['sepolia'];
    console.log(`Using explorer URL for ${network}: ${baseUrl}`);
    
    return `${baseUrl}/${type}/${hash}`;
  }

  /**
   * Handle proposal creation with steps and status updates
   * @param {number} chatId - Chat ID
   * @param {number} userId - User ID
   * @param {string} pin - User's PIN
   * @param {string} title - Proposal title
   * @param {string} description - Proposal description
   * @param {Object} userInfo - User information object with username, first_name, etc.
   * @returns {Promise<void>}
   */
  async createProposalWithStatus(chatId, userId, pin, title, description, userInfo) {
    try {
      // Send initial status message
      const statusMsg = await this.bot.sendMessage(
        chatId,
        '🔄 *Creating your proposal*\n\nStatus: Validating credentials...',
        { parse_mode: 'Markdown' }
      );
      
      // Get user's wallet
      const userWallet = await this.wallets.decryptWallet(userId, pin);
      
      // Update status - validated
      await this.bot.editMessageText(
        '🔄 *Creating your proposal*\n\nStatus: Credentials validated ✅\nStatus: Submitting to blockchain...',
        { 
          chat_id: chatId, 
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown'
        }
      );
      
      // Create the proposal
      const proposal = {
        title: title,
        description: description
      };
      
      const result = await this.blockchain.createProposal(proposal, userWallet);
      
      // Update status - proposal created
      await this.bot.editMessageText(
        '🔄 *Creating your proposal*\n\nStatus: Credentials validated ✅\nStatus: Proposal submitted ✅\nStatus: Processing rewards...',
        { 
          chat_id: chatId, 
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown'
        }
      );
      
      // Get user address
      const address = await this.wallets.getWalletAddress(userId);
      
      // Reward user for creating proposal
      await this.gamification.rewardForProposal(address);
      
      // Final status update - all done
      await this.bot.editMessageText(
        '🔄 *Creating your proposal*\n\nStatus: Credentials validated ✅\nStatus: Proposal submitted ✅\nStatus: Rewards processed ✅\nStatus: Announcing to community...',
        { 
          chat_id: chatId, 
          message_id: statusMsg.message_id,
          parse_mode: 'Markdown'
        }
      );
      
      // Create network explorer link
      const network = process.env.BLOCKCHAIN_NETWORK || 'sepolia';
      const txExplorerUrl = this.getExplorerUrl(network, result.txHash, 'tx');
      
      // Delete the status message
      await this.bot.deleteMessage(chatId, statusMsg.message_id);
      
      // Send confirmation to user
      await this.bot.sendMessage(
        chatId,
        `📜 *Proposal Created Successfully!*\n\n` +
        `*Title:* ${title}\n\n` +
        `Your proposal has been submitted to the blockchain and will be announced in the community group.\n\n` +
        `🔗 [View Transaction](${txExplorerUrl})\n\n` +
        `✨ *What's Next?*\n` +
        `• Members will now vote on your proposal\n` +
        `• You've earned tokens for your contribution\n` +
        `• Results will be determined once voting ends`,
        { parse_mode: 'Markdown' }
      );
      
      // Announce proposal in community group
      if (this.communityGroupId) {
        // Truncate the proposal ID to ensure it fits within Telegram's callback_data limit
        // Telegram has a 64-byte limit for callback_data
        const shortProposalId = result.proposalId.substring(0, 10); // Take only first 10 chars
        
        const inlineKeyboard = {
          inline_keyboard: [
            [
              { text: 'Vote Yes', callback_data: `v_${shortProposalId}_1` },
              { text: 'Vote No', callback_data: `v_${shortProposalId}_0` },
              { text: 'Abstain', callback_data: `v_${shortProposalId}_2` }
            ]
          ]
        };
        
        try {
          const submitterName = userInfo && userInfo.username 
            ? `@${userInfo.username}` 
            : userInfo && userInfo.first_name
              ? userInfo.first_name
              : 'a DAO member';
          
          const safeName = this.safeMarkdown(submitterName);
          const safeTitle = this.safeMarkdown(title);
          const safeDesc = this.safeMarkdown(description.substring(0, 200) + (description.length > 200 ? '...' : ''));
              
          await this.bot.sendMessage(
            this.communityGroupId,
            `📢 *New Governance Proposal*\n\nSubmitted by: ${safeName}\n\n*${safeTitle}*\n\n${safeDesc}\n\n🗳️ *Voting is now open!* Your vote matters in shaping the future of Alphin DAO.\n\nSelect an option below to cast your vote:`,
            { 
              parse_mode: 'Markdown',
              reply_markup: inlineKeyboard
            }
          );
        } catch (groupError) {
          console.log(`Failed to send proposal to community group: ${groupError.message}`);
          
          // Try without markdown if there's a formatting error
          try {
            const submitterName = userInfo && userInfo.username 
              ? `@${userInfo.username}` 
              : userInfo && userInfo.first_name
                ? userInfo.first_name
                : 'a DAO member';
                
            await this.bot.sendMessage(
              this.communityGroupId,
              `📢 New Governance Proposal\n\nSubmitted by: ${submitterName}\n\n${title}\n\n${description.substring(0, 200)}${description.length > 200 ? '...' : ''}\n\n🗳️ Voting is now open! Your vote matters in shaping the future of Alphin DAO.\n\nSelect an option below to cast your vote:`,
              { 
                parse_mode: null,
                reply_markup: inlineKeyboard
              }
            );
          } catch (fallbackError) {
            console.error('Error sending proposal announcement (fallback):', fallbackError);
            // Handle migrated groups like in join method, if needed
          }
        }
      }
      
    } catch (error) {
      console.error('Error in proposal creation:', error);
      this.bot.sendMessage(chatId, `Error creating proposal: ${error.message}`);
    }
  }

  /**
   * Handle /proposals command to list active proposals
   * @param {Object} msg - Telegram message object
   */
  async handleListProposals(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from ? msg.from.id : null;
    const isPrivateChat = msg.chat.type === 'private';
    
    try {
      // Send a loading message
      const statusMsg = await this.bot.sendMessage(
        chatId,
        '🔄 *Fetching active proposals...*',
        { parse_mode: 'Markdown' }
      );
      
      // Get active proposals
      const activeProposals = await this.blockchain.getActiveProposals();
      
      // For private chats, get the user's voting history to mark what they've voted on
      let userVotes = [];
      if (isPrivateChat && userId) {
        try {
          userVotes = await this.db.getUserVotedProposals(userId);
        } catch (error) {
          console.warn('Error getting user votes:', error);
          // Continue without user votes
        }
      }
      
      // Delete the loading message
      await this.bot.deleteMessage(chatId, statusMsg.message_id);
      
      // Check if there are any active proposals
      if (!activeProposals || activeProposals.length === 0) {
        return this.bot.sendMessage(
          chatId,
          '📭 *No Active Proposals*\n\nThere are currently no active proposals to vote on.\n\n' +
          (isPrivateChat ? 'Want to be the first? Use /proposal to create one!' : ''),
          { parse_mode: 'Markdown' }
        );
      }
      
      // Format the proposals list
      let proposalsList = '🗳️ *Active Proposals*\n\n';
      
      // For each proposal, create a voting keyboard if in private chat
      for (let i = 0; i < activeProposals.length; i++) {
        const proposal = activeProposals[i];
        const proposalId = proposal.id || proposal.proposalId;
        const shortProposalId = proposalId.substring(0, 8);
        const title = proposal.title || 'Untitled Proposal';
        
        // Add proposal to the list with index number
        proposalsList += `*${i+1}. ${title}*\n`;
        proposalsList += `ID: \`${shortProposalId}...\`\n\n`;
        
        // For private chats, send each proposal individually with voting buttons
        if (isPrivateChat) {
          // Only send the first 3 as individual messages, then list the rest together
          if (i < 3) {
            // Use the shortened ID for callback data to fit Telegram's limits
            const shortId = proposalId.substring(0, 10);
            
            // Check if user has already voted on this proposal
            const userVoteForProposal = userVotes.find(v => v.proposal_id === proposalId);
            let voteKeyboard;
            
            if (userVoteForProposal) {
              // If user has already voted, show their vote instead of voting options
              const voteTypeText = userVoteForProposal.vote_type === 0 ? 'AGAINST' : 
                                  userVoteForProposal.vote_type === 1 ? 'FOR' : 'ABSTAIN';
              const voteIcon = userVoteForProposal.vote_type === 0 ? '❌' : 
                              userVoteForProposal.vote_type === 1 ? '✅' : '⚪';
              
              voteKeyboard = {
                inline_keyboard: [
                  [{ text: `You voted ${voteIcon} ${voteTypeText} on ${new Date(userVoteForProposal.vote_timestamp * 1000).toLocaleDateString()}`, callback_data: 'already_voted' }]
                ]
              };
            } else {
              // If user hasn't voted, show voting options
              voteKeyboard = {
                inline_keyboard: [
                  [
                    { text: '✅ Vote Yes', callback_data: `v_${shortId}_1` },
                    { text: '❌ Vote No', callback_data: `v_${shortId}_0` },
                    { text: '⚪ Abstain', callback_data: `v_${shortId}_2` }
                  ]
                ]
              };
            }
            
            await this.bot.sendMessage(
              chatId,
              `*Proposal #${i+1}: ${title}*\n\nID: \`${shortProposalId}...\`\n\n${proposal.description ? (proposal.description.substring(0, 200) + (proposal.description.length > 200 ? '...' : '')) : 'No description available.'}\n\nCast your vote:`,
              { 
                parse_mode: 'Markdown',
                reply_markup: voteKeyboard
              }
            );
          }
        }
      }
      
      // For group chats or if there are more than 3 proposals, send a summary list
      if (!isPrivateChat || activeProposals.length > 3) {
        // For private chats with more than 3 proposals, modify the list message
        if (isPrivateChat && activeProposals.length > 3) {
          proposalsList = '🗳️ *Additional Active Proposals*\n\n';
          
          // Only include proposals beyond the first 3 in the list
          for (let i = 3; i < activeProposals.length; i++) {
            const proposal = activeProposals[i];
            const proposalId = proposal.id || proposal.proposalId;
            const shortProposalId = proposalId.substring(0, 8);
            const title = proposal.title || 'Untitled Proposal';
            
            proposalsList += `*${i+1}. ${title}*\n`;
            proposalsList += `ID: \`${shortProposalId}...\`\n\n`;
          }
        }
        
        let replyMarkup = {};
        
        // For private chats, add a prompt to check specific proposals
        if (isPrivateChat) {
          proposalsList += 'To vote on a specific proposal, use the vote buttons shown above.';
        } else {
          // For group chats, add a button to open private chat for voting
          proposalsList += 'To vote on any proposal, click the button below to start a private chat.';
          replyMarkup = {
            inline_keyboard: [
              [
                { text: '🗳️ Open Voting Interface', url: 'https://t.me/AlphinDAO_bot?start=proposals' }
              ]
            ]
          };
        }
        
        // Send the proposals list
        this.bot.sendMessage(
          chatId,
          proposalsList,
          { 
            parse_mode: 'Markdown',
            reply_markup: isPrivateChat ? {} : replyMarkup
          }
        );
      }
    } catch (error) {
      console.error('Error listing proposals:', error);
      this.bot.sendMessage(
        chatId,
        'Sorry, there was an error fetching the active proposals. Please try again later.'
      );
    }
  }

  /**
   * Handle execute proposal command
   * @param {string} chatId - Telegram chat ID
   * @param {string} userId - Telegram user ID
   * @param {string} proposalId - ID of the proposal to execute
   */
  async handleExecuteProposal(chatId, userId, proposalId) {
    try {
      // Check if user is a DAO member and admin
      const hasWallet = await this.wallets.hasWallet(userId);
      
      if (!hasWallet) {
        return this.bot.sendMessage(
          chatId,
          'You need to join the DAO before executing proposals. Use /join to get started.'
        );
      }
      
      // Check if user is an admin
      const isAdmin = await this.userService.isAdmin(userId);
      if (!isAdmin) {
        return this.bot.sendMessage(
          chatId,
          'Only DAO administrators can execute proposals.'
        );
      }
      
      // Get active proposals to find the full ID if only a short ID was provided
      let fullProposalId = proposalId;
      
      // If proposalId is short (likely from callback), find the full ID
      if (proposalId.length <= 10) {
        try {
          // Get all proposals
          const proposals = await this.blockchain.getAllProposals();
          
          // Find the proposal that matches the short ID
          const matchingProposal = proposals.find(p => 
            (p.id && p.id.startsWith(proposalId)) || 
            (p.proposalId && p.proposalId.startsWith(proposalId))
          );
          
          if (matchingProposal) {
            // Use the appropriate property based on what's available
            fullProposalId = matchingProposal.id || matchingProposal.proposalId;
          } else {
            return this.bot.sendMessage(
              chatId,
              `Error: Could not find a proposal matching ID ${proposalId}.`
            );
          }
        } catch (error) {
          console.error('Error finding full proposal ID:', error);
          return this.bot.sendMessage(
            chatId,
            `Error: Could not retrieve proposal information. Please check the proposal ID.`
          );
        }
      }
      
      // Show processing message
      const statusMsg = await this.bot.sendMessage(
        chatId,
        `🔄 *Executing Proposal*\n\nProposal ID: \`${fullProposalId.substring(0, 8)}...\`\n\n*Status:* Checking proposal eligibility ⏳`,
        { parse_mode: 'Markdown' }
      );
      
      // Define a status callback to update the message
      const updateStatus = async (status) => {
        try {
          await this.bot.editMessageText(
            `🔄 *Executing Proposal*\n\nProposal ID: \`${fullProposalId.substring(0, 8)}...\`\n\n*Status:* ${status}`,
            {
              chat_id: chatId,
              message_id: statusMsg.message_id,
              parse_mode: 'Markdown'
            }
          );
        } catch (error) {
          console.warn('Could not update status message:', error.message);
        }
      };
      
      // Execute the proposal with status updates
      const result = await this.blockchain.verifyApprovalsAndFinalizeProposal(
        fullProposalId, 
        { statusCallback: updateStatus }
      );
      
      // Handle the result
      if (result.success) {
        if (result.executed) {
          // Successfully executed
          await this.bot.editMessageText(
            `✅ *Proposal Successfully Executed!*\n\nProposal ID: \`${fullProposalId.substring(0, 8)}...\`\n\n${result.txHash ? `*Transaction:* \`${result.txHash.substring(0, 8)}...\`\n\n${result.blockExplorerUrl ? `[View on Block Explorer](${result.blockExplorerUrl})` : ''}` : ''}`,
            {
              chat_id: chatId,
              message_id: statusMsg.message_id,
              parse_mode: 'Markdown',
              disable_web_page_preview: true
            }
          );
          
          // Announce in the community group
          if (this.communityGroupId) {
            try {
              // Get user information for the announcement
              const userInfo = await this.bot.getChat(userId);
              const username = userInfo.username 
                ? `@${userInfo.username}` 
                : userInfo.first_name 
                  ? `${userInfo.first_name}${userInfo.last_name ? ' ' + userInfo.last_name : ''}` 
                  : 'An administrator';
                  
              await this.bot.sendMessage(
                this.communityGroupId,
                `🚀 *Proposal Executed*\n\nProposal ID: \`${fullProposalId.substring(0, 8)}...\` has been executed by ${username}.\n\nThe approved changes have now been implemented.`,
                { 
                  parse_mode: 'Markdown',
                  disable_web_page_preview: true
                }
              );
            } catch (error) {
              console.error('Error sending execution announcement to community group:', error);
            }
          }
        } else {
          // Not executed but not an error (e.g., already executed or wrong state)
          await this.bot.editMessageText(
            `ℹ️ *Proposal Not Executed*\n\nProposal ID: \`${fullProposalId.substring(0, 8)}...\`\n\nReason: ${result.reason}`,
            {
              chat_id: chatId,
              message_id: statusMsg.message_id,
              parse_mode: 'Markdown'
            }
          );
        }
      } else {
        // Execution failed with an error
        await this.bot.editMessageText(
          `❌ *Proposal Execution Failed*\n\nProposal ID: \`${fullProposalId.substring(0, 8)}...\`\n\nError: ${result.reason}`,
          {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: 'Markdown'
          }
        );
      }
    } catch (error) {
      console.error('Error in handleExecuteProposal:', error);
      this.bot.sendMessage(
        chatId,
        'Sorry, there was an error executing the proposal. Please try again later.'
      );
    }
  }

  /**
   * Format proposal information for display
   * @param {Object} proposal - Proposal data
   * @param {boolean} isDetailView - If true, show more details
   * @param {boolean} isAdmin - If true, show admin actions
   * @returns {Object} Formatted message and keyboard
   */
  formatProposalDisplay(proposal, isDetailView = false, isAdmin = false) {
    const shortenedId = proposal.id.substring(0, 8);
    const stateEmoji = 
      proposal.state === 'Active' ? '🟢' :
      proposal.state === 'Succeeded' ? '✅' :
      proposal.state === 'Executed' ? '🏁' :
      proposal.state === 'Defeated' ? '❌' :
      proposal.state === 'Pending' ? '⏳' : '⚪';
    
    let message = `*Proposal #${shortenedId}* ${stateEmoji}\n\n`;
    
    // Add description (if available)
    if (proposal.description) {
      // Format description - limit to 200 chars for list view
      const desc = isDetailView 
        ? proposal.description 
        : proposal.description.length > 200 
          ? proposal.description.substring(0, 200) + '...' 
          : proposal.description;
      
      message += `*Description:* ${desc}\n\n`;
    }
    
    // Add state and votes
    message += `*State:* ${proposal.state}\n`;
    message += `*Votes:*\n`;
    message += `✅ For: ${proposal.votes.forVotesFormatted || proposal.votes.forVotes}\n`;
    message += `❌ Against: ${proposal.votes.againstVotesFormatted || proposal.votes.againstVotes}\n`;
    message += `⚪ Abstain: ${proposal.votes.abstainVotesFormatted || proposal.votes.abstainVotes}\n`;
    
    // Add more details for detailed view
    if (isDetailView) {
      message += `\n*Proposer:* \`${proposal.proposer}\`\n`;
      
      if (proposal.startBlock && proposal.endBlock) {
        message += `*Voting Period:* Block ${proposal.startBlock} - ${proposal.endBlock}\n`;
      }
      
      if (proposal.targets && proposal.targets.length > 0) {
        message += `\n*Technical Details:*\n`;
        message += `Targets: ${proposal.targets.length} contract(s)\n`;
      }
    }
    
    // Create inline keyboard for actions
    const keyboard = [];
    
    // Add voting buttons for active proposals
    if (proposal.state === 'Active') {
      keyboard.push([
        { text: 'Vote For ✅', callback_data: `v_${shortenedId}_1` },
        { text: 'Vote Against ❌', callback_data: `v_${shortenedId}_0` },
        { text: 'Abstain ⚪', callback_data: `v_${shortenedId}_2` }
      ]);
    }
    
    // Add execute button for succeeded proposals (admin only)
    if (proposal.state === 'Succeeded' && isAdmin) {
      keyboard.push([
        { text: '🚀 Execute Proposal', callback_data: `exec_${shortenedId}` }
      ]);
    }
    
    return {
      message,
      keyboard
    };
  }

  /**
   * Handle the view proposals command
   * @param {string} chatId - Telegram chat ID
   * @param {string} userId - Telegram user ID
   */
  async handleViewProposals(chatId, userId) {
    try {
      // Check if user is a DAO member
      const hasWallet = await this.wallets.hasWallet(userId);
      
      if (!hasWallet) {
        return this.bot.sendMessage(
          chatId,
          'You need to join the DAO to view proposals. Use /join to get started.'
        );
      }
      
      // Show loading message
      const loadingMsg = await this.bot.sendMessage(
        chatId,
        '🔄 *Loading Proposals*\n\nPlease wait while we fetch the latest proposals...',
        { parse_mode: 'Markdown' }
      );
      
      // Check if user is an admin
      const isAdmin = await this.userService.isAdmin(userId);
      
      // Get active proposals first
      const activeProposals = await this.blockchain.getActiveProposals();
      
      // Get all proposals to show in the list
      const allProposals = await this.blockchain.getAllProposals();
      
      // Delete loading message
      try {
        await this.bot.deleteMessage(chatId, loadingMsg.message_id);
      } catch (err) {
        console.warn('Could not delete loading message:', err.message);
      }
      
      if (allProposals.length === 0) {
        return this.bot.sendMessage(
          chatId,
          'There are no proposals in the DAO yet.\n\nUse /propose to create a new proposal.'
        );
      }
      
      // Send message about active proposals first
      if (activeProposals.length > 0) {
        await this.bot.sendMessage(
          chatId,
          `*🗳️ Active Proposals (${activeProposals.length})*\n\nThe following proposals are currently open for voting:`,
          { parse_mode: 'Markdown' }
        );
        
        // Send each active proposal
        for (const proposal of activeProposals) {
          const { message, keyboard } = this.formatProposalDisplay(proposal, true, isAdmin);
          
          await this.bot.sendMessage(
            chatId,
            message,
            {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: keyboard
              }
            }
          );
        }
      }
      
      // Group other proposals by state for display
      const succeededProposals = allProposals.filter(p => p.state === 'Succeeded');
      const executedProposals = allProposals.filter(p => p.state === 'Executed');
      const otherProposals = allProposals.filter(p => 
        !['Active', 'Succeeded', 'Executed'].includes(p.state)
      );
      
      // Send succeeded proposals (if any) - these can be executed
      if (succeededProposals.length > 0) {
        await this.bot.sendMessage(
          chatId,
          `*✅ Passed Proposals (${succeededProposals.length})*\n\nThe following proposals have passed and are waiting to be executed:`,
          { parse_mode: 'Markdown' }
        );
        
        for (const proposal of succeededProposals) {
          const { message, keyboard } = this.formatProposalDisplay(proposal, true, isAdmin);
          
          await this.bot.sendMessage(
            chatId,
            message,
            {
              parse_mode: 'Markdown',
              reply_markup: keyboard.length > 0 ? {
                inline_keyboard: keyboard
              } : undefined
            }
          );
        }
      }
      
      // Send executed proposals (if any)
      if (executedProposals.length > 0) {
        await this.bot.sendMessage(
          chatId,
          `*🏁 Executed Proposals (${executedProposals.length})*\n\nThe following proposals have been executed:`,
          { parse_mode: 'Markdown' }
        );
        
        for (const proposal of executedProposals.slice(0, 3)) { // Limit to 3 most recent
          const { message, keyboard } = this.formatProposalDisplay(proposal, false, isAdmin);
          
          await this.bot.sendMessage(
            chatId,
            message,
            {
              parse_mode: 'Markdown',
              reply_markup: keyboard.length > 0 ? {
                inline_keyboard: keyboard
              } : undefined
            }
          );
        }
        
        if (executedProposals.length > 3) {
          await this.bot.sendMessage(
            chatId,
            `_... and ${executedProposals.length - 3} more executed proposals._`,
            { parse_mode: 'Markdown' }
          );
        }
      }
      
      // Send other proposals (defeated, expired, etc.)
      if (otherProposals.length > 0) {
        await this.bot.sendMessage(
          chatId,
          `*Other Proposals (${otherProposals.length})*\n\nThese proposals are in other states (defeated, expired, etc.):`,
          { parse_mode: 'Markdown' }
        );
        
        for (const proposal of otherProposals.slice(0, 3)) { // Limit to 3 most recent
          const { message, keyboard } = this.formatProposalDisplay(proposal, false, isAdmin);
          
          await this.bot.sendMessage(
            chatId,
            message,
            {
              parse_mode: 'Markdown',
              reply_markup: keyboard.length > 0 ? {
                inline_keyboard: keyboard
              } : undefined
            }
          );
        }
        
        if (otherProposals.length > 3) {
          await this.bot.sendMessage(
            chatId,
            `_... and ${otherProposals.length - 3} more proposals in other states._`,
            { parse_mode: 'Markdown' }
          );
        }
      }
      
      // Final message with instructions
      this.bot.sendMessage(
        chatId,
        '*Proposal Instructions*\n\n' +
        '• To vote on active proposals, click the vote buttons above\n' +
        '• To create a new proposal, use the /propose command\n' +
        (isAdmin ? '• To execute passed proposals, click the execute button\n' : '') +
        '• To get more help, use the /help command',
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error('Error in handleViewProposals:', error);
      this.bot.sendMessage(
        chatId,
        'Sorry, there was an error retrieving the proposals. Please try again later.'
      );
    }
  }
}

module.exports = CommandHandler;
