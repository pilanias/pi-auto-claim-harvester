
# Pi Auto-Claim Tool

A responsive web application that automatically monitors, claims, and transfers Pi tokens when they become unlocked. The tool continues running in the background even when the UI is closed.

![Pi Auto-Claim Tool Screenshot](https://placeholder-for-screenshot.png)

## Features

- **Wallet Management**: Add and monitor multiple Pi wallets
- **Auto-Claim**: Automatically claim unlocked Pi and transfer to destination addresses
- **Real-time Monitoring**: Track pending transactions and their status
- **Background Processing**: Continues to run and process transactions even when UI is closed
- **Detailed Logging**: Comprehensive logging of all activities and transactions

## Technical Stack

- React + TypeScript
- Tailwind CSS for styling
- shadcn/ui component library
- Stellar SDK for blockchain interactions

## AI Recreation Prompt

The following is a detailed prompt to give an AI to recreate this application:

---

### Prompt for AI to Recreate Pi Auto-Claim Tool

Create a responsive React TypeScript application called "Pi Auto-Claim Tool" that automatically monitors Pi Network wallets for claimable balances, then claims and transfers those balances when they become unlocked.

#### Core Functionality

1. **Wallet Management**:
   - Allow users to add Pi wallets by providing a wallet address, private key, and destination address
   - Store wallet data securely in local storage
   - Display a list of monitored wallets
   - Allow removal of wallets

2. **Claimable Balance Monitoring**:
   - Periodically fetch claimable balances for each wallet using the Pi Network API
   - Display pending claimable balances with amount and unlock time
   - Calculate and show total pending Pi across all wallets

3. **Auto-Claim and Transfer**:
   - When a balance becomes unlocked, automatically:
     - Fetch the sequence number for the wallet
     - Construct a transaction with two operations: claim the balance + transfer the amount to the destination address
     - Sign the transaction with the wallet's private key
     - Submit the transaction to the Pi Network
   - Add a manual refresh option for claimable balances

4. **Transaction Status Tracking**:
   - Show the status of each transaction (waiting, processing, completed, failed)
   - Allow retrying failed transactions
   - Display time remaining until unlock for pending balances

5. **Logging**:
   - Maintain a detailed log of all activities
   - Display logs in the UI with appropriate status indicators
   - Allow clearing of logs

#### Technical Requirements

1. **API Integration**:
   - Use `https://api.mainnet.minepi.com` as the base URL for Pi Network API
   - Implement error handling for API calls with appropriate user feedback

2. **Stellar SDK Integration**:
   - Use Stellar SDK for transaction building, signing, and submission
   - Follow Stellar Labs patterns for transaction construction:

```typescript
// Example Stellar Labs transaction pattern
const source = new StellarSdk.Account(walletAddress, sequenceNumber);
const transaction = new StellarSdk.TransactionBuilder(source, {
  fee: "1000000", // 0.1 Pi fee
  networkPassphrase: StellarSdk.Networks.PUBLIC,
  timebounds: {
    minTime: 0,
    maxTime: Math.floor(Date.now() / 1000) + 300 // 5 minutes
  }
})
.addOperation(
  StellarSdk.Operation.claimClaimableBalance({
    balanceId: claimableBalanceId
  })
)
.addOperation(
  StellarSdk.Operation.payment({
    destination: destinationAddress,
    asset: StellarSdk.Asset.native(),
    amount: amount
  })
)
.build();

// Sign the transaction
transaction.sign(StellarSdk.Keypair.fromSecret(privateKey));

// Submit via Stellar SDK first, fall back to API if needed
try {
  const server = new StellarSdk.Horizon.Server("https://api.mainnet.minepi.com");
  const result = await server.submitTransaction(transaction);
  // Handle success
} catch (error) {
  // Fall back to API submission
  const xdr = transaction.toXDR();
  const response = await fetch("https://api.mainnet.minepi.com/transactions", {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tx: xdr })
  });
  // Handle response
}
```

3. **UI Design**:
   - Create a clean, responsive UI with Tailwind CSS
   - Use shadcn/ui components for a polished look and feel
   - Implement a glass morphism design style
   - Create status indicators for transaction states
   - Design a dashboard with summary statistics at the top

4. **Data Structure**:
   - Create TypeScript interfaces for all data models:
     - WalletData (id, address, privateKey, destinationAddress)
     - ClaimableBalance (id, walletId, amount, unlockTime)
     - TransactionStatus (enum of states)
     - LogEntry (message, status, timestamp, walletId)

5. **State Management**:
   - Use React hooks for state management
   - Create custom hooks for main functionality:
     - useWalletManager: For wallet CRUD operations
     - useClaimableBalances: For fetching and tracking balances
     - useTransaction: For transaction processing and monitoring

6. **Background Processing**:
   - Implement a mechanism for continued processing even when the UI is closed
   - Use setTimeout/setInterval for scheduling checks and operations
   - Handle sequence number issues with automatic retries

#### Component Structure

1. **Pages**:
   - Index: Main dashboard with all components
   - NotFound: 404 page

2. **Components**:
   - WalletForm: Form to add new wallets
   - WalletList: List of monitored wallets
   - WalletItem: Individual wallet card with status
   - LogDisplay: Display of logs with status indicators
   - StatusIndicator: Visual indicator of various transaction states

3. **Hooks**:
   - useWalletManager: Manage wallet CRUD operations
   - useClaimableBalances: Fetch and track claimable balances
   - useTransaction: Handle transaction creation and submission

4. **Utilities**:
   - api.ts: API call functions for Pi Network
   - storage.ts: Local storage utilities
   - types.ts: TypeScript type definitions

#### Important Implementation Details

1. **Private Key Handling**:
   - Store private keys locally only (no server transmission)
   - Implement validation of private keys before use
   - Provide masked display of private keys and addresses

2. **Error Handling**:
   - Implement comprehensive error handling for API calls
   - Add fallback mechanisms for transaction submission
   - Provide clear error messages to users

3. **Optimization**:
   - Implement debouncing for API calls
   - Add caching where appropriate
   - Optimize React renders with memoization

4. **Security Considerations**:
   - Store sensitive data only in local storage with appropriate warning
   - Never transmit private keys to any external service
   - Validate addresses and inputs

---

## Development

### Prerequisites

- Node.js (v18.0.0 or higher)
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/pi-auto-claim-tool.git
cd pi-auto-claim-tool
```

2. Install dependencies
```bash
npm install
# or
yarn
```

3. Start the development server
```bash
npm run dev
# or
yarn dev
```

## Usage

1. Add your Pi wallet by providing:
   - Pi wallet address
   - Private key (used for signing transactions)
   - Destination address (where claimed Pi will be sent)

2. The tool will automatically:
   - Monitor for claimable balances
   - Wait for unlock time
   - Claim balances and transfer them to destination addresses
   - Log all activity

3. You can close the browser window and the tool will continue processing in the background when you return.

## Security Note

This tool stores sensitive information (including private keys) in your browser's local storage. While this data never leaves your device, please be aware of the security implications and use at your own risk.

## License

MIT

## Disclaimer

This project is not officially affiliated with or endorsed by the Pi Network. Use at your own risk.
