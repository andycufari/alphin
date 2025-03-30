/**
 * Handle join DAO command
 * @param {Object} dependencies - Dependencies needed for the function
 * @param {Object} dependencies.bot - Telegram bot instance
 * @param {Object} dependencies.wallets - Wallet manager
 * @param {Object} dependencies.blockchain - Blockchain service manager
 * @param {Object} dependencies.textProcessor - Text processor
 * @param {string} dependencies.communityGroupId - Telegram ID of the community group
 * @param {Function} dependencies.getExplorerUrl - Function to get explorer URL
 * @param {Object} dependencies.config - Configuration object with environment variables
 * @param {Object} msg - Telegram message object
 */
async function handleJoinDAO({ 
  bot, 
  wallets, 
  blockchain, 
  textProcessor, 
  communityGroupId, 
  getExplorerUrl,
  config = {
    network: process.env.BLOCKCHAIN_NETWORK || 'sepolia',
    daoGroupLink: process.env.DAO_GROUP_LINK
  }
}, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username;
  
  // Only process private messages for actions requiring signing
  if (msg.chat.type !== 'private') {
    return bot.sendMessage(chatId, 'Please talk to me directly to join the DAO.');
  }
  
  try {
    // Check if user already has a wallet
    const hasWallet = await wallets.hasWallet(userId);
    
    if (hasWallet) {
      return await handleExistingMember(chatId, userId);
    }
    
    // Setup new member flow
    await setupNewMemberFlow(chatId, userId);
    
  } catch (error) {
    console.error('Error in join process:', error);
    bot.sendMessage(chatId, `Error joining the DAO: ${error.message}`);
  }
  
  // Handle existing DAO member
  async function handleExistingMember(chatId, userId) {
    const address = await wallets.getWalletAddress(userId);
    const balance = await blockchain.getTokenBalance(address);
    
    // Get blockchain explorer URL based on network
    const explorerUrl = getExplorerUrl(config.network, address);
    
    return bot.sendMessage(
      chatId,
      `You are already a member of the DAO!\n\nJoin us on our private channel to keep you updated: [Join DAO Group](${config.daoGroupLink})\n\nYour wallet address: \`${address}\`\nYour token balance: ${balance} tokens\n\n[View on Block Explorer](${explorerUrl})`,
      { parse_mode: 'Markdown' }
    );
  }
  
  // Setup the flow for new members
  async function setupNewMemberFlow(chatId, userId) {
    // Prompt for PIN setup
    const message = await bot.sendMessage(
      chatId,
      'To join the DAO, you need to set up a PIN to secure your wallet. This PIN will be used to sign transactions.\n\nPlease enter a PIN (4-8 digits):',
      { reply_markup: { force_reply: true } }
    );
    
    // Setup awaiting PIN state
    textProcessor.setupAwaitingPin(userId, async (pin) => {
      try {
        await processNewMember(chatId, userId, pin);
      } catch (error) {
        console.error('Error in join process:', error);
        bot.sendMessage(chatId, `Error joining the DAO: ${error.message}`);
      }
    });
    
    // Save message ID to delete it later (for security)
    const state = textProcessor.getConversationState(userId);
    state.messageToDelete = message.message_id;
    textProcessor.setConversationState(userId, state);
  }
  
  // Process new member onboarding
  async function processNewMember(chatId, userId, pin) {
    // Send initial status message
    const statusMsg = await bot.sendMessage(
      chatId,
      '🔄 *Processing your request*\n\nStatus: Creating your wallet...',
      { parse_mode: 'Markdown' }
    );
    
    // Create wallet for user
    const address = await wallets.createWallet(userId, pin);
    
    // Update status message - wallet created
    await updateStatusMessage(
      chatId, 
      statusMsg.message_id, 
      '🔄 *Processing your request*\n\nStatus: Wallet created ✅\nStatus: Sending tokens to your wallet...'
    );
    
    // Send welcome tokens - pass userId to check if admin
    const result = await blockchain.sendWelcomeTokens(address, userId);
    
    // Update status message - tokens sent
    await updateStatusMessage(
      chatId,
      statusMsg.message_id,
      '🔄 *Processing your request*\n\nStatus: Wallet created ✅\nStatus: Tokens sent ✅\nStatus: Setting up voting rights...'
    );
    
    // Get delegation status
    const { delegationStatus, delegationNote } = getDelegationInfo(result.delegationSuccess);
    
    // Final status update - all done
    await updateStatusMessage(
      chatId,
      statusMsg.message_id,
      `🔄 *Processing your request*\n\nStatus: Wallet created ✅\nStatus: Tokens sent ✅\nStatus: ${delegationStatus}`
    );
    
    // Send welcome message
    await sendWelcomeMessage(chatId, address, result);
    
    // Notify community group
    await notifyCommunityGroup(result);
  }
  
  // Helper function to update status messages
  async function updateStatusMessage(chatId, messageId, text) {
    return bot.editMessageText(text, { 
      chat_id: chatId, 
      message_id: messageId,
      parse_mode: 'Markdown'
    });
  }
  
  // Get delegation info based on success status
  function getDelegationInfo(delegationSuccess) {
    if (delegationSuccess) {
      return {
        delegationStatus: 'Voting rights activated ✅',
        delegationNote: ''
      };
    }
    
    return {
      delegationStatus: 'Voting rights setup failed ❌',
      delegationNote: '\n\n⚠️ *Note:* Token delegation failed. You may need to manually delegate your tokens to vote on proposals. This is usually a temporary issue with the blockchain network.'
    };
  }
  
  // Send welcome message to the user
  async function sendWelcomeMessage(chatId, address, result) {
    // Get blockchain explorer URLs
    const explorerUrl = getExplorerUrl(config.network, address);
    const txExplorerUrl = getExplorerUrl(config.network, result.txHash, 'tx');
    
    // Format token amount with commas
    const formattedAmount = Number(result.amount).toLocaleString();
    
    // Get token visual based on amount
    const tokenVisual = getTokenVisual(parseFloat(result.amount));
    
    // Get delegation note
    const { delegationNote } = getDelegationInfo(result.delegationSuccess);
    
    // Customize message based on admin status
    const welcomeMessage = result.isAdmin
      ? `${tokenVisual} *Welcome to the DAO, Admin!* 🎉\n\nYour wallet has been created and *${formattedAmount} admin tokens* have been sent to your address.\n\nJoin us on our private channel to keep you updated: [Join DAO Group](${config.daoGroupLink})\n\nWallet address: \`${address}\`\n\n[View Wallet on Block Explorer](${explorerUrl})\n[View Token Transaction](${txExplorerUrl})\n\nYour tokens ${result.delegationSuccess ? 'are' : 'should be'} delegated, so you can vote on proposals and create new ones right away! Keep your PIN secure - you'll need it for DAO actions.${delegationNote}`
      : `${tokenVisual} *Welcome to the DAO!* 🎉\n\nYour wallet has been created and *${formattedAmount} tokens* have been sent to your address.\n\nJoin us on our private channel to keep you updated: [Join DAO Group](${config.daoGroupLink})\n\nWallet address: \`${address}\`\n\n[View Wallet on Block Explorer](${explorerUrl})\n[View Token Transaction](${txExplorerUrl})\n\nYour tokens ${result.delegationSuccess ? 'are' : 'should be'} delegated, so you can vote on proposals right away! Keep your PIN secure - you'll need it for DAO actions.${delegationNote}`;
    
    return bot.sendMessage(
      chatId,
      welcomeMessage,
      { parse_mode: 'Markdown' }
    );
  }
  
  // Determine token visual based on amount
  function getTokenVisual(tokenAmount) {
    if (tokenAmount < 100) {
      return '🥉'; // Bronze for small balance
    } else if (tokenAmount < 1000) {
      return '🥈'; // Silver for medium balance
    } else if (tokenAmount < 10000) {
      return '🥇'; // Gold for large balance
    }
    return '👑'; // Crown for very large balance
  }
  
  // Notify community group about new member
  async function notifyCommunityGroup(result) {
    if (!communityGroupId) return;
    
    const formattedAmount = Number(result.amount).toLocaleString();
    const tokenVisual = getTokenVisual(parseFloat(result.amount));
    const usernameDisplay = username 
      ? `@${username}` 
      : msg.from.first_name 
        ? `${msg.from.first_name}${msg.from.last_name ? ' ' + msg.from.last_name : ''}` 
        : 'A new member';
    
    const roleMessage = result.isAdmin ? ' as an admin' : '';
    
    try {
      await bot.sendMessage(
        communityGroupId,
        `🌟 *New Member Alert!*\n\n${tokenVisual} ${usernameDisplay} has joined Alphin DAO${roleMessage}!\n\n💰 *${formattedAmount} tokens* have been granted\n\nThey can now participate in proposals and voting.\n\n*Let's give them a warm welcome!* 👋`,
        { parse_mode: 'Markdown' }
      );
    } catch (groupError) {
      console.log(`Failed to send message to community group: ${groupError.message}`);
      
      // If the error is about supergroup, try to use the new chat ID
      if (groupError.message.includes('supergroup chat')) {
        try {
          // Try to handle the supergroup migration
          const migrationInfo = groupError.response?.parameters;
          if (migrationInfo && migrationInfo.migrate_to_chat_id) {
            console.log(`Group migrated to supergroup with ID: ${migrationInfo.migrate_to_chat_id}`);
            await bot.sendMessage(
              migrationInfo.migrate_to_chat_id,
              `🌟 *New Member Alert!*\n\n${tokenVisual} ${usernameDisplay} has joined Alphin DAO${roleMessage}!\n\n💰 *${formattedAmount} tokens* have been granted\n\nThey can now participate in proposals and voting.\n\n*Let's give them a warm welcome!* 👋`,
              { parse_mode: 'Markdown' }
            );
          }
        } catch (innerError) {
          console.log(`Failed to send message to supergroup: ${innerError.message}`);
        }
      }
      // No need to throw error here, the user has already joined successfully
    }
  }
}

module.exports = handleJoinDAO; 