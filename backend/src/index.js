
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
      // Add any additional origins that need access
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3000'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
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

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} [${req.method}] ${req.url} - Origin: ${req.headers.origin || 'unknown'}`);
  next();
});

// CORS preflight handler for all routes
app.options('*', cors(corsOptions));

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
