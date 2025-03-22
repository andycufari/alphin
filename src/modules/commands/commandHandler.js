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
    communityGroupId
  ) {
    this.bot = bot;
    this.blockchain = blockchainManager;
    this.wallets = walletManager;
    this.ai = aiService;
    this.textProcessor = textProcessor;
    this.gamification = gamificationService;
    this.communityGroupId = communityGroupId;
    
    this.registerCommands();
  }
  
  /**
   * Register all command handlers
   */
  registerCommands() {
    // Set up main menu commands
    this.bot.setMyCommands([
      { command: 'start', description: 'Start the bot' },
      { command: 'join', description: 'Join the DAO' },
      { command: 'proposal', description: 'Create a new proposal' },
      { command: 'balance', description: 'Check your token balance' },
      { command: 'help', description: 'Get help with DAO functions' }
    ]);
    
    // Command handlers
    this.bot.onText(/\/start/, this.handleStart.bind(this));
    this.bot.onText(/\/join/, this.handleJoinDAO.bind(this));
    this.bot.onText(/\/proposal/, this.handleCreateProposal.bind(this));
    this.bot.onText(/\/balance/, this.handleCheckBalance.bind(this));
    this.bot.onText(/\/help/, this.handleHelp.bind(this));
    
    // Handle button callbacks
    this.bot.on('callback_query', this.handleCallbackQuery.bind(this));
  }
  
  /**
   * Handle /start command
   * @param {Object} msg - Telegram message object
   */
  async handleStart(msg) {
    const chatId = msg.chat.id;
    
    // Only process commands in private chat
    if (msg.chat.type !== 'private') return;
    
    // Create keyboard buttons
    const keyboard = {
      reply_markup: {
        keyboard: [
          ['Join DAO', 'Create Proposal'],
          ['Check Balance', 'Help']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    };
    
    const welcomeMessage = `
Welcome to Alfin, your DAO assistant! 🚀

I'm here to help you participate in DAO governance directly from Telegram. Here's what you can do:

• Join the DAO and get tokens
• Create governance proposals
• Vote on active proposals
• Check your token balance

The best part? You don't need to worry about blockchain complexity - I handle all of that for you!

To get started, press "Join DAO" or use the /join command.
`;
    
    this.bot.sendMessage(chatId, welcomeMessage, keyboard);
  }
  
  /**
   * Handle /join command
   * @param {Object} msg - Telegram message object
   */
  async handleJoinDAO(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
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
        
        return this.bot.sendMessage(
          chatId,
          `You are already a member of the DAO!\n\nYour wallet address: \`${address}\`\nYour token balance: ${balance} tokens\n\nYou can use these tokens to vote on proposals or create your own proposals.`,
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
          // Create wallet for user
          const address = await this.wallets.createWallet(userId, pin);
          
          // Send welcome tokens
          await this.blockchain.sendWelcomeTokens(address);
          
          // Notify user
          const welcomeTokens = process.env.WELCOME_TOKENS || "10";
          
          this.bot.sendMessage(
            chatId,
            `Welcome to the DAO! 🎉\n\nYour wallet has been created and ${welcomeTokens} tokens have been sent to your address.\n\nWallet address: \`${address}\`\n\nYour tokens are already delegated, so you can vote on proposals right away! Keep your PIN secure - you'll need it for DAO actions.`,
            { parse_mode: 'Markdown' }
          );
          
          // Notify community group if configured
          if (this.communityGroupId) {
            this.bot.sendMessage(
              this.communityGroupId,
              `🎉 New member has joined the DAO!`
            );
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
      console.error('Error in handleJoinDAO:', error);
      this.bot.sendMessage(chatId, `Something went wrong: ${error.message}`);
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
        try {
          // Get user's wallet
          const userWallet = await this.wallets.decryptWallet(userId, pin);
          
          // Create the proposal
          const proposal = {
            title: title,
            description: description
          };
          
          const result = await this.blockchain.createProposal(proposal, userWallet);
          
          // Reward user for creating proposal
          await this.gamification.rewardForProposal(address);
          
          // Announce proposal in community group
          if (this.communityGroupId) {
            const inlineKeyboard = {
              inline_keyboard: [
                [
                  { text: 'Vote Yes', callback_data: `vote_${result.proposalId}_1` },
                  { text: 'Vote No', callback_data: `vote_${result.proposalId}_0` },
                  { text: 'Abstain', callback_data: `vote_${result.proposalId}_2` }
                ]
              ]
            };
            
            this.bot.sendMessage(
              this.communityGroupId,
              `📢 New Proposal by @${msg.from.username || 'a DAO member'}\n\n*${title}*\n\n${description.substring(0, 200)}${description.length > 200 ? '...' : ''}\n\nClick a button below to vote (you'll be redirected to a private chat with the bot):`,
              { 
                parse_mode: 'Markdown',
                reply_markup: inlineKeyboard
              }
            );
          }
          
          // Notify user
          this.bot.sendMessage(
            chatId,
            `Your proposal has been created successfully! 🎉\n\nProposal ID: \`${result.proposalId}\`\nTransaction: \`${result.txHash}\`\n\nYou've earned tokens as a reward for your contribution!\n\nYour proposal has been announced in the community group. Members can now vote on it.`,
            { parse_mode: 'Markdown' }
          );
          
        } catch (error) {
          console.error('Error creating proposal:', error);
          this.bot.sendMessage(chatId, `Error creating proposal: ${error.message}`);
        }
      });
      
    } catch (error) {
      console.error('Error in handleCreateProposal:', error);
      this.bot.sendMessage(chatId, `Something went wrong: ${error.message}`);
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
      
      // Get user's wallet address and token balance
      const address = await this.wallets.getWalletAddress(userId);
      const balance = await this.blockchain.getTokenBalance(address);
      
      // Get blockchain explorer URL based on network
      const explorerUrl = `https://blockscout.com/eth/mainnet/address/${address}`; // Example - should be configured by network
      
      this.bot.sendMessage(
        chatId,
        `Your DAO Token Balance: *${balance} tokens*\n\nWallet Address: \`${address}\`\n\n[View on Blockchain Explorer](${explorerUrl})`,
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
    
    // Only process in private chat
    if (msg.chat.type !== 'private') {
      return this.bot.sendMessage(chatId, 'Please talk to me directly for help with DAO functions.');
    }
    
    const helpTopics = {
      inline_keyboard: [
        [
          { text: 'What is a DAO?', callback_data: 'help_dao' },
          { text: 'How to Vote', callback_data: 'help_voting' }
        ],
        [
          { text: 'Creating Proposals', callback_data: 'help_proposals' },
          { text: 'Tokens & Rewards', callback_data: 'help_tokens' }
        ],
        [
          { text: 'PIN Security', callback_data: 'help_security' }
        ]
      ]
    };
    
    this.bot.sendMessage(
      chatId,
      'What would you like to learn more about? Choose a topic below:',
      { reply_markup: helpTopics }
    );
  }
  
  /**
   * Handle callback queries from inline keyboards
   * @param {Object} callbackQuery - Telegram callback query
   */
  async handleCallbackQuery(callbackQuery) {
    const data = callbackQuery.data;
    const userId = callbackQuery.from.id;
    const chatId = callbackQuery.message.chat.id;
    
    console.log(`Received callback query: ${data} from user ${userId}`);
    
    // Acknowledge the callback query
    this.bot.answerCallbackQuery(callbackQuery.id);
    
    if (data.startsWith('vote_')) {
      // Handle voting callback
      const [action, proposalId, voteType] = data.split('_');
      
      // If this is from a group chat, redirect to private chat
      if (callbackQuery.message.chat.type !== 'private') {
        // Generate deep link to open private chat with specific payload
        const deepLink = `https://t.me/AlfinDAOBot?start=vote_${proposalId}_${voteType}`;
        
        return this.bot.sendMessage(
          callbackQuery.from.id,
          `To vote on this proposal, please continue in our private chat:`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Continue to Vote', url: deepLink }]
              ]
            }
          }
        ).catch(error => {
          // If can't message the user (they haven't started the bot)
          if (error.response && error.response.statusCode === 403) {
            this.bot.sendMessage(
              chatId,
              `@${callbackQuery.from.username}, please start a private chat with me first by clicking here: https://t.me/AlfinDAOBot?start=vote_${proposalId}_${voteType}`,
              { reply_to_message_id: callbackQuery.message.message_id }
            );
          }
        });
      }
      
      await this.handleVoteAction(chatId, userId, proposalId, voteType);
    } else if (data.startsWith('help_')) {
      // Handle help topics
      const topic = data.split('_')[1];
      await this.handleHelpTopic(chatId, topic);
    }
  }
  
  /**
   * Handle voting action
   * @param {string} chatId - Telegram chat ID
   * @param {string} userId - Telegram user ID
   * @param {string} proposalId - ID of the proposal
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
      
      // Get proposal info
      let proposal;
      try {
        proposal = await this.blockchain.getProposalInfo(proposalId);
      } catch (error) {
        console.error('Error getting proposal info:', error);
        return this.bot.sendMessage(
          chatId,
          `Error: Could not retrieve proposal information. The proposal may not exist or has expired.`
        );
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
      
      // Prompt for PIN
      const message = await this.bot.sendMessage(
        chatId,
        `You are voting ${voteTypeDesc} on proposal ${proposalId}.\n\nPlease enter your PIN to confirm your vote:`,
        { reply_markup: { force_reply: true } }
      );
      
      // Setup awaiting vote PIN state
      this.textProcessor.setupAwaitingVotePin(userId, async (pin) => {
        try {
          // Get user's wallet
          const userWallet = await this.wallets.decryptWallet(userId, pin);
          const address = await this.wallets.getWalletAddress(userId);
          
          // Submit vote
          const result = await this.blockchain.castVote(proposalId, userWallet, parseInt(voteType));
          
          // Reward user for voting
          await this.gamification.rewardForVoting(address);
          
          // Notify user
          this.bot.sendMessage(
            chatId,
            `Your vote has been cast successfully! 🗳️\n\nVote: ${voteTypeDesc}\nProposal ID: \`${proposalId}\`\nTransaction: \`${result.txHash}\`\n\nYou've earned tokens as a reward for participating!`,
            { parse_mode: 'Markdown' }
          );
          
          // Update vote counts in group if possible
          if (this.communityGroupId) {
            // This would be more complex in practice - would need to store original message ID
            // For now, just send an update
            this.bot.sendMessage(
              this.communityGroupId,
              `📊 Vote update for proposal ${proposalId}:\nFor: ${proposal.votes.forVotes} tokens\nAgainst: ${proposal.votes.againstVotes} tokens\nAbstain: ${proposal.votes.abstainVotes} tokens`
            );
          }
        } catch (error) {
          console.error('Error casting vote:', error);
          this.bot.sendMessage(chatId, `Error casting vote: ${error.message}`);
        }
      });
      
      // Save message ID to delete it later (for security)
      const state = this.textProcessor.getConversationState(userId);
      state.messageToDelete = message.message_id;
      this.textProcessor.setConversationState(userId, state);
      
    } catch (error) {
      console.error('Error in handleVoteAction:', error);
      this.bot.sendMessage(chatId, `Something went wrong: ${error.message}`);
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
      
      // Fallback help messages
      const fallbackHelp = {
        'dao': 'A DAO (Decentralized Autonomous Organization) is a community-governed entity where decisions are made collectively by members who hold voting tokens.',
        'voting': 'To vote on proposals, click the vote buttons on proposal announcements in the community group. You\'ll use your PIN to sign the vote transaction.',
        'proposals': 'Use /proposal to create a new governance proposal. You\'ll need tokens to create proposals, and community members can vote on them.',
        'tokens': 'Tokens represent your voting power in the DAO. You earn tokens by participating - voting on proposals and creating proposals that get approved.',
        'security': 'Your PIN is used to secure your wallet. Never share it with anyone. It\'s used to sign transactions without exposing your private key.'
      };
      
      this.bot.sendMessage(
        chatId,
        fallbackHelp[topic] || 'Sorry, I couldn\'t generate help content for that topic right now.'
      );
    }
  }
}

module.exports = CommandHandler;
