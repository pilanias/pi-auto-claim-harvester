
# Pi Auto-Claim Tool

A React application for monitoring and automatically claiming Pi cryptocurrency when balances become unlocked, then transferring to a destination wallet.

## Project Overview

This tool helps Pi Network users automate the process of claiming their Pi cryptocurrency when it becomes available. It monitors wallet addresses for claimable balances, waits for unlock times, and executes claim + transfer transactions automatically.

## Features

- 🔐 Add multiple wallets to monitor
- 💰 View all pending claimable balances
- ⏰ Automatic claiming when unlock time is reached
- 🔄 Automatic transfer to destination wallet
- 📊 Live status updates and logs
- 🔒 Private keys are stored locally and never transmitted

## Technical Details

### Technologies Used

- React with TypeScript
- Tailwind CSS for styling
- shadcn/ui component library
- Stellar SDK for blockchain transactions
- Pi Network API for blockchain interaction

### Blockchain Integration

This application interacts with the Pi Network blockchain, which is based on the Stellar protocol. Key operations include:

1. **Monitoring claimable balances**: Fetches and tracks pending Pi that will become available
2. **Transaction building**: Creates Stellar transactions with both claim and payment operations
3. **Transaction signing**: Uses Stellar keypairs for cryptographic signing
4. **Transaction submission**: Submits signed transactions to the Pi Network

## Development Prompt

To recreate or extend this application, give an AI the following prompt:

```
Create a React application for Pi Network users that monitors and automatically claims Pi cryptocurrency when balances become unlocked, then transfers it to a destination wallet.

Key requirements:
1. Allow users to add multiple wallets to monitor by providing wallet address, private key, and destination address
2. Use @stellar/stellar-sdk to interact with the Pi Network blockchain (which uses Stellar's protocol)
3. Fetch claimable balances for each wallet and display them with unlock times
4. When unlock time is reached, automatically generate a transaction that:
   - Claims the balance using the claimClaimableBalance operation
   - Transfers the claimed Pi to the destination address using the payment operation
5. Sign transactions using the wallet's private key
6. Submit signed transactions to the Pi Network API
7. Display transaction status and logs
8. Implement a responsive UI with a modern design using Tailwind CSS and shadcn/ui

Technical implementation details:
- For proper transaction signing, follow the Stellar pattern where you:
  1. Create a transaction from an account with the correct sequence number
  2. Add the necessary operations (claimClaimableBalance, payment)
  3. Build the transaction to get an XDR string
  4. Sign the XDR with the keypair using transaction.sign(keyPair)
  5. Submit the signed XDR to the network
- Store private keys locally only (never transmit them)
- Include proper error handling and retry mechanisms
- Create a log display to show transaction status and events
```

## Security Notes

- Private keys are stored locally in browser storage and are never sent to any server
- All transactions are signed locally before submission
- The application runs entirely in the browser
- No backend services are used except direct API calls to the Pi Network

## Pi Network API Endpoints

The application interacts with these Pi Network API endpoints:

- `GET /claimable_balances/?claimant={address}` - Fetch claimable balances
- `GET /accounts/{address}` - Get account details including sequence number
- `POST /transactions` - Submit signed transactions

## Transaction Signing Process

The most critical part of the application is the transaction signing process:

1. Fetch the current sequence number for the source account
2. Create a transaction with the claim and payment operations
3. Build the transaction to get an XDR representation
4. Sign the transaction using the Stellar SDK and the private key
5. Submit the signed transaction to the Pi Network

When implementing transaction signing, follow the exact pattern used in Stellar Lab:
1. Parse a transaction from XDR: `TransactionBuilder.fromXDR(xdr, networkPassphrase)`
2. Create a keypair from a secret key: `Keypair.fromSecret(secretKey)`
3. Sign the transaction: `transaction.sign(keyPair)`
4. Convert back to XDR: `transaction.toXDR()`
5. Submit the signed XDR to the network

This approach matches how Stellar Lab handles transaction signing and ensures compatibility with the Pi Network blockchain.
