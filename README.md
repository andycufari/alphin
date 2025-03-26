# Alphin DAO Bot

Alphin is a Telegram bot that makes blockchain DAOs accessible to web2 users by abstracting away the complexity of interacting with governance contracts. Deployed on Mantle.

You can try Alphin on Telegram: https://t.me/AlphinDAO_bot with a test DAO 

Here is a brief, visually-focused presentation on Alphin: https://docs.google.com/presentation/d/1FjVJ57L1Su0dOp_N_ezqZz4T8XPlwxKuOLsvtmXvgAw/edit?slide=id.g342bafa3fbe_0_66#slide=id.g342bafa3fbe_0_66

Additionally, Alphin is set to evolve into an open-source SDK for crypto bots, allowing users to add their own modules and customize functionality according to their needs.

## Features

- AI integration with OpenAI API
- Blockchain service for OpenZeppelin governance contracts
- Secure wallet management with PIN-encryption
- Telegram bot command handling
- Conversation flow management
- Participation rewards system
- User vote tracking
- Proposal status monitoring
- Automatic notifications for governance events
- Makes interaction with DAOs fun!!!

## Recent Improvements

- Added a `user_votes` table in the SQLite database to track user votes
- Enhanced the proposal cache to store more detailed information
- Implemented automatic proposal status monitoring
- Added close vote alerts for proposals with narrow margins
- Improved error handling throughout the application
- Added user interface to show previous votes

## Getting Started

1. Install dependencies:
```
npm install
```

2. Configure environment variables in a `.env` file:
```
BOT_TOKEN=your_telegram_bot_token
OPENAI_API_KEY=your_openai_api_key
BLOCKCHAIN_RPC_URL=your_rpc_endpoint
TOKEN_ADDRESS=your_token_contract_address
GOVERNOR_ADDRESS=your_governor_contract_address
ADMIN_PRIVATE_KEY=your_admin_wallet_private_key
COMMUNITY_GROUP_ID=your_telegram_group_id
BLOCKCHAIN_NETWORK=sepolia
PROPOSAL_MONITOR_INTERVAL=300000
```

3. Start the bot:
```
npm start
```


## Smart Contracts

- [Governor](https://explorer.sepolia.mantle.xyz/address/0xbDfd2277da682AC45F7236EBf435bac6c7A150B3)

- [Token](https://explorer.sepolia.mantle.xyz/address/0x2506aFEF824c81df6E77780494E70C3563c300Eb)



## Architecture

The bot follows a modular architecture:
- `src/index.js`: Main entry point
- `src/modules/blockchain/`: Blockchain integration services
- `src/modules/commands/`: Telegram command handlers
- `src/modules/wallets/`: Wallet management
- `src/modules/database/`: Database services
- `src/modules/ai/`: AI integration services

## License

MIT
