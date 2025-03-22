# Alfin DAO Agent - Technical Documentation

This document provides technical details about the Alfin DAO Agent implementation, architecture, and current development status.

## Architecture Overview

Alfin is built with a modular architecture where each component handles a specific aspect of the system:

```
src/
├── index.js                   # Main application entry point
└── modules/
    ├── ai/                    # AI integration
    │   └── aiService.js       # OpenAI integration for natural language processing
    ├── blockchain/            # Blockchain interaction
    │   ├── blockchainManager.js  # High-level blockchain operations
    │   └── blockchainService.js  # Low-level contract interactions
    ├── commands/              # Telegram command handling
    │   └── commandHandler.js  # Processes bot commands
    ├── gamification/          # User reward system
    │   └── gamificationService.js  # Handles participation rewards
    ├── text/                  # Message processing
    │   └── textProcessor.js   # Conversation state management
    └── wallets/               # Wallet management
        └── walletManager.js   # Secure wallet creation and storage
```

## Technical Implementation

### 1. Blockchain Integration

- **Contract Compatibility**: Uses OpenZeppelin's standard governance contracts (Governor + ERC20Votes)
- **Gas Management**: All gas fees are paid by an admin wallet, removing that friction for users
- **Key Functions**:
  - Token transfers (for onboarding and rewards)
  - Vote delegation
  - Proposal creation
  - Vote casting
  - Balance queries

### 2. Wallet System

- **Security Model**: PIN-based encryption for user wallets
- **Storage**: Local encrypted wallet files with SQLite database for mappings
- **Isolation**: Each user has their own wallet mapped to their Telegram ID

### 3. Telegram Bot

- **Library**: Official node-telegram-bot-api
- **Command Structure**: Menu-driven with button-based navigation
- **Privacy**: Sensitive operations only in private chats
- **Group Support**: Proposal announcements and voting in group chats

### 4. AI Integration

- **Provider**: OpenAI API (GPT-4)
- **Use Cases**:
  - User assistance
  - Explaining DAO concepts
  - Processing natural language queries
  - Help content generation

### 5. Database

- **Technology**: SQLite (lightweight, no external service needed)
- **Tables**:
  - `users`: Maps Telegram IDs to wallet addresses
  - `proposal_cache`: Optional caching for proposal data

## Current Status

### Completed
- ✅ Core architecture and module structure
- ✅ Basic blockchain integration with OpenZeppelin governance
- ✅ Wallet encryption/decryption system
- ✅ Command handling for basic DAO operations
- ✅ Conversation flow management
- ✅ Participation reward system

### In Progress
- 🔄 Testing and validation
- 🔄 Error handling refinement
- 🔄 Performance optimization

### To Do
- ⬜ Deployment documentation
- ⬜ Unit and integration tests
- ⬜ Monitoring system
- ⬜ Database migrations and backup
- ⬜ Advanced group voting features

## Implementation Details

### Security Considerations

1. **Wallet Security**
   - Private keys are never stored in plaintext
   - PIN is hashed using scrypt with salt
   - AES-256-CBC encryption for private keys
   - PIN messages are deleted after processing

2. **Permission Model**
   - Only the wallet owner can use their wallet
   - Admin wallet only used for gas fee payment
   - Delegation requires owner consent

3. **Input Validation**
   - All user inputs are validated
   - Rate limiting on PIN attempts
   - Telegram message IDs tracked to prevent replay attacks

### Blockchain Interaction Flow

1. **User Onboarding**:
   ```
   Join command → PIN setup → Wallet creation → Token transfer → Delegation
   ```

2. **Proposal Creation**:
   ```
   Proposal command → Title input → Description input → PIN confirmation → Blockchain submission → Group announcement
   ```

3. **Voting**:
   ```
   Vote button → Private chat redirection → Vote selection → PIN confirmation → Vote submission → Reward
   ```

## Dependencies

- `node-telegram-bot-api`: Telegram bot API client
- `ethers`: Ethereum interaction library
- `sqlite3`: SQLite database interface
- `openai`: OpenAI API client
- `crypto`: Node.js cryptography for wallet encryption

## Extension Points

The architecture is designed to be extensible in several key areas:

1. **Custom Proposal Types**: The proposal creation system can be extended to support specialized proposal types.

2. **Multi-chain Support**: The blockchain service can be abstracted further to support multiple chains.

3. **Advanced Gamification**: The reward system can be expanded with achievements, levels, and more complex mechanics.

4. **AI Personalization**: The AI service can be enhanced to provide personalized responses based on user history.

## Known Limitations

- Currently supports a single DAO per bot instance
- Limited to EVM-compatible blockchains
- No support for hardware wallets or external wallet providers
- Group interactions are announcement-focused with redirection to private chats for actions

## Required Environment Variables

See `.env.example` for a complete list of required environment variables.
