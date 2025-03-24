require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// Import modules
const AIService = require('./modules/ai/aiService');
const BlockchainManager = require('./modules/blockchain/blockchainManager');
const WalletManager = require('./modules/wallets/walletManager');
const CommandHandler = require('./modules/commands/commandHandler');
const TextProcessor = require('./modules/text/textProcessor');
const GamificationService = require('./modules/gamification/gamificationService');
const DatabaseService = require('./modules/database/databaseService');
const ProposalMonitor = require('./modules/blockchain/proposalMonitor');
const helpers = require('./utils/helpers');
const BlockchainService = require('./modules/blockchain/blockchainService');

// Initialize the bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Store the bot username globally for use in handlers
let BOT_USERNAME = 'AlphinDAO_bot'; // Default fallback

// Get bot info at startup to verify username
bot.getMe().then(botInfo => {
  console.log(`[INFO] Bot started successfully: @${botInfo.username}`);
  console.log(`[INFO] Bot name: ${botInfo.first_name}`);
  BOT_USERNAME = botInfo.username; // Set the actual username
  
  if (botInfo.username !== 'AlphinDAO_bot') {
    console.log(`[WARNING] Bot username is @${botInfo.username}, but was expecting @AlphinDAO_bot. Updated to use actual username.`);
  }
});

// Initialize database
const db = new sqlite3.Database('./dao_bot.sqlite');
db.serialize(() => {
  // Create users table if it doesn't exist
  db.run(`CREATE TABLE IF NOT EXISTS users (
    telegram_id TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    join_date INTEGER NOT NULL
  )`);

  // Create proposal cache table
  db.run(`CREATE TABLE IF NOT EXISTS proposal_cache (
    proposal_id TEXT PRIMARY KEY,
    title TEXT,
    description TEXT,
    proposer TEXT,
    state TEXT,
    start_block INTEGER,
    end_block INTEGER,
    for_votes TEXT,
    against_votes TEXT,
    abstain_votes TEXT,
    last_updated INTEGER NOT NULL,
    is_executed INTEGER DEFAULT 0
  )`);
  
  // Create user votes tracking table
  db.run(`CREATE TABLE IF NOT EXISTS user_votes (
    telegram_id TEXT,
    proposal_id TEXT,
    vote_type INTEGER, /* 0=against, 1=for, 2=abstain */
    vote_timestamp INTEGER NOT NULL,
    tx_hash TEXT,
    PRIMARY KEY (telegram_id, proposal_id)
  )`);
});

// Ensure wallet directory exists
const walletDir = process.env.WALLET_DIRECTORY || './wallets';
if (!fs.existsSync(walletDir)) {
  fs.mkdirSync(walletDir, { recursive: true });
  console.log(`Created wallet directory at ${walletDir}`);
}

// Initialize services
const aiService = new AIService(process.env.OPENAI_API_KEY);
const blockchainManager = new BlockchainManager({
  rpcUrl: process.env.BLOCKCHAIN_RPC_URL,
  tokenAddress: process.env.TOKEN_ADDRESS,
  governorAddress: process.env.GOVERNOR_ADDRESS,
  adminPrivateKey: process.env.ADMIN_PRIVATE_KEY
});
const walletManager = new WalletManager();
const textProcessor = new TextProcessor(aiService);
const databaseService = new DatabaseService('./dao_bot.sqlite');
const gamificationService = new GamificationService(blockchainManager);
const proposalMonitor = new ProposalMonitor(
  blockchainManager,
  databaseService,
  bot,
  process.env.COMMUNITY_GROUP_ID
);
const blockchainService = new BlockchainService({
  rpcUrl: process.env.BLOCKCHAIN_RPC_URL,
  tokenAddress: process.env.TOKEN_ADDRESS,
  governorAddress: process.env.GOVERNOR_ADDRESS,
  adminPrivateKey: process.env.ADMIN_PRIVATE_KEY,
  databaseService: databaseService // Make sure to pass databaseService here
});

// Initialize command handler
const commandHandler = new CommandHandler(
  bot, 
  blockchainManager, 
  walletManager, 
  aiService,
  textProcessor,
  gamificationService,
  databaseService,
  process.env.COMMUNITY_GROUP_ID
);

// Handle direct messages that aren't commands
bot.on('message', (msg) => {
  // Skip command messages
  if (msg.text && msg.text.startsWith('/')) return;
  
  // Add debug logging for all messages
  console.log(`[DEBUG] Received message in chat type: ${msg.chat.type}`);
  console.log(`[DEBUG] Chat ID: ${msg.chat.id}`);
  if (msg.text) console.log(`[DEBUG] Message text: "${msg.text}"`);
  if (msg.from) console.log(`[DEBUG] From user: ${msg.from.id} (${msg.from.username || 'no username'})`);
  
  // Handle button text messages in private chats
  if (msg.chat.type === 'private' && msg.text) {
    const text = msg.text.trim();
    
    // Handle button menu options
    if (text === '🔑 Join DAO') {
      return commandHandler.handleJoinDAO(msg);
    } else if (text === '📝 Create Proposal') {
      return commandHandler.handleCreateProposal(msg);
    } else if (text === '💰 Check Balance') {
      return commandHandler.handleCheckBalance(msg);
    } else if (text === '❓ Help') {
      return commandHandler.handleHelp(msg);
    } else if (text === '❓ What is a DAO?') {
      return commandHandler.handleWhatIsDAO(msg);
    } else if (text === '🏁 Back to Start') {
      return commandHandler.handleStart(msg);
    }
  }
  
  // Handle group mentions
  if (msg.chat.type !== 'private' && msg.text) {
    console.log(`[DEBUG] Processing group message: "${msg.text}"`);
    console.log(`[DEBUG] Bot username check: includes @${BOT_USERNAME} = ${msg.text.includes('@' + BOT_USERNAME)}`);
    
    if (msg.reply_to_message) {
      console.log(`[DEBUG] This is a reply message. Reply to username: ${msg.reply_to_message.from?.username || 'undefined'}`);
    }
    
    if (
      msg.text.includes('@' + BOT_USERNAME) || 
      msg.text.toLowerCase().includes('@' + BOT_USERNAME.toLowerCase()) ||
      (msg.reply_to_message && msg.reply_to_message.from?.username === BOT_USERNAME)
    ) {
      console.log('[DEBUG] Group mention condition matched, forwarding to processGroupMention');
      textProcessor.processGroupMention(msg, bot);
      return;
    } else {
      console.log('[DEBUG] Message in group but NOT matched as mention');
      if (msg.text.includes('@')) {
        console.log(`[DEBUG] Contains @ symbol: ${msg.text}`);
        // Log all @ mentions in the message to check for case sensitivity issues
        const mentions = msg.text.match(/@\w+/g);
        if (mentions) {
          console.log(`[DEBUG] All mentions in message: ${JSON.stringify(mentions)}`);
        }
      }
    }
  }
  
  // Process direct messages in private chat
  if (msg.chat.type === 'private') {
    textProcessor.processMessage(msg, bot);
  }
});

// Handle deep links (for vote redirections)
bot.onText(/\/start vote_(.+)_(.+)/, (msg, match) => {
  const proposalId = match[1];
  const voteType = match[2];
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  
  if (msg.chat.type === 'private') {
    commandHandler.handleVoteAction(chatId, userId, proposalId, voteType);
  }
});

// Start proposal monitoring
const monitoringInterval = process.env.PROPOSAL_MONITOR_INTERVAL || 300000; // 5 minutes default
proposalMonitor.startMonitoring(parseInt(monitoringInterval));

// Log startup with version info
console.log(`Alphin DAO Bot v${process.env.npm_package_version || '1.0.0'} is running...`);
console.log(`Connected to blockchain network: ${process.env.BLOCKCHAIN_NETWORK || 'Unknown'}`);
console.log(`Proposal monitoring started with interval: ${monitoringInterval}ms`);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Stopping proposal monitor...');
  proposalMonitor.stopMonitoring();
  console.log('Closing database connection...');
  db.close();
  console.log('Stopping bot...');
  bot.stopPolling();
  process.exit(0);
});
