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
      bot.sendMessage(chatId, 'Sorry, I\'m having trouble processing your message right now. Please try again later.');
    }
  }
  
  /**
   * Process a mention in a group chat
   * @param {Object} msg - Telegram message object
   * @param {Object} bot - Telegram bot instance
   */
  async processGroupMention(msg, bot) {
    const chatId = msg.chat.id;
    let messageText = msg.text;
    
    // Remove bot username from message
    if (messageText.includes('@AlfinDAOBot')) {
      messageText = messageText.replace('@AlfinDAOBot', '').trim();
    }
    
    console.log(`Processing group mention: ${messageText}`);
    
    // Get information about current DAO state to provide as context
    const groupContext = `This is a DAO community group. Users can interact with the DAO through the bot in private chat.`;
    
    try {
      const response = await this.ai.processGroupMention(messageText, groupContext);
      bot.sendMessage(chatId, response, { reply_to_message_id: msg.message_id });
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
      bot.sendMessage(chatId, 'Sorry, I\'ve lost track of what we were doing. Please start over.');
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
      `Got it! The title of your proposal is: "${title}"\n\nNow, please provide a detailed description of your proposal.`
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
      `Thank you! Your proposal is ready to be submitted:\n\nTitle: ${state.proposalTitle}\n\nDescription: ${description.substring(0, 100)}${description.length > 100 ? '...' : ''}\n\nPlease enter your PIN to confirm and submit this proposal.`,
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
    if (state.callback) {
      try {
        await state.callback(pin, state.proposalTitle, state.proposalDescription);
      } catch (error) {
        console.error('Error in proposal submission:', error);
        bot.sendMessage(chatId, `Error submitting proposal: ${error.message}`);
      }
    } else {
      bot.sendMessage(chatId, 'Sorry, I\'ve lost track of what we were doing. Please start over.');
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
        bot.sendMessage(chatId, `Error casting vote: ${error.message}`);
      }
    } else {
      bot.sendMessage(chatId, 'Sorry, I\'ve lost track of what we were doing. Please start over.');
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
   * Set up a conversation to create a proposal
   * @param {string} userId - Telegram user ID
   * @param {Function} callback - Function to call with proposal data and PIN
   */
  setupCreatingProposal(userId, callback) {
    const state = this.getConversationState(userId);
    state.state = this.STATES.CREATING_PROPOSAL_TITLE;
    state.callback = callback;
    this.setConversationState(userId, state);
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
