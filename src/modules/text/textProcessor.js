/**
 * Text processor for handling natural language interactions
 */
const logger = require('../../utils/logger');

class TextProcessor {
  /**
   * Create TextProcessor instance
   * @param {Object} aiService - Service for AI-powered responses
   */
  constructor(aiService) {
    this.ai = aiService;
    this.conversationStates = new Map();
    this.botUsername = null; // Will be set when processing messages
    this.proposalCallbacks = {}; // Initialize proposalCallbacks map
    
    // Define states for conversation flows
    this.STATES = {
      NORMAL: 'normal',
      AWAITING_PIN: 'awaiting_pin',
      CREATING_PROPOSAL_TITLE: 'creating_proposal_title',
      CREATING_PROPOSAL_DESCRIPTION: 'creating_proposal_description',
      AWAITING_PROPOSAL_PIN: 'awaiting_proposal_pin',
      AWAITING_VOTE_PIN: 'awaiting_vote_pin'
    };
    
    // Initialize the conversation state manager
    const ConversationStateManager = require('./ConversationStateManager');
    this.stateManager = new ConversationStateManager({
      conversationStates: this.conversationStates,
      STATES: this.STATES
    });
    
    // Initialize the menu handler
    const MenuHandler = require('./MenuHandler');
    this.menuHandler = new MenuHandler();
    
    logger.info('TextProcessor', 'Initialized text processor');
  }
  
  /**
   * Process a message from a user
   * @param {Object} msg - Telegram message object
   * @param {Object} bot - Telegram bot instance
   */
  async processMessage(msg, bot) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const messageText = msg.text || '';
    
    logger.info('TextProcessor', `Processing message from user ${userId}`, { 
      chatId, 
      messageText: messageText.substring(0, 50) + (messageText.length > 50 ? '...' : '')
    });
    
    // Validate inputs
    if (!bot) {
      logger.error('TextProcessor', 'Bot instance is missing');
      return;
    }
    
    if (!messageText) {
      logger.debug('TextProcessor', 'Empty message text, skipping processing');
      return;
    }
    
    // Handle menu button actions
    try {
      if (this.menuHandler.processMenuButton(msg, bot)) {
        logger.debug('TextProcessor', 'Menu button processed', { button: messageText });
        return; // Menu button was processed, exit early
      }
    } catch (menuError) {
      logger.error('TextProcessor', 'Error processing menu button', menuError);
    }
    
    // Get current state for this user
    const state = this.stateManager.getState(userId);
    logger.debug('TextProcessor', `User state: ${state.state}`, { userId, stateData: state.data });
    
    // Process based on conversation state
    try {
      if (state.state === this.STATES.AWAITING_PIN) {
        logger.debug('TextProcessor', 'Handling PIN input');
        return this.handlePinInput(userId, chatId, messageText, bot);
      }
      
      if (state.state === this.STATES.CREATING_PROPOSAL_TITLE) {
        logger.debug('TextProcessor', 'Handling proposal title input');
        return this.handleProposalTitleInput(userId, chatId, messageText, bot);
      }
      
      if (state.state === this.STATES.CREATING_PROPOSAL_DESCRIPTION) {
        logger.debug('TextProcessor', 'Handling proposal description input');
        return this.handleProposalDescriptionInput(userId, chatId, messageText, bot);
      }
      
      if (state.state === this.STATES.AWAITING_PROPOSAL_PIN) {
        logger.debug('TextProcessor', 'Handling proposal PIN input');
        return this.handleProposalPinInput(userId, chatId, messageText, bot);
      }
      
      if (state.state === this.STATES.AWAITING_VOTE_PIN) {
        logger.debug('TextProcessor', 'Handling vote PIN input');
        return this.handleVotePinInput(userId, chatId, messageText, bot);
      }
      
      // Default: process with AI
      logger.debug('TextProcessor', 'Processing with AI service');
      try {
        const response = await this.ai.processMessage(messageText);
        logger.debug('TextProcessor', 'AI response received', { 
          responseLength: response ? response.length : 0 
        });
        
        await bot.sendMessage(chatId, response);
        logger.debug('TextProcessor', 'Response sent successfully');
      } catch (aiError) {
        logger.error('TextProcessor', 'Error processing message with AI', aiError);
        await bot.sendMessage(chatId, 'Sorry, I\'m having trouble processing your message right now. Please try again with Alphin DAO assistant later.');
      }
    } catch (stateError) {
      logger.error('TextProcessor', 'Error processing message state', stateError);
      try {
        await bot.sendMessage(chatId, 'Sorry, something went wrong while processing your message. Please try again.');
      } catch (sendError) {
        logger.error('TextProcessor', 'Failed to send error message', sendError);
      }
    }
  }
  
  /**
   * Process a mention in a group chat
   * @param {Object} msg - Telegram message object
   * @param {Object} bot - Telegram bot instance
   */
  async processGroupMention(msg, bot) {
    const chatId = msg.chat.id;
    let messageText = msg.text || '';
    
    // Get bot info if we don't have it yet
    if (!this.botUsername) {
      try {
        const botInfo = await bot.getMe();
        this.botUsername = botInfo.username;
        console.log(`[DEBUG] TextProcessor: Got bot username: ${this.botUsername}`);
      } catch (err) {
        console.error(`[ERROR] TextProcessor: Failed to get bot info: ${err.message}`);
        this.botUsername = 'AlphinDAO_bot'; // Fallback
      }
    }
    
    console.log(`[DEBUG] TextProcessor: Processing group mention in chatId: ${chatId}`);
    console.log(`[DEBUG] TextProcessor: Original message text: "${messageText}"`);
    
    // Remove bot username from message - handle case variations
    const mentionPattern = new RegExp(`@${this.botUsername}`, 'i'); // Case-insensitive match
    if (mentionPattern.test(messageText)) {
      messageText = messageText.replace(mentionPattern, '').trim();
      console.log(`[DEBUG] TextProcessor: Removed bot mention. New text: "${messageText}"`);
    }
    
    console.log(`[DEBUG] TextProcessor: Processed message text after username removal: "${messageText}"`);
    console.log(`[DEBUG] TextProcessor: Sending to AI service for processing`);
    
    // Get information about current DAO state to provide as context
    const groupContext = `This is the Alphin DAO community group. Users can interact with the Alphin DAO through private chat with the bot. The bot helps users join the DAO, create proposals, vote, and earn tokens for participation.`;
    
    try {
      const response = await this.ai.processGroupMention(messageText, groupContext);
      console.log(`[DEBUG] TextProcessor: AI response received: "${response}"`);
      
      // Fix Markdown formatting before sending
      let sanitizedResponse = response;
      try {
        // Ensure proper Markdown formatting by escaping special characters 
        // and ensuring all formatting tags are properly closed
        const markdownChars = ['\\', '`', '*', '_', '{', '}', '[', ']', '(', ')', '#', '+', '-', '.', '!'];
        markdownChars.forEach(char => {
          if (char !== '*' && char !== '_' && char !== '`') { // Keep formatting characters
            sanitizedResponse = sanitizedResponse.replace(new RegExp('\\' + char, 'g'), '\\' + char);
          }
        });
        
        // Verify all formatting tags are properly closed
        const asteriskCount = (sanitizedResponse.match(/\*/g) || []).length;
        if (asteriskCount % 2 !== 0) {
          sanitizedResponse = sanitizedResponse.replace(/\*([^\*]*)$/g, '$1'); // Remove trailing *
        }
        
        // Simple validation to check markdown is valid
        console.log(`[DEBUG] TextProcessor: Sending sanitized response`);
      } catch (err) {
        console.log(`[DEBUG] TextProcessor: Error sanitizing Markdown, falling back to plain text`);
        sanitizedResponse = response.replace(/\*/g, '').replace(/_/g, ''); // Strip all formatting
      }
      
      bot.sendMessage(chatId, sanitizedResponse, { 
        reply_to_message_id: msg.message_id,
        parse_mode: 'Markdown'
      }).then(() => {
        console.log(`[DEBUG] TextProcessor: Response sent successfully`);
      }).catch(err => {
        console.error(`[ERROR] TextProcessor: Failed to send response: ${err.message}`);
        // Fallback to plain text if Markdown fails
        console.log(`[DEBUG] TextProcessor: Trying to send as plain text instead`);
        bot.sendMessage(chatId, response.replace(/\*/g, '').replace(/_/g, ''), {
          reply_to_message_id: msg.message_id
        }).catch(fallbackErr => {
          console.error(`[ERROR] TextProcessor: Even plain text failed: ${fallbackErr.message}`);
        });
      });
    } catch (error) {
      console.error('Error processing group mention with AI:', error);
      bot.sendMessage(
        chatId, 
        'Sorry, I\'m having trouble responding right now. Please try again later.',
        { reply_to_message_id: msg.message_id }
      );
    }
  }
  
  /**
   * Handle pin input during a secured operation
   * @param {string} userId - Telegram user ID
   * @param {string} chatId - Telegram chat ID
   * @param {string} pin - PIN input by user
   * @param {Object} bot - Telegram bot instance
   */
  async handlePinInput(userId, chatId, pin, bot) {
    const state = this.stateManager.getState(userId);
    
    // Delete PIN message for security
    try {
      bot.deleteMessage(chatId, state.messageToDelete);
    } catch (error) {
      console.error('Error deleting PIN message:', error);
    }
    
    // Execute the callback associated with PIN input
    try {
      await this.stateManager.executeCallback(userId, pin);
    } catch (error) {
      console.error('Error in PIN callback:', error);
      bot.sendMessage(chatId, `Error: ${error.message}`);
    }
    
    // Reset state
    this.stateManager.resetState(userId);
  }
  
  /**
   * Handle proposal title input
   * @param {string} userId - Telegram user ID
   * @param {string} chatId - Telegram chat ID
   * @param {string} title - Proposal title
   * @param {Object} bot - Telegram bot instance
   */
  async handleProposalTitleInput(userId, chatId, title, bot) {
    // Store title and prompt for description
    const state = this.stateManager.getState(userId);
    state.proposalTitle = title;
    state.state = this.STATES.CREATING_PROPOSAL_DESCRIPTION;
    this.stateManager.setState(userId, state);
    
    bot.sendMessage(
      chatId, 
      `Great! Your Alphin DAO proposal title is: "${title}"\n\nNow, please provide a detailed description of your proposal.`
    );
  }
  
  /**
   * Handle proposal description input
   * @param {string} userId - Telegram user ID
   * @param {string} chatId - Telegram chat ID
   * @param {string} description - Proposal description
   * @param {Object} bot - Telegram bot instance
   */
  async handleProposalDescriptionInput(userId, chatId, description, bot) {
    // Store description and prompt for PIN
    const state = this.stateManager.getState(userId);
    state.proposalDescription = description;
    state.state = this.STATES.AWAITING_PROPOSAL_PIN;
    this.stateManager.setState(userId, state);
    
    const message = await bot.sendMessage(
      chatId, 
      `Thank you! Your Alphin DAO proposal is ready to be submitted:\n\nTitle: ${state.proposalTitle}\n\nDescription: ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}\n\nPlease enter your PIN to confirm and submit this proposal.`,
      { reply_markup: { force_reply: true } }
    );
    
    // Store message ID to delete it later (for security)
    state.messageToDelete = message.message_id;
    this.stateManager.setState(userId, state);
  }
  
  /**
   * Handle PIN input for proposal submission
   * @param {string} userId - Telegram user ID
   * @param {string} chatId - Telegram chat ID
   * @param {string} pin - PIN input by user
   * @param {Object} bot - Telegram bot instance
   */
  async handleProposalPinInput(userId, chatId, pin, bot) {
    const state = this.stateManager.getState(userId);
    
    // Delete PIN message for security
    try {
      bot.deleteMessage(chatId, state.messageToDelete);
    } catch (error) {
      console.error('Error deleting PIN message:', error);
    }
    
    // Process proposal submission with PIN
    if (this.proposalCallbacks[userId]) {
      try {
        await this.proposalCallbacks[userId](pin, state.proposalTitle, state.proposalDescription);
        // Remove the callback after successful execution
        delete this.proposalCallbacks[userId];
      } catch (error) {
        console.error('Error in proposal submission:', error);
        bot.sendMessage(chatId, `Error submitting your Alphin DAO proposal: ${error.message}`);
      }
    } else {
      bot.sendMessage(chatId, 'Sorry, I\'ve lost track of what we were doing. Please start over with your Alphin DAO proposal.');
    }
    
    // Reset state
    this.stateManager.resetState(userId);
  }
  
  /**
   * Handle PIN input for voting
   * @param {string} userId - Telegram user ID
   * @param {string} chatId - Telegram chat ID
   * @param {string} pin - PIN input by user
   * @param {Object} bot - Telegram bot instance
   */
  async handleVotePinInput(userId, chatId, pin, bot) {
    const state = this.stateManager.getState(userId);
    
    // Delete PIN message for security
    try {
      bot.deleteMessage(chatId, state.messageToDelete);
    } catch (error) {
      console.error('Error deleting PIN message:', error);
    }
    
    // Process vote with PIN
    try {
      await this.stateManager.executeCallback(userId, pin);
    } catch (error) {
      console.error('Error in vote submission:', error);
      bot.sendMessage(chatId, `Error casting your Alphin DAO vote: ${error.message}`);
    }
    
    // Reset state
    this.stateManager.resetState(userId);
  }
  
  /**
   * Set up a conversation to await PIN input
   * @param {string} userId - Telegram user ID
   * @param {Function} callback - Function to call with PIN
   */
  setupAwaitingPin(userId, callback) {
    this.stateManager.setupAwaitingPin(userId, callback);
  }
  
  /**
   * Set up a conversation for creating a proposal
   * @param {string} userId - Telegram user ID
   * @param {Function} callback - Callback to execute when proposal data is complete
   */
  setupCreatingProposal(userId, callback) {
    // Initialize state for proposal creation
    const state = this.stateManager.getState(userId);
    state.state = this.STATES.CREATING_PROPOSAL_TITLE;
    state.data = {}; // Reset any existing data
    this.stateManager.setState(userId, state);
    
    // Store the callback for later use
    this.proposalCallbacks[userId] = callback;
  }
  
  /**
   * Set up a conversation to await vote PIN
   * @param {string} userId - Telegram user ID
   * @param {Function} callback - Function to call with PIN
   */
  setupAwaitingVotePin(userId, callback) {
    const state = this.stateManager.getState(userId);
    state.state = this.STATES.AWAITING_VOTE_PIN;
    state.callback = callback;
    this.stateManager.setState(userId, state);
  }
  
  /**
   * Get conversation state for a user
   * @param {string} userId - Telegram user ID
   * @returns {Object} - Conversation state
   */
  getConversationState(userId) {
    return this.stateManager.getState(userId);
  }
  
  /**
   * Set conversation state for a user
   * @param {string} userId - Telegram user ID
   * @param {Object} state - New conversation state
   */
  setConversationState(userId, state) {
    this.stateManager.setState(userId, state);
  }
  
  /**
   * Reset conversation state for a user
   * @param {string} userId - Telegram user ID
   */
  resetConversationState(userId) {
    this.stateManager.resetState(userId);
  }
}

module.exports = TextProcessor;
