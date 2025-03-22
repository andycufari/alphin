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
const helpers = require('./utils/helpers');

// Initialize the bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

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
    last_updated INTEGER NOT NULL
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
const gamificationService = new GamificationService(blockchainManager);

// Initialize command handler
const commandHandler = new CommandHandler(
  bot, 
  blockchainManager, 
  walletManager, 
  aiService,
  textProcessor,
  gamificationService,
  process.env.COMMUNITY_GROUP_ID
);

// Handle direct messages that aren't commands
bot.on('message', (msg) => {
  // Skip command messages
  if (msg.text && msg.text.startsWith('/')) return;
  
  // Handle group mentions
  if (msg.chat.type !== 'private' && msg.text && (
    msg.text.includes('@AlfinDAOBot') || 
    (msg.reply_to_message && msg.reply_to_message.from.username === 'AlfinDAOBot')
  )) {
    textProcessor.processGroupMention(msg, bot);
    return;
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

// Log startup with version info
console.log(`Alfin DAO Bot v${process.env.npm_package_version || '1.0.0'} is running...`);
console.log(`Connected to blockchain network: ${process.env.BLOCKCHAIN_NETWORK || 'Unknown'}`);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Closing database connection...');
  db.close();
  console.log('Stopping bot...');
  bot.stopPolling();
  process.exit(0);
});
