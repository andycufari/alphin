/**
 * Manages conversation state for Telegram bot interactions
 * Handles state initialization, transitions, retrieval, and reset
 * Works with state maps stored in TextProcessor
 */
class ConversationStateManager {
  /**
   * Create a ConversationStateManager instance
   * @param {Object} options - Configuration options
   * @param {Map} options.conversationStates - Reference to the conversation states map
   * @param {Map} options.awaitingCallbacks - Reference to the awaiting callbacks map
   * @param {Object} options.STATES - State constants
   */
  constructor({ conversationStates, awaitingCallbacks, STATES }) {
    // Store references to the maps from TextProcessor
    this.conversationStates = conversationStates;
    this.awaitingCallbacks = awaitingCallbacks || new Map();
    this.STATES = STATES || {
      NORMAL: 'normal',
      AWAITING_PIN: 'awaiting_pin',
      AWAITING_CONFIRMATION: 'awaiting_confirmation',
      AWAITING_TEXT: 'awaiting_text'
    };
  }

  /**
   * Initialize or get a user's conversation state
   * @param {number} userId - Telegram user ID
   * @returns {Object} The user's conversation state
   */
  getState(userId) {
    if (!this.conversationStates.has(userId)) {
      this.conversationStates.set(userId, {
        state: this.STATES.NORMAL,
        data: {}
      });
    }
    return this.conversationStates.get(userId);
  }

  /**
   * Update a user's conversation state
   * @param {number} userId - Telegram user ID
   * @param {Object} state - New state object
   */
  setState(userId, state) {
    this.conversationStates.set(userId, state);
  }

  /**
   * Reset conversation state for a user
   * @param {number} userId - Telegram user ID
   */
  resetState(userId) {
    this.conversationStates.set(userId, {
      state: this.STATES.NORMAL,
      data: {}
    });
    
    // Also clear any callbacks
    if (this.awaitingCallbacks) {
      this.awaitingCallbacks.delete(userId);
    }
  }

  /**
   * Check if a user is in a specific state
   * @param {number} userId - Telegram user ID
   * @param {string} stateName - State to check
   * @returns {boolean} Whether the user is in the specified state
   */
  isInState(userId, stateName) {
    const state = this.getState(userId);
    return state.state === stateName;
  }

  /**
   * Set up awaiting state for PIN input
   * @param {number} userId - Telegram user ID
   * @param {Function} callback - Function to call when PIN is received
   */
  setupAwaitingPin(userId, callback) {
    const state = this.getState(userId);
    state.state = this.STATES.AWAITING_PIN;
    state.callback = callback;
    this.setState(userId, state);
  }

  /**
   * Set up awaiting state for confirmation
   * @param {number} userId - Telegram user ID
   * @param {Function} callback - Function to call when confirmation is received
   * @param {Object} data - Additional data to store with the state
   */
  setupAwaitingConfirmation(userId, callback, data = {}) {
    const state = this.getState(userId);
    state.state = this.STATES.AWAITING_CONFIRMATION;
    state.callback = callback;
    state.data = { ...state.data, ...data };
    this.setState(userId, state);
  }

  /**
   * Set up awaiting state for text input
   * @param {number} userId - Telegram user ID
   * @param {Function} callback - Function to call when text is received
   * @param {Object} data - Additional data to store with the state
   */
  setupAwaitingText(userId, callback, data = {}) {
    const state = this.getState(userId);
    state.state = this.STATES.AWAITING_TEXT;
    state.callback = callback;
    state.data = { ...state.data, ...data };
    this.setState(userId, state);
  }

  /**
   * Store data in a user's conversation state
   * @param {number} userId - Telegram user ID
   * @param {string} key - Data key
   * @param {*} value - Data value
   */
  setStateData(userId, key, value) {
    const state = this.getState(userId);
    if (!state.data) {
      state.data = {};
    }
    state.data[key] = value;
    this.setState(userId, state);
  }

  /**
   * Get data from a user's conversation state
   * @param {number} userId - Telegram user ID
   * @param {string} key - Data key
   * @returns {*} The stored data value
   */
  getStateData(userId, key) {
    const state = this.getState(userId);
    return state.data ? state.data[key] : undefined;
  }

  /**
   * Execute callback for the current state
   * @param {number} userId - Telegram user ID
   * @param {*} data - Data to pass to the callback
   * @returns {Promise<boolean>} Whether a callback was executed
   */
  async executeCallback(userId, data) {
    const state = this.getState(userId);
    
    if (state.callback) {
      try {
        await state.callback(data);
        return true;
      } catch (error) {
        console.error(`Error executing callback for user ${userId}:`, error);
        throw error;
      }
    }
    
    return false;
  }

  /**
   * Clear all conversation states
   * Used for cleanup or testing
   */
  clearAllStates() {
    this.conversationStates.clear();
    if (this.awaitingCallbacks) {
      this.awaitingCallbacks.clear();
    }
  }
}

module.exports = ConversationStateManager; 