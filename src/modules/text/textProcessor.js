/**
 * Text processor for handling natural language interactions
 */
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
  }
  
  /**
   * Process a message from a user
   * @param {Object} msg - Telegram message object
   * @param {Object} bot - Telegram bot instance
   */
  async processMessage(msg, bot) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const messageText = msg.text;
    
    console.log(`Processing message from user ${userId}: ${messageText}`);
    
    // Handle menu button actions
    if (messageText === '🔑 Join DAO') {
      const joinCommand = { ...msg, text: '/join' };
      return bot.emit('message', joinCommand);
    }
    
    if (messageText === '📝 Create Proposal') {
      const proposalCommand = { ...msg, text: '/proposal' };
      return bot.emit('message', proposalCommand);
    }
    
    if (messageText === '🗳️ View Proposals') {
      const proposalsCommand = { ...msg, text: '/proposals' };
      return bot.emit('message', proposalsCommand);
    }
    
    if (messageText === '💰 Check Balance') {
      const balanceCommand = { ...msg, text: '/balance' };
      return bot.emit('message', balanceCommand);
    }
    
    if (messageText === '❓ Help' || messageText === '❓ What is a DAO?') {
      const helpCommand = { ...msg, text: '/help' };
      return bot.emit('message', helpCommand);
    }
    
    if (messageText === '🏁 Back to Start') {
      const startCommand = { ...msg, text: '/start' };
      return bot.emit('message', startCommand);
    }
    
    // Get current state for this user
    const state = this.getConversationState(userId);
    
    // Process based on conversation state
    if (state.state === this.STATES.AWAITING_PIN) {
      return this.handlePinInput(userId, chatId, messageText, bot);
    }
    
    if (state.state === this.STATES.CREATING_PROPOSAL_TITLE) {
      return this.handleProposalTitleInput(userId, chatId, messageText, bot);
    }
    
    if (state.state === this.STATES.CREATING_PROPOSAL_DESCRIPTION) {
      return this.handleProposalDescriptionInput(userId, chatId, messageText, bot);
    }
    
    if (state.state === this.STATES.AWAITING_PROPOSAL_PIN) {
      return this.handleProposalPinInput(userId, chatId, messageText, bot);
    }
    
    if (state.state === this.STATES.AWAITING_VOTE_PIN) {
      return this.handleVotePinInput(userId, chatId, messageText, bot);
    }
    
    // Default: process with AI
    try {
      const response = await this.ai.processMessage(messageText);
      bot.sendMessage(chatId, response);
    } catch (error) {
      console.error('Error processing message with AI:', error);
      bot.sendMessage(chatId, 'Sorry, I\'m having trouble processing your message right now. Please try again with Alphin DAO assistant later.');
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
        // Ensure proper Markdown formatting for Telegram
        // We should NOT escape characters that are already correctly escaped in OpenAI's response
        // Only ensure proper markdown tag closure
        
        // Check for unclosed markdown tags
        const asteriskCount = (sanitizedResponse.match(/\*/g) || []).length;
        if (asteriskCount % 2 !== 0) {
          sanitizedResponse = sanitizedResponse.replace(/\*([^\*]*)$/g, '$1'); // Remove trailing *
        }
        
        const underscoreCount = (sanitizedResponse.match(/_/g) || []).length;
        if (underscoreCount % 2 !== 0) {
          sanitizedResponse = sanitizedResponse.replace(/_([^_]*)$/g, '$1'); // Remove trailing _
        }
        
        console.log(`[DEBUG] TextProcessor: Sending sanitized response`);
      } catch (err) {
        console.log(`[DEBUG] TextProcessor: Error sanitizing Markdown, falling back to plain text`);
        sanitizedResponse = response.replace(/\*/g, '').replace(/_/g, ''); // Strip all formatting
      }
      
      bot.sendMessage(chatId, sanitizedResponse, { 
        reply_to_message_id: msg.message_id,
        parse_mode: 'MarkdownV2'
      }).then(() => {
        console.log(`[DEBUG] TextProcessor: Response sent successfully`);
      }).catch(err => {
        console.error(`[ERROR] TextProcessor: Failed to send response: ${err.message}`);
        // Try with regular Markdown
        bot.sendMessage(chatId, sanitizedResponse, {
          reply_to_message_id: msg.message_id,
          parse_mode: 'Markdown'
        }).catch(err2 => {
          console.error(`[ERROR] TextProcessor: Failed with Markdown too: ${err2.message}`);
          // Fallback to plain text if all Markdown fails
          console.log(`[DEBUG] TextProcessor: Trying to send as plain text instead`);
          bot.sendMessage(chatId, response.replace(/\*/g, '').replace(/_/g, ''), {
            reply_to_message_id: msg.message_id
          }).catch(fallbackErr => {
            console.error(`[ERROR] TextProcessor: Even plain text failed: ${fallbackErr.message}`);
          });
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
    const state = this.getConversationState(userId);
    
    // Delete PIN message for security
    try {
      bot.deleteMessage(chatId, state.messageToDelete);
    } catch (error) {
      console.error('Error deleting PIN message:', error);
    }
    
    // Execute the callback associated with PIN input
    if (state.callback) {
      try {
        await state.callback(pin);
      } catch (error) {
        console.error('Error in PIN callback:', error);
        bot.sendMessage(chatId, `Error: ${error.message}`);
      }
    } else {
      bot.sendMessage(chatId, 'Sorry, I\'ve lost track of what we were doing. Please start over with your Alphin DAO request.');
    }
    
    // Reset state
    this.resetConversationState(userId);
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
    const state = this.getConversationState(userId);
    state.proposalTitle = title;
    state.state = this.STATES.CREATING_PROPOSAL_DESCRIPTION;
    this.setConversationState(userId, state);
    
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
    const state = this.getConversationState(userId);
    state.proposalDescription = description;
    state.state = this.STATES.AWAITING_PROPOSAL_PIN;
    this.setConversationState(userId, state);
    
    const message = await bot.sendMessage(
      chatId, 
      `Thank you! Your Alphin DAO proposal is ready to be submitted:\n\nTitle: ${state.proposalTitle}\n\nDescription: ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}\n\nPlease enter your PIN to confirm and submit this proposal.`,
      { reply_markup: { force_reply: true } }
    );
    
    // Store message ID to delete it later (for security)
    state.messageToDelete = message.message_id;
    this.setConversationState(userId, state);
  }
  
  /**
   * Handle PIN input for proposal submission
   * @param {string} userId - Telegram user ID
   * @param {string} chatId - Telegram chat ID
   * @param {string} pin - PIN input by user
   * @param {Object} bot - Telegram bot instance
   */
  async handleProposalPinInput(userId, chatId, pin, bot) {
    const state = this.getConversationState(userId);
    
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
    this.resetConversationState(userId);
  }
  
  /**
   * Handle PIN input for voting
   * @param {string} userId - Telegram user ID
   * @param {string} chatId - Telegram chat ID
   * @param {string} pin - PIN input by user
   * @param {Object} bot - Telegram bot instance
   */
  async handleVotePinInput(userId, chatId, pin, bot) {
    const state = this.getConversationState(userId);
    
    // Delete PIN message for security
    try {
      bot.deleteMessage(chatId, state.messageToDelete);
    } catch (error) {
      console.error('Error deleting PIN message:', error);
    }
    
    // Process vote with PIN
    if (state.callback) {
      try {
        await state.callback(pin);
      } catch (error) {
        console.error('Error in vote submission:', error);
        bot.sendMessage(chatId, `Error casting your Alphin DAO vote: ${error.message}`);
      }
    } else {
      bot.sendMessage(chatId, 'Sorry, I\'ve lost track of what we were doing. Please start over with your Alphin DAO voting process.');
    }
    
    // Reset state
    this.resetConversationState(userId);
  }
  
  /**
   * Set up a conversation to await PIN input
   * @param {string} userId - Telegram user ID
   * @param {Function} callback - Function to call with PIN
   */
  setupAwaitingPin(userId, callback) {
    const state = this.getConversationState(userId);
    state.state = this.STATES.AWAITING_PIN;
    state.callback = callback;
    this.setConversationState(userId, state);
  }
  
  /**
   * Set up a conversation for creating a proposal
   * @param {string} userId - Telegram user ID
   * @param {Function} callback - Callback to execute when proposal data is complete
   */
  setupCreatingProposal(userId, callback) {
    // Initialize state for proposal creation
    const state = this.getConversationState(userId);
    state.state = this.STATES.CREATING_PROPOSAL_TITLE;
    state.data = {}; // Reset any existing data
    this.setConversationState(userId, state);
    
    // Store the callback for later use
    this.proposalCallbacks[userId] = callback;
  }
  
  /**
   * Set up a conversation to await vote PIN
   * @param {string} userId - Telegram user ID
   * @param {Function} callback - Function to call with PIN
   */
  setupAwaitingVotePin(userId, callback) {
    const state = this.getConversationState(userId);
    state.state = this.STATES.AWAITING_VOTE_PIN;
    state.callback = callback;
    this.setConversationState(userId, state);
  }
  
  /**
   * Get conversation state for a user
   * @param {string} userId - Telegram user ID
   * @returns {Object} - Conversation state
   */
  getConversationState(userId) {
    if (!this.conversationStates.has(userId)) {
      this.conversationStates.set(userId, {
        state: this.STATES.NORMAL,
        data: {}
      });
    }
    
    return this.conversationStates.get(userId);
  }
  
  /**
   * Set conversation state for a user
   * @param {string} userId - Telegram user ID
   * @param {Object} state - New conversation state
   */
  setConversationState(userId, state) {
    this.conversationStates.set(userId, state);
  }
  
  /**
   * Reset conversation state for a user
   * @param {string} userId - Telegram user ID
   */
  resetConversationState(userId) {
    this.conversationStates.set(userId, {
      state: this.STATES.NORMAL,
      data: {}
    });
  }
}

module.exports = TextProcessor;
