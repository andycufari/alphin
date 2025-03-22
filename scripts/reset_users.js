#!/usr/bin/env node

/**
 * Reset Users Script
 * 
 * This script deletes all users from the database for testing purposes.
 * It also resets the proposal cache for a clean start.
 * 
 * IMPORTANT: This script does NOT delete wallet files for security reasons.
 * You must manually delete those files from the wallets directory.
 */

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Database path - same as used in the main application
const DB_PATH = process.env.DB_PATH || './dao_bot.sqlite';

// Get absolute path if relative
const dbPath = path.isAbsolute(DB_PATH) 
  ? DB_PATH 
  : path.join(process.cwd(), DB_PATH);

// Check if database exists
if (!fs.existsSync(dbPath)) {
  console.error(`Database file doesn't exist at: ${dbPath}`);
  console.log('No action needed - starting fresh!');
  process.exit(0);
}

console.log(`
🧹 ALPHIN DAO USER RESET 🧹
============================
This will delete ALL users from the database.
Wallet files in the wallets directory will NOT be deleted.
`);

// Open the database connection
const db = new sqlite3.Database(dbPath);

// Function to reset the users table
function resetUsers() {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM users', function(err) {
      if (err) {
        reject(err);
        return;
      }
      console.log(`✅ Removed ${this.changes} users from the database`);
      resolve(this.changes);
    });
  });
}

// Function to reset the proposal cache table
function resetProposalCache() {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM proposal_cache', function(err) {
      if (err) {
        reject(err);
        return;
      }
      console.log(`✅ Cleared ${this.changes} entries from proposal cache`);
      resolve(this.changes);
    });
  });
}

// Function to list the wallet directory
function listWalletDirectory() {
  const walletDir = process.env.WALLET_DIRECTORY || './wallets';
  
  // Get absolute path if relative
  const walletPath = path.isAbsolute(walletDir) 
    ? walletDir 
    : path.join(process.cwd(), walletDir);
  
  if (!fs.existsSync(walletPath)) {
    console.log(`Wallet directory doesn't exist at: ${walletPath}`);
    return;
  }
  
  const files = fs.readdirSync(walletPath);
  const walletFiles = files.filter(file => file.endsWith('.json'));
  
  if (walletFiles.length > 0) {
    console.log('\n⚠️ IMPORTANT: Please manually delete the following wallet files:');
    console.log('(For security reasons, this script does not delete wallet files)');
    console.log('\nWallet files found:');
    walletFiles.forEach(file => {
      console.log(`  - ${file}`);
    });
    console.log(`\nYou can delete them with: rm ${walletDir}/*.json`);
  } else {
    console.log('\nNo wallet files found in the wallet directory.');
  }
}

// Main function
async function main() {
  try {
    await resetUsers();
    await resetProposalCache();
    
    // Provide instructions for wallet cleanup
    listWalletDirectory();
    
    console.log('\n✨ Reset complete! Database is now clean for testing.');
    console.log('You can now restart the bot and test with fresh users.');
  } catch (error) {
    console.error('Error resetting database:', error);
  } finally {
    // Close the database connection
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      }
      console.log('Database connection closed.');
    });
  }
}

// Run the script
main(); 