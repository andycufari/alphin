#!/usr/bin/env node

/**
 * Reset Database Script for Alfin DAO Bot
 * 
 * This script completely resets the database by:
 * 1. Dropping all existing tables
 * 2. Recreating the database structure
 * 3. Providing instructions for wallet cleanup
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

console.log(`
🧹 ALFIN DAO DATABASE RESET 🧹
=============================
This will completely reset the database by dropping and recreating all tables.
Wallet files in the wallets directory will NOT be deleted.
`);

// Check if database exists
if (!fs.existsSync(dbPath)) {
  console.error(`Database file doesn't exist at: ${dbPath}`);
  console.log('Creating new database file from scratch...');
}

// Open the database connection
const db = new sqlite3.Database(dbPath);

// Function to get all table names
function getAllTables() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`, (err, tables) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(tables.map(t => t.name));
    });
  });
}

// Function to drop all tables
async function dropAllTables() {
  try {
    const tables = await getAllTables();
    
    if (tables.length === 0) {
      console.log('No tables found in database.');
      return;
    }
    
    console.log(`Found ${tables.length} tables to drop: ${tables.join(', ')}`);
    
    // Enable foreign keys to ensure proper cascade delete
    await new Promise((resolve, reject) => {
      db.run('PRAGMA foreign_keys = OFF;', err => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Drop each table
    for (const table of tables) {
      await new Promise((resolve, reject) => {
        db.run(`DROP TABLE IF EXISTS ${table}`, err => {
          if (err) {
            reject(err);
            return;
          }
          console.log(`✅ Dropped table: ${table}`);
          resolve();
        });
      });
    }
    
    console.log('All tables have been dropped successfully');
  } catch (error) {
    console.error('Error dropping tables:', error);
    throw error;
  }
}

// Function to recreate database structure
function recreateDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      try {
        console.log('Creating new database structure...');
        
        // Create users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
          telegram_id TEXT PRIMARY KEY,
          wallet_address TEXT NOT NULL,
          join_date INTEGER NOT NULL
        )`);
        console.log('✅ Created users table');
        
        // Create proposal_cache table
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
        console.log('✅ Created proposal_cache table');
        
        // Create user_votes table
        db.run(`CREATE TABLE IF NOT EXISTS user_votes (
          telegram_id TEXT,
          proposal_id TEXT,
          vote_type INTEGER,
          vote_timestamp INTEGER NOT NULL,
          tx_hash TEXT,
          PRIMARY KEY (telegram_id, proposal_id)
        )`);
        console.log('✅ Created user_votes table');
        
        resolve();
      } catch (error) {
        reject(error);
      }
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
    // Step 1: Drop all existing tables
    await dropAllTables();
    
    // Step 2: Recreate database structure
    await recreateDatabase();
    
    // Step 3: Provide instructions for wallet cleanup
    listWalletDirectory();
    
    console.log('\n✨ Reset complete! Database has been completely reset.');
    console.log('You can now restart the bot and test with a fresh database.');
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