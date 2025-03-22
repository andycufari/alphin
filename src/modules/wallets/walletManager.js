const ethers = require('ethers');
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

class WalletManager {
  constructor() {
    this.walletDir = process.env.WALLET_DIRECTORY || './wallets';
    this.db = new sqlite3.Database('./dao_bot.sqlite');
    
    if (!fs.existsSync(this.walletDir)) {
      fs.mkdirSync(this.walletDir, { recursive: true });
    }
    
    // Ensure users table exists
    this.db.run(`CREATE TABLE IF NOT EXISTS users (
      telegram_id TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      join_date INTEGER NOT NULL
    )`);
  }
  
  /**
   * Create a new wallet for a Telegram user
   * @param {string} telegramId - Telegram user ID
   * @param {string} pin - PIN for wallet encryption
   * @returns {Promise<string>} - Wallet address
   */
  async createWallet(telegramId, pin) {
    console.log(`Creating wallet for Telegram user ${telegramId}`);
    
    // Check if user already has a wallet
    const existingAddress = await this.getWalletAddress(telegramId);
    if (existingAddress) {
      console.log(`User ${telegramId} already has wallet ${existingAddress}`);
      return existingAddress;
    }
    
    const wallet = ethers.Wallet.createRandom();
    console.log(`Generated new wallet with address ${wallet.address}`);
    
    const encryptedWallet = await this.encryptWallet(wallet, pin);
    
    // Save encrypted wallet file named with Telegram ID
    fs.writeFileSync(
      `${this.walletDir}/${telegramId}.json`,
      JSON.stringify(encryptedWallet)
    );
    
    // Store mapping in SQLite
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO users (telegram_id, wallet_address, join_date) VALUES (?, ?, ?)`,
        [telegramId, wallet.address, Date.now()],
        (err) => {
          if (err) {
            console.error('Error storing wallet in database:', err);
            reject(err);
          } else {
            console.log(`Wallet for ${telegramId} stored in database`);
            resolve(wallet.address);
          }
        }
      );
    });
  }
  
  /**
   * Encrypt a wallet with a PIN
   * @param {ethers.Wallet} wallet - Wallet to encrypt
   * @param {string} pin - PIN for encryption
   * @returns {Object} - Encrypted wallet data
   */
  async encryptWallet(wallet, pin) {
    // Generate a secure key from the PIN
    const key = crypto.scryptSync(pin, 'salt', 32);
    const iv = crypto.randomBytes(16);
    
    // Encrypt the private key
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encryptedPrivateKey = Buffer.concat([
      cipher.update(wallet.privateKey, 'utf8'),
      cipher.final()
    ]);
    
    return {
      address: wallet.address,
      iv: iv.toString('hex'),
      encryptedPrivateKey: encryptedPrivateKey.toString('hex')
    };
  }
  
  /**
   * Decrypt a wallet using a PIN
   * @param {string} telegramId - Telegram user ID
   * @param {string} pin - PIN for decryption
   * @returns {Promise<ethers.Wallet>} - Decrypted wallet
   */
  async decryptWallet(telegramId, pin) {
    console.log(`Decrypting wallet for user ${telegramId}`);
    
    // Read encrypted wallet from file
    const walletPath = `${this.walletDir}/${telegramId}.json`;
    
    if (!fs.existsSync(walletPath)) {
      console.error(`Wallet file not found for user ${telegramId}`);
      throw new Error('Wallet not found. Please join the DAO first.');
    }
    
    const encryptedWallet = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
    
    try {
      // Decrypt the private key
      const key = crypto.scryptSync(pin, 'salt', 32);
      const iv = Buffer.from(encryptedWallet.iv, 'hex');
      const encryptedPrivateKey = Buffer.from(encryptedWallet.encryptedPrivateKey, 'hex');
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      const privateKey = Buffer.concat([
        decipher.update(encryptedPrivateKey),
        decipher.final()
      ]).toString('utf8');
      
      // Create and return wallet instance
      return new ethers.Wallet(privateKey);
    } catch (error) {
      console.error(`Error decrypting wallet for user ${telegramId}:`, error);
      throw new Error('Incorrect PIN. Please try again.');
    }
  }
  
  /**
   * Get wallet address for a Telegram user
   * @param {string} telegramId - Telegram user ID
   * @returns {Promise<string|null>} - Wallet address or null if not found
   */
  async getWalletAddress(telegramId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT wallet_address FROM users WHERE telegram_id = ?`,
        [telegramId],
        (err, row) => {
          if (err) {
            console.error(`Error getting wallet address for user ${telegramId}:`, err);
            reject(err);
          } else {
            resolve(row ? row.wallet_address : null);
          }
        }
      );
    });
  }
  
  /**
   * Check if a user has a wallet
   * @param {string} telegramId - Telegram user ID
   * @returns {Promise<boolean>} - True if user has a wallet
   */
  async hasWallet(telegramId) {
    const address = await this.getWalletAddress(telegramId);
    return address !== null;
  }
  
  /**
   * Get all users with wallets
   * @returns {Promise<Array>} - List of users with wallets
   */
  async getAllUsers() {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT telegram_id, wallet_address, join_date FROM users`,
        (err, rows) => {
          if (err) {
            console.error('Error getting all users:', err);
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }
}

module.exports = WalletManager;