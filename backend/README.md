
# Pi Auto-Claim Tool Backend

This is the backend server for the Pi Auto-Claim Tool, which handles wallet monitoring, claimable balance checking, and automatic claiming and transferring of Pi when unlocked.

## Features

- Continuous monitoring of Pi wallets for claimable balances
- Automatic claiming of balances when they unlock
- Automatic transfer of claimed Pi to a destination wallet
- Secure handling of private keys
- Persistent monitoring even when the frontend is closed
- REST API for the frontend to interact with

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Configure environment variables by copying `.env.example` to `.env` and editing the values
4. Start the server:
   ```
   npm start
   ```
   
For development with auto-restart:
```
npm run dev
```

## API Endpoints

### Wallets
- `POST /api/monitor-wallet` - Add a new wallet for monitoring
- `GET /api/wallets` - Get all monitored wallets
- `GET /api/wallets/:id` - Get a specific wallet
- `DELETE /api/stop-monitoring/:id` - Stop monitoring a wallet

### Balances
- `GET /api/claimable-balances/:address` - Get claimable balances for a wallet
- `GET /api/monitored-balances` - Get all claimable balances being monitored
- `GET /api/monitored-balances/:walletId` - Get monitored balances for a specific wallet
- `GET /api/sequence/:address` - Get sequence number for an account
- `DELETE /api/monitored-balances/:balanceId` - Remove a claimable balance

### Transactions
- `POST /api/submit-transaction` - Submit a transaction

### Logs
- `GET /api/logs` - Get all logs
- `DELETE /api/logs` - Clear all logs

## Security Considerations

In production:

1. Store private keys securely (consider encryption)
2. Use HTTPS for all API endpoints
3. Implement proper authentication and authorization
4. Consider using a database instead of in-memory storage
5. Set up proper CORS rules to restrict access to trusted domains

## Deployment

This backend can be deployed on various platforms:

- **Heroku**: Use a Procfile with `web: npm start`
- **AWS/Azure/GCP**: Deploy in a container or VM
- **Digital Ocean**: Use a droplet or App Platform
- **Railway/Render/Fly.io**: Easy deployment with minimal configuration

## Environment Variables

- `PORT` - Server port (default: 3001)
- `HOST` - Server host (default: localhost)
- `PI_API_BASE_URL` - Pi Network API base URL
- `PI_NETWORK_PASSPHRASE` - Pi Network passphrase
- `CORS_ORIGIN` - Allowed origin for CORS
- `MAX_LOGS` - Maximum number of logs to store (default: 500)
