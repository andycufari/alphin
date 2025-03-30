require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const logger = require('./utils/logger');


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
let BOT_USERNAME = 'Default'; // Default fallback

// Get bot info at startup to verify username
bot.getMe().then(botInfo => {
  console.log(`[INFO] Bot started successfully: @${botInfo.username}`);
  console.log(`[INFO] Bot name: ${botInfo.first_name}`);
  BOT_USERNAME = botInfo.username; // Set the actual username
  
  if (botInfo.username !== process.env.BOT_USERNAME) {
    console.log(`[WARNING] Bot username is @${botInfo.username}, but was expecting @${process.env.BOT_USERNAME}. Updated to use actual username.`);
  }
});

//EXPERIMENTO PARA VER SI LOS WEBHOOK ESTAN ANDANDO MAL. BORRAR SI HACE FALTA
// Add this to your startup code to clear any existing webhook
async function startBot() {
  try {
    // Clear any existing webhook
    await bot.deleteWebHook();
    logger.info('Bot', 'Deleted existing webhook');
    
    // Start polling
    bot.startPolling();
    logger.info('Bot', 'Started polling');
  } catch (error) {
    logger.error('Bot', 'Error starting bot', error);
  }
}

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
  databaseService: databaseService // Asegúrate de pasar databaseService aquí
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

// Add connection status logging
bot.on('polling_error', (error) => {
  logger.error('Bot', 'Polling error occurred', error);
});

// Add a health check method
bot.getConnectionStatus = async () => {
  try {
    const me = await bot.getMe();
    logger.info('Bot', 'Connection check successful', { username: me.username });
    return { connected: true, botInfo: me };
  } catch (error) {
    logger.error('Bot', 'Connection check failed', error);
    return { connected: false, error: error.message };
  }
};



// Process direct messages in private chat
bot.on('message', async (msg) => {
  try {
    logger.trace('Bot', 'Received message', { 
      messageId: msg.message_id,
      chatId: msg.chat.id,
      from: msg.from ? msg.from.id : 'unknown',
      text: msg.text ? (msg.text.substring(0, 50) + (msg.text.length > 50 ? '...' : '')) : 'no text'
    });
    
    // Check if it's a private chat
    if (msg.chat.type === 'private') {
      logger.debug('Bot', 'Processing private message', { chatId: msg.chat.id });
      
      // Verify textProcessor is available
      if (!textProcessor) {
        logger.error('Bot', 'textProcessor is not initialized', { chatId: msg.chat.id });
        await bot.sendMessage(msg.chat.id, 'Sorry, the bot is not fully initialized yet. Please try again in a moment.');
        return;
      }
      
      // Process the message
      await textProcessor.processMessage(msg, bot);
      logger.debug('Bot', 'Message processed successfully', { chatId: msg.chat.id });
    } else if (msg.text && msg.text.includes('@' + BOT_USERNAME)) {
      // Handle mentions in group chats
      logger.debug('Bot', 'Processing group mention', { 
        chatId: msg.chat.id,
        text: msg.text.substring(0, 50) + (msg.text.length > 50 ? '...' : '')
      });
      
      if (!textProcessor) {
        logger.error('Bot', 'textProcessor is not initialized for group mention', { chatId: msg.chat.id });
        return;
      }
      
      await textProcessor.processGroupMention(msg, bot);
    }
  } catch (error) {
    logger.error('Bot', 'Error processing message', {
      error: error.message,
      stack: error.stack,
      messageId: msg.message_id,
      chatId: msg.chat.id
    });
    
    try {
      // Attempt to notify the user of the error
      await bot.sendMessage(msg.chat.id, 'Sorry, there was an error processing your message. Please try again later.');
    } catch (sendError) {
      logger.error('Bot', 'Failed to send error message', { error: sendError.message });
    }
  }
});

// Handle deep links (for vote redirections)
bot.onText(/\/start vote_(.+)_(.+)/, (msg, match) => {
  try {
    const proposalId = match[1];
    const voteType = match[2];
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    
    logger.debug('Bot', 'Processing vote deep link', { 
      proposalId, 
      voteType, 
      userId, 
      chatId 
    });
    
    if (msg.chat.type === 'private') {
      if (!commandHandler) {
        logger.error('Bot', 'commandHandler is not initialized for vote action', { chatId });
        bot.sendMessage(chatId, 'Sorry, the bot is not fully initialized yet. Please try again in a moment.');
        return;
      }
      
      commandHandler.handleVoteAction(chatId, userId, proposalId, voteType);
    }
  } catch (error) {
    logger.error('Bot', 'Error processing vote deep link', {
      error: error.message,
      stack: error.stack,
      chatId: msg.chat.id
    });
  }
});

// Start proposal monitoring
const monitoringInterval = process.env.PROPOSAL_MONITOR_INTERVAL || 300000; // 5 minutes default
proposalMonitor.startMonitoring(parseInt(monitoringInterval));

// Call startBot to ensure webhook is cleared and polling is started
startBot().then(() => {
  // Log startup with version info
  console.log(`Alphin DAO Bot v${process.env.npm_package_version || '1.0.0'} is running...`);
  console.log(`Connected to blockchain network: ${process.env.BLOCKCHAIN_NETWORK || 'Unknown'}`);
  console.log(`Proposal monitoring started with interval: ${monitoringInterval}ms`);
}).catch(error => {
  logger.error('Bot', 'Failed to start bot properly', error);
});

// Add a diagnostic command
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  logger.info('Bot', 'Status command received', { chatId });
  
  try {
    const status = await bot.getConnectionStatus();
    bot.sendMessage(chatId, 
      `Bot Status: ${status.connected ? '✅ Connected' : '❌ Disconnected'}\n` +
      `Bot Username: ${status.connected ? status.botInfo.username : 'Unknown'}\n` +
      `Time: ${new Date().toISOString()}`
    );
  } catch (error) {
    logger.error('Bot', 'Error sending status message', error);
    bot.sendMessage(chatId, 'Error checking bot status');
  }
});

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
