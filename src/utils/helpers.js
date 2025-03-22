/**
 * Utility functions for the Alphin DAO bot
 */

/**
 * Format a wallet address for display (shortens the address)
 * @param {string} address - Ethereum address
 * @returns {string} - Formatted address (e.g., 0x1234...abcd)
 */
function formatAddress(address) {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format token amount with specified decimals
 * @param {string|number} amount - Token amount
 * @param {number} [decimals=2] - Number of decimal places
 * @returns {string} - Formatted amount
 */
function formatTokenAmount(amount, decimals = 2) {
  return parseFloat(amount).toFixed(decimals);
}

/**
 * Create a Telegram deep link
 * @param {string} botUsername - Bot username
 * @param {string} startPayload - Payload for the /start command
 * @returns {string} - Deep link URL
 */
function createTelegramDeepLink(botUsername, startPayload) {
  return `https://t.me/${botUsername}?start=${encodeURIComponent(startPayload)}`;
}

/**
 * Get blockchain explorer URL for an address or transaction
 * @param {string} hash - Address or transaction hash
 * @param {string} type - Type of hash ('address' or 'tx')
 * @param {string} network - Network name
 * @returns {string} - Explorer URL
 */
function getExplorerUrl(hash, type = 'address', network = 'mainnet') {
  // Configuration for different networks
  const explorers = {
    mainnet: 'https://etherscan.io',
    goerli: 'https://goerli.etherscan.io',
    sepolia: 'https://sepolia.etherscan.io',
    polygon: 'https://polygonscan.com',
    mumbai: 'https://mumbai.polygonscan.com',
    avalanche: 'https://snowtrace.io',
    optimism: 'https://optimistic.etherscan.io',
    arbitrum: 'https://arbiscan.io'
  };
  
  const baseUrl = explorers[network] || explorers.mainnet;
  return `${baseUrl}/${type}/${hash}`;
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate a PIN (numeric, 4-8 digits)
 * @param {string} pin - PIN to validate
 * @returns {boolean} - Whether the PIN is valid
 */
function isValidPin(pin) {
  return /^\d{4,8}$/.test(pin);
}

/**
 * Generate a random string of specified length
 * @param {number} length - Length of the string
 * @returns {string} - Random string
 */
function generateRandomString(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

module.exports = {
  formatAddress,
  formatTokenAmount,
  createTelegramDeepLink,
  getExplorerUrl,
  sleep,
  isValidPin,
  generateRandomString
};
