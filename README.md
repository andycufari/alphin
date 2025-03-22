# Alfin - Telegram DAO AI Agent

Alfin is an AI-powered Telegram bot that makes DAO participation simple and accessible directly from Telegram, removing blockchain complexity while enabling full governance participation.

<p align="center">
  <img src="https://via.placeholder.com/600x400?text=Alfin+DAO+Agent" alt="Alfin DAO Agent" width="600"/>
</p>

## What is Alfin?

Alfin makes DAOs accessible to everyone by handling all the complex blockchain interactions behind the scenes. Users can join, vote, and create proposals directly in Telegram without worrying about gas fees, private keys, or blockchain technicalities.

### Problem Solved

DAOs face significant adoption barriers:
- Complex blockchain interactions
- Need to manage wallets and private keys
- Gas fees for every transaction
- Technical knowledge requirements

Alfin removes these barriers completely by providing:
- Simple chat-based interface
- Bot-managed wallets secured with PINs
- Gas fees covered by the DAO
- AI assistance for governance questions

## Features

- **One-Click Onboarding**: Users join with a simple command and PIN setup
- **Secure Wallet Management**: PIN-encrypted wallets for each user
- **Gasless Transactions**: The bot covers all transaction fees
- **Proposal Creation**: Create governance proposals with simple text commands
- **Voting**: Vote directly from group announcements
- **AI Assistant**: Get help and information about the DAO through natural conversation
- **Participation Rewards**: Earn tokens for voting and creating proposals

## User Guide

### Getting Started

1. **Find the bot**: Search for `@AlfinDAOBot` in Telegram or click [this link](https://t.me/AlfinDAOBot)
2. **Start a chat**: Send `/start` to begin
3. **Join the DAO**: 
   - Send `/join` or press the "Join DAO" button
   - Create a PIN when prompted (4-8 digits)
   - Receive welcome tokens automatically

### Participating in Governance

#### Voting on Proposals
1. When a proposal is announced in the community group, click one of the voting buttons (Yes/No/Abstain)
2. You'll be redirected to a private chat with the bot
3. Confirm your vote with your PIN
4. Receive tokens as a reward for voting

#### Creating Proposals
1. In a private chat with the bot, send `/proposal` or press the "Create Proposal" button
2. Enter a title for your proposal when prompted
3. Provide a detailed description of your proposal
4. Confirm with your PIN
5. Your proposal will be announced in the community group for voting

#### Checking Your Balance
1. Send `/balance` or press the "Check Balance" button in a private chat with the bot
2. View your token balance and wallet address
3. (Optional) View on blockchain explorer with the provided link

### Getting Help

1. Send `/help` or press the "Help" button
2. Select a topic to learn more about:
   - What is a DAO?
   - How to Vote
   - Creating Proposals
   - Tokens & Rewards
   - PIN Security

Or simply ask questions in natural language, and the AI will provide answers.

## Setting Up Your Own Instance

### Prerequisites

- Node.js 16+
- Telegram Bot Token (from BotFather)
- OpenAI API Key
- Ethereum/EVM RPC Endpoint
- Deployed Governance Contracts:
  - ERC20Votes Token
  - Governor Contract

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/alfin-dao-bot.git
   cd alfin-dao-bot
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Configure environment variables
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. Start the bot
   ```bash
   npm start
   ```

See [BUILDME.md](BUILDME.md) for detailed technical documentation.

## Security Notes

- PINs are never stored, only used to encrypt/decrypt wallets
- Private keys never leave the server
- All sensitive actions occur in private chats
- PIN messages are deleted after processing

## Contributing

Contributions are welcome! Please check the [issues](https://github.com/yourusername/alfin-dao-bot/issues) for areas where you can help.

## License

[MIT License](LICENSE)
