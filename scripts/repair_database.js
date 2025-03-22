#!/usr/bin/env node

/**
 * Database repair script for Alfin DAO Bot
 * 
 * This script rebuilds and repairs the database structure, 
 * ensuring all required tables and columns exist.
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
🔧 ALFIN DAO DATABASE REPAIR 🔧
==============================
This will check and repair database structure.
`);

// Check if database exists
if (!fs.existsSync(dbPath)) {
  console.error(`Database file doesn't exist at: ${dbPath}`);
  console.log('Creating new database file...');
}

// Open database connection
const db = new sqlite3.Database(dbPath);

// Function to repair database structure
async function repairDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      try {
        console.log('Checking and repairing database tables...');
        
        // Create or update users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
          telegram_id TEXT PRIMARY KEY,
          wallet_address TEXT NOT NULL,
          join_date INTEGER NOT NULL
        )`);
        console.log('- Users table checked');
        
        // Create or update proposal_cache table
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
        console.log('- Proposal cache table checked');
        
        // Create or update user_votes table
        db.run(`CREATE TABLE IF NOT EXISTS user_votes (
          telegram_id TEXT,
          proposal_id TEXT,
          vote_type INTEGER,
          vote_timestamp INTEGER NOT NULL,
          tx_hash TEXT,
          PRIMARY KEY (telegram_id, proposal_id)
        )`);
        console.log('- User votes table checked');
        
        // Add missing columns to proposal_cache
        const proposalCacheColumns = [
          "title TEXT",
          "description TEXT",
          "proposer TEXT",
          "state TEXT",
          "start_block INTEGER",
          "end_block INTEGER",
          "for_votes TEXT",
          "against_votes TEXT",
          "abstain_votes TEXT",
          "is_executed INTEGER DEFAULT 0"
        ];
        
        proposalCacheColumns.forEach(colDef => {
          const colName = colDef.split(' ')[0];
          db.run(`ALTER TABLE proposal_cache ADD COLUMN ${colDef}`, err => {
            if (err) {
              if (!err.message.includes('duplicate column')) {
                console.error(`Error adding ${colName} column:`, err.message);
              }
            } else {
              console.log(`- Added missing column: ${colName}`);
            }
          });
        });
        
        // Repair existing proposals
        console.log('Checking and repairing proposal data...');
        db.all('SELECT proposal_id FROM proposal_cache', (err, rows) => {
          if (err) {
            console.error('Error getting proposals to repair:', err.message);
            return;
          }
          
          if (!rows || rows.length === 0) {
            console.log('No existing proposals to repair');
            return;
          }
          
          console.log(`Found ${rows.length} proposals to check...`);
          
          let completedRepairs = 0;
          
          rows.forEach(row => {
            const proposalId = row.proposal_id;
            
            // Update each proposal with default values for any null fields
            db.run(`
              UPDATE proposal_cache
              SET 
                title = COALESCE(title, 'Proposal ${proposalId.substring(0, 8)}'),
                description = COALESCE(description, ''),
                proposer = COALESCE(proposer, ''),
                state = COALESCE(state, 'Unknown'),
                start_block = COALESCE(start_block, 0),
                end_block = COALESCE(end_block, 0),
                for_votes = COALESCE(for_votes, '0'),
                against_votes = COALESCE(against_votes, '0'),
                abstain_votes = COALESCE(abstain_votes, '0'),
                is_executed = COALESCE(is_executed, 0)
              WHERE proposal_id = ?
            `, [proposalId], err => {
              completedRepairs++;
              
              if (err) {
                console.error(`Error repairing proposal ${proposalId}:`, err.message);
              } else {
                console.log(`- Repaired proposal ${proposalId}`);
              }
              
              if (completedRepairs === rows.length) {
                console.log('All proposals checked and repaired.');
                resolve();
              }
            });
          });
        });
        
      } catch (error) {
        console.error('Error during database repair:', error);
        reject(error);
      }
    });
  });
}

// Execute repair function
repairDatabase()
  .then(() => {
    console.log('\n✅ Database repair completed successfully!');
    db.close();
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Database repair failed:', error);
    db.close();
    process.exit(1);
  }); 