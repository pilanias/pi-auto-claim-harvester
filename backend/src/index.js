
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';
import walletRoutes from './routes/wallets.js';
import balanceRoutes from './routes/balances.js';
import transactionRoutes from './routes/transactions.js';
import logRoutes from './routes/logs.js';
import { initWalletMonitoring } from './services/walletMonitor.js';
import { addLog } from './services/logService.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} [${req.method}] ${req.url}`);
  next();
});

// Routes
app.use('/api', walletRoutes);
app.use('/api', balanceRoutes);
app.use('/api', transactionRoutes);
app.use('/api', logRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Add initial log
  addLog({
    message: 'Pi Auto-Claim Backend Server started',
    status: 'info'
  });
  
  // Initialize wallet monitoring
  initWalletMonitoring();
  
  // Set up cron job to check claimable balances every minute
  cron.schedule('* * * * *', () => {
    console.log('Running scheduled balance check');
    // This will trigger balance checks for all monitored wallets
  });
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  addLog({
    message: 'Server shutting down',
    status: 'info'
  });
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  addLog({
    message: 'Server shutting down',
    status: 'info'
  });
  process.exit(0);
});

export default app;
