
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

// Enhanced CORS setup
const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.CORS_ORIGIN,
      'https://supreme-giggle-9w4949v5pxvhxwpj-8080.app.github.dev',
      'https://pi-auto-claim-harvester.vercel.app',
      // Add any additional origins that need access
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000'
    ];
    
    // Log the origin to help debug
    console.log('Request origin:', origin);
    console.log('Allowed origins:', allowedOrigins);
    console.log('CORS_ORIGIN env value:', process.env.CORS_ORIGIN);
    
    if (allowedOrigins.includes(origin) || origin.includes('lovableproject.com')) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400 // 24 hours
};

// Apply CORS middleware with options
app.use(cors(corsOptions));
app.use(express.json());

// Set explicit CORS headers for all responses
app.use((req, res, next) => {
  // Log all requests
  console.log(`${new Date().toISOString()} [${req.method}] ${req.url} - Origin: ${req.headers.origin || 'unknown'}`);
  
  // Set CORS headers directly
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
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
  
  // Set up cron job to check claimable balances every 5 minutes instead of every minute
  cron.schedule('*/5 * * * *', () => {
    console.log('Running scheduled balance check (every 5 minutes)');
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
