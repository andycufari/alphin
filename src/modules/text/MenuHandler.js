/**
 * Handles menu button interactions for the Telegram bot
 */
class MenuHandler {
  /**
   * Create a MenuHandler instance
   */
  constructor() {
    // Map of menu button text to corresponding commands
    this.menuCommands = {
      '🔑 Join DAO': '/join',
      '📝 Create Proposal': '/proposal',
      '🗳️ View Proposals': '/proposals',
      '💰 Check Balance': '/balance',
      '❓ Help': '/help',
      '❓ What is a DAO?': '/help',
      '🏁 Back to Start': '/start'
    };
  }

  /**
   * Process a menu button message
   * @param {Object} msg - Telegram message object
   * @param {Object} bot - Telegram bot instance
   * @returns {boolean} Whether the message was a menu button that was processed
   */
  processMenuButton(msg, bot) {
    const messageText = msg.text;
    
    // Check if the message text matches any menu button
    if (this.menuCommands[messageText]) {
      // Create a new message object with the command text
      const commandMsg = { 
        ...msg, 
        text: this.menuCommands[messageText] 
      };
      
      // Emit the message event with the command
      bot.emit('message', commandMsg);
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if a message is a menu button
   * @param {string} messageText - Text of the message
   * @returns {boolean} Whether the message is a menu button
   */
  isMenuButton(messageText) {
    return !!this.menuCommands[messageText];
  }
}

module.exports = MenuHandler; 