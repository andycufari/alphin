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
    // Set up main menu commands - focusing on core implemented features
    this.bot.setMyCommands([
      { command: 'start', description: '🚀 Start interacting with the DAO' },
      { command: 'join', description: '🔑 Join the DAO' },
      { command: 'balance', description: '💰 Check your token balance' },
      { command: 'help', description: '❓ Get help' }
    ]);
    
    // Command handlers
    this.bot.onText(/\/start/, this.handleStart.bind(this));
    this.bot.onText(/\/join/, this.handleJoinDAO.bind(this));
    this.bot.onText(/\/proposal/, this.handleCreateProposal.bind(this));
    this.bot.onText(/\/balance/, this.handleCheckBalance.bind(this));
    this.bot.onText(/\/help/, this.handleHelp.bind(this));
    this.bot.onText(/\/whatisdao/, this.handleWhatIsDAO.bind(this));
    
    // Handle button callbacks
    this.bot.on('callback_query', this.handleCallbackQuery.bind(this));
  }
  
  /**
   * Handle /start command
   * @param {Object} msg - Telegram message object
   */
  async handleStart(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Determine if this is a deep link with parameters
    const match = msg.text.match(/\/start vote_(.+)_(.+)/);
    if (match) {
      const proposalId = match[1];
      const voteType = match[2];
      return this.handleVoteAction(chatId, userId, proposalId, voteType);
    }
    
    // Check if user is already a DAO member
    const isMember = await this.wallets.hasWallet(userId);
    
    let welcomeMessage = `Welcome to Alphin, your DAO assistant! 🚀\n\n`;
    let keyboard;
    
    if (isMember) {
      // Message for existing members
      welcomeMessage += `What would you like to do today?\n\n• 📝 Create new proposals\n• 💰 Check your token balance\n• ❓ Get help with DAO functions`;
      
      keyboard = {
        reply_markup: {
          keyboard: [
            [{ text: '📝 Create Proposal' }, { text: '💰 Check Balance' }],
            [{ text: '❓ Help' }, { text: '🏁 Back to Start' }]
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
    
    // Send welcome message with appropriate menu options
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
            const username = msg.from.username 
              ? `@${msg.from.username}` 
              : msg.from.first_name 
                ? `${msg.from.first_name}${msg.from.last_name ? ' ' + msg.from.last_name : ''}` 
                : 'A new member';
                
            this.bot.sendMessage(
              this.communityGroupId,
              `🎉 Welcome to Alphin DAO! ${username} has just joined our community.\n\nThey received ${welcomeTokens} governance tokens and can now participate in proposals and voting.\n\nLet's give them a warm welcome! 👋`
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
              `📢 *New Governance Proposal*\n\nSubmitted by: ${msg.from.username ? `@${msg.from.username}` : 'a DAO member'}\n\n*${title}*\n\n${description.substring(0, 200)}${description.length > 200 ? '...' : ''}\n\n🗳️ *Voting is now open!* Your vote matters in shaping the future of Alphin DAO.\n\nSelect an option below to cast your vote:`,
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

Ready to join? Just tap the "🔑 Join DAO" button to get started and receive your first tokens!
`;

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
        const deepLink = `https://t.me/AlphinDAO_bot?start=vote_${proposalId}_${voteType}`;
        
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
              `@${callbackQuery.from.username}, please start a private chat with me first by clicking here: https://t.me/AlphinDAO_bot?start=vote_${proposalId}_${voteType}`,
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
            const username = msg.from.username 
              ? `@${msg.from.username}` 
              : msg.from.first_name 
                ? `${msg.from.first_name}${msg.from.last_name ? ' ' + msg.from.last_name : ''}` 
                : 'A member';
                
            const voteIcon = voteType === '1' ? '✅' : voteType === '0' ? '❌' : '⚪';
            
            this.bot.sendMessage(
              this.communityGroupId,
              `🗳️ *Vote Cast on Proposal #${proposalId.substring(0, 8)}*\n\n${username} voted ${voteIcon} *${voteTypeDesc}*\n\n*Current Results:*\n✅ For: ${proposal.votes.forVotes} tokens\n❌ Against: ${proposal.votes.againstVotes} tokens\n⚪ Abstain: ${proposal.votes.abstainVotes} tokens\n\nEvery vote counts in our community!`,
              { parse_mode: 'Markdown' }
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
}

module.exports = CommandHandler;
