const sqlite3 = require('sqlite3').verbose();

/**
 * Service for interacting with the database
 */
class DatabaseService {
  /**
   * Initialize database service
   * @param {string} dbPath - Path to database file
   */
  constructor(dbPath = './dao_bot.sqlite') {
    this.db = new sqlite3.Database(dbPath);
    this.initializeDatabase();
  }
  
  /**
   * Initialize and migrate database tables if needed
   */
  initializeDatabase() {
    this.db.serialize(() => {
      // Check if proposal_cache table has all required columns
      this.db.get("PRAGMA table_info(proposal_cache)", (err, row) => {
        if (err) {
          console.error('Error checking proposal_cache table:', err);
          return;
        }
        
        // Add any missing columns to the proposal_cache table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS proposal_cache (
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
          )
        `);
        
        // Ensure title column exists
        this.db.run("ALTER TABLE proposal_cache ADD COLUMN title TEXT", err => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding title column:', err);
          }
        });
        
        // Ensure state column exists
        this.db.run("ALTER TABLE proposal_cache ADD COLUMN state TEXT", err => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding state column:', err);
          }
        });
        
        // Add other potentially missing columns
        const additionalColumns = [
          "description TEXT",
          "proposer TEXT",
          "start_block INTEGER",
          "end_block INTEGER", 
          "for_votes TEXT",
          "against_votes TEXT", 
          "abstain_votes TEXT",
          "is_executed INTEGER DEFAULT 0"
        ];
        
        additionalColumns.forEach(colDef => {
          const colName = colDef.split(' ')[0];
          this.db.run(`ALTER TABLE proposal_cache ADD COLUMN ${colDef}`, err => {
            if (err && !err.message.includes('duplicate column')) {
              console.error(`Error adding ${colName} column:`, err);
            }
          });
        });
        
        // After updating schema, repair any existing proposal entries
        this.repairExistingProposals();
      });
    });
  }
  
  /**
   * Repair existing proposals by ensuring all required fields are populated
   * with default values if missing
   */
  repairExistingProposals() {
    this.db.all('SELECT proposal_id FROM proposal_cache', (err, rows) => {
      if (err) {
        console.error('Error getting proposals to repair:', err);
        return;
      }
      
      if (!rows || rows.length === 0) {
        console.log('No existing proposals to repair');
        return;
      }
      
      console.log(`Repairing ${rows.length} existing proposals...`);
      
      rows.forEach(row => {
        const proposalId = row.proposal_id;
        
        // Update each proposal with default values for any null fields
        this.db.run(`
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
          if (err) {
            console.error(`Error repairing proposal ${proposalId}:`, err);
          } else {
            console.log(`Repaired proposal ${proposalId}`);
          }
        });
      });
    });
  }
  
  /**
   * Track a user's vote on a proposal
   * @param {string} telegramId - User's Telegram ID
   * @param {string} proposalId - Proposal ID
   * @param {number} voteType - Vote type (0=against, 1=for, 2=abstain)
   * @param {string} txHash - Transaction hash
   * @returns {Promise<boolean>} - Success status
   */
  async trackUserVote(telegramId, proposalId, voteType, txHash) {
    if (!telegramId || !proposalId) {
      console.warn('Missing telegramId or proposalId in trackUserVote');
      return false;
    }
    
    return new Promise((resolve, reject) => {
      const timestamp = Math.floor(Date.now() / 1000);
      
      this.db.run(
        `INSERT OR REPLACE INTO user_votes 
        (telegram_id, proposal_id, vote_type, vote_timestamp, tx_hash) 
        VALUES (?, ?, ?, ?, ?)`,
        [telegramId, proposalId, voteType, timestamp, txHash],
        (err) => {
          if (err) {
            console.error('Error tracking user vote:', err);
            reject(err);
          } else {
            resolve(true);
          }
        }
      );
    });
  }
  
  /**
   * Check if a user has voted on a proposal
   * @param {string} telegramId - User's Telegram ID
   * @param {string} proposalId - Proposal ID
   * @returns {Promise<Object|null>} - Vote data or null if not voted
   */
  async hasUserVotedOnProposal(telegramId, proposalId) {
    if (!telegramId || !proposalId) {
      return null; // Return null if either parameter is missing
    }
    
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM user_votes WHERE telegram_id = ? AND proposal_id = ?',
        [telegramId, proposalId],
        (err, row) => {
          if (err) {
            console.error('Error checking if user voted:', err);
            reject(err);
          } else {
            resolve(row || null);
          }
        }
      );
    });
  }
  
  /**
   * Get all proposals a user has voted on
   * @param {string} telegramId - User's Telegram ID
   * @returns {Promise<Array>} - Array of proposals the user has voted on
   */
  async getUserVotedProposals(telegramId) {
    if (!telegramId) {
      return []; // Return empty array if no telegramId is provided
    }
    
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT proposal_id, vote_type, vote_timestamp, tx_hash FROM user_votes WHERE telegram_id = ?',
        [telegramId],
        (err, rows) => {
          if (err) {
            console.error('Error getting user voted proposals:', err);
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  }
  
  /**
   * Update or insert a proposal in the cache
   * @param {Object} proposal - Proposal data
   * @returns {Promise<boolean>} - Success status
   */
  async updateProposalCache(proposal) {
    if (!proposal || !proposal.id) {
      console.warn('Cannot update proposal cache: Invalid proposal data');
      return false;
    }
    
    return new Promise((resolve, reject) => {
      const timestamp = Math.floor(Date.now() / 1000);
      
      // Safely extract values with defaults
      const id = proposal.id;
      const title = String(proposal.title || '');
      const description = String(proposal.description || '');
      const proposer = String(proposal.proposer || '');
      const state = String(proposal.state || '');
      const startBlock = proposal.startBlock || 0;
      const endBlock = proposal.endBlock || 0;
      const forVotes = String(proposal.votes?.forVotes || '0');
      const againstVotes = String(proposal.votes?.againstVotes || '0');
      const abstainVotes = String(proposal.votes?.abstainVotes || '0');
      const isExecuted = proposal.state === 'Executed' ? 1 : 0;
      
      this.db.run(
        `INSERT OR REPLACE INTO proposal_cache 
        (proposal_id, title, description, proposer, state, start_block, end_block, 
         for_votes, against_votes, abstain_votes, last_updated, is_executed) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          title, 
          description,
          proposer,
          state,
          startBlock,
          endBlock,
          forVotes,
          againstVotes,
          abstainVotes,
          timestamp,
          isExecuted
        ],
        (err) => {
          if (err) {
            console.error('Error updating proposal cache:', err);
            reject(err);
          } else {
            resolve(true);
          }
        }
      );
    });
  }
  
  /**
   * Get proposal from cache
   * @param {string} proposalId - Proposal ID
   * @returns {Promise<Object|null>} - Cached proposal or null
   */
  async getCachedProposal(proposalId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM proposal_cache WHERE proposal_id = ?',
        [proposalId],
        (err, row) => {
          if (err) {
            console.error('Error getting cached proposal:', err);
            reject(err);
          } else {
            if (row) {
              // Format the data to match the expected structure
              const proposal = {
                id: row.proposal_id,
                title: row.title,
                description: row.description,
                proposer: row.proposer,
                state: row.state,
                startBlock: row.start_block,
                endBlock: row.end_block,
                votes: {
                  forVotes: row.for_votes,
                  againstVotes: row.against_votes,
                  abstainVotes: row.abstain_votes
                },
                isExecuted: row.is_executed === 1
              };
              resolve(proposal);
            } else {
              resolve(null);
            }
          }
        }
      );
    });
  }
  
  /**
   * Check if a proposal status has changed from active to another state
   * @param {string} proposalId - Proposal ID
   * @param {string} newState - New proposal state
   * @returns {Promise<{changed: boolean, oldState: string|null}>} - Whether state changed and old state
   */
  async hasProposalStateChanged(proposalId, newState) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT state FROM proposal_cache WHERE proposal_id = ?',
        [proposalId],
        (err, row) => {
          if (err) {
            console.error('Error checking proposal state change:', err);
            reject(err);
          } else {
            if (row) {
              const oldState = row.state;
              const changed = oldState !== newState;
              resolve({ changed, oldState });
            } else {
              resolve({ changed: true, oldState: null });
            }
          }
        }
      );
    });
  }
  
  /**
   * Get all active proposals from cache
   * @returns {Promise<Array>} - Array of active proposals
   */
  async getActiveProposalsFromCache() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM proposal_cache WHERE state = "Active"',
        [],
        (err, rows) => {
          if (err) {
            console.error('Error getting active proposals from cache:', err);
            reject(err);
          } else {
            const proposals = rows.map(row => ({
              id: row.proposal_id,
              title: row.title,
              description: row.description,
              proposer: row.proposer,
              state: row.state,
              startBlock: row.start_block,
              endBlock: row.end_block,
              votes: {
                forVotes: row.for_votes,
                againstVotes: row.against_votes,
                abstainVotes: row.abstain_votes
              },
              isExecuted: row.is_executed === 1
            }));
            resolve(proposals);
          }
        }
      );
    });
  }
}

module.exports = DatabaseService;
