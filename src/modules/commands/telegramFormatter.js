/**
 * Handles formatting and sanitizing text for Telegram messages
 */
class TelegramFormatter {
  /**
   * Format text safely for Telegram markdown
   * @param {string} text - The text to format
   * @returns {string} - Safely formatted text
   */
  safeMarkdown(text) {
    if (!text) return '';
    
    // Escape characters that have special meaning in Markdown
    return String(text)
      .replace(/\_/g, '\\_')  // Escape underscores
      .replace(/\*/g, '\\*')  // Escape asterisks
      .replace(/\[/g, '\\[')  // Escape square brackets
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')  // Escape parentheses
      .replace(/\)/g, '\\)')
      .replace(/\~/g, '\\~')  // Escape tildes
      .replace(/\`/g, '\\`')  // Escape backticks
      .replace(/\>/g, '\\>')  // Escape greater than
      .replace(/\#/g, '\\#')  // Escape hash
      .replace(/\+/g, '\\+')  // Escape plus
      .replace(/\-/g, '\\-')  // Escape minus
      .replace(/\=/g, '\\=')  // Escape equals
      .replace(/\|/g, '\\|')  // Escape pipe
      .replace(/\{/g, '\\{')  // Escape curly braces
      .replace(/\}/g, '\\}')
      .replace(/\./g, '\\.')  // Escape dots
      .replace(/\!/g, '\\!'); // Escape exclamation
  }
  
  /**
   * Sanitize error messages for safe display in Telegram
   * @param {string} errorMsg - The error message to sanitize
   * @param {number} maxLength - Maximum length before truncation
   * @returns {string} - Safely formatted error message
   */
  sanitizeErrorForTelegram(errorMsg, maxLength = 100) {
    if (!errorMsg) {
      return 'Unknown error';
    }
    
    // Convert to string if not already a string
    let errorString = String(errorMsg);
    
    // Remove complex JSON and object content 
    errorString = errorString.replace(/\{[^}]+\}/g, "{...}");
    errorString = errorString.replace(/\[[^\]]]+\]/g, "[...]");
    
    // Remove any URLs that might be in the error
    errorString = errorString.replace(/(https?:\/\/[^\s]+)/g, "URL");
    
    // Truncate to max length
    if (errorString.length > maxLength) {
      errorString = errorString.substring(0, maxLength - 3) + '...';
    }
    
    // Remove any special Markdown characters completely instead of escaping them
    // _ * [ ] ( ) ~ ` > # + - = | { } . ! are special in Telegram Markdown
    errorString = errorString.replace(/[_*[\]()~`>#+=\-|{}.!]/g, " ");
    
    // Remove extra spaces
    errorString = errorString.replace(/\s+/g, " ").trim();
    
    return errorString;
  }
  
  /**
   * Get blockchain explorer URL based on network and address/transaction
   * @param {string} network - The blockchain network (e.g., 'sepolia', 'mainnet')
   * @param {string} hash - The address or transaction hash
   * @param {string} type - Type of URL ('address' or 'tx')
   * @returns {string} - The explorer URL
   */
  getExplorerUrl(network, hash, type = 'address') {
    // Define base URLs for different networks
    const explorers = {
      'mainnet': 'https://etherscan.io',
      'goerli': 'https://goerli.etherscan.io',
      'sepolia': 'https://sepolia.etherscan.io',
      'optimism': 'https://optimistic.etherscan.io',
      'arbitrum': 'https://arbiscan.io',
      'polygon': 'https://polygonscan.com',
      'bsc': 'https://bscscan.com',
      'avalanche': 'https://snowtrace.io',
      'mantletestnet': 'https://explorer.sepolia.mantle.xyz'
      // Add more networks as needed
    };
    
    // Default to Sepolia if network not found
    const baseUrl = explorers[network.toLowerCase()] || explorers['sepolia'];
    
    return `${baseUrl}/${type}/${hash}`;
  }
  
  /**
   * Format proposal information for display
   * @param {Object} proposal - Proposal data
   * @param {boolean} isDetailView - If true, show more details
   * @param {boolean} isAdmin - If true, show admin actions
   * @returns {Object} Formatted message and keyboard
   */
  formatProposalDisplay(proposal, isDetailView = false, isAdmin = false) {
    const shortenedId = proposal.id.substring(0, 8);
    const stateEmoji = 
      proposal.state === 'Active' ? '🟢' :
      proposal.state === 'Succeeded' ? '✅' :
      proposal.state === 'Executed' ? '🏁' :
      proposal.state === 'Defeated' ? '❌' :
      proposal.state === 'Pending' ? '⏳' : '⚪';
    
    let message = `*Proposal #${shortenedId}* ${stateEmoji}\n\n`;
    
    // Add description (if available)
    if (proposal.description) {
      // Format description - limit to 200 chars for list view
      const desc = isDetailView 
        ? proposal.description 
        : proposal.description.length > 200 
          ? proposal.description.substring(0, 200) + '...' 
          : proposal.description;
      
      message += `*Description:* ${desc}\n\n`;
    }
    
    // Add state and votes
    message += `*State:* ${proposal.state}\n`;
    message += `*Votes:*\n`;
    message += `✅ For: ${proposal.votes.forVotesFormatted || proposal.votes.forVotes}\n`;
    message += `❌ Against: ${proposal.votes.againstVotesFormatted || proposal.votes.againstVotes}\n`;
    message += `⚪ Abstain: ${proposal.votes.abstainVotesFormatted || proposal.votes.abstainVotes}\n`;
    
    // Add more details for detailed view
    if (isDetailView) {
      message += `\n*Proposer:* \`${proposal.proposer}\`\n`;
      
      if (proposal.startBlock && proposal.endBlock) {
        message += `*Voting Period:* Block ${proposal.startBlock} - ${proposal.endBlock}\n`;
      }
      
      if (proposal.targets && proposal.targets.length > 0) {
        message += `\n*Technical Details:*\n`;
        message += `Targets: ${proposal.targets.length} contract(s)\n`;
      }
    }
    
    // Create inline keyboard for actions
    const keyboard = [];
    
    // Add voting buttons for active proposals
    if (proposal.state === 'Active') {
      keyboard.push([
        { text: 'Vote For ✅', callback_data: `v_${shortenedId}_1` },
        { text: 'Vote Against ❌', callback_data: `v_${shortenedId}_0` },
        { text: 'Abstain ⚪', callback_data: `v_${shortenedId}_2` }
      ]);
    }
    
    // Add execute button for succeeded proposals (admin only)
    if (proposal.state === 'Succeeded' && isAdmin) {
      keyboard.push([
        { text: '🚀 Execute Proposal', callback_data: `exec_${shortenedId}` }
      ]);
    }
    
    return {
      message,
      keyboard
    };
  }
}

module.exports = { TelegramFormatter }; 