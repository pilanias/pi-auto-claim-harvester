
import express from 'express';
import { fetchClaimableBalances } from '../services/piNetworkApi.js';
import { getAllClaimableBalances, getWalletClaimableBalances, removeClaimableBalance } from '../services/walletMonitor.js';
import { fetchSequenceNumber } from '../services/piNetworkApi.js';

const router = express.Router();

// Simple in-memory cache for claimable balances with request timestamp tracking
const balanceCache = new Map();
const requestTimestamps = new Map(); // Track request timestamps by address
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes cache TTL
const REQUEST_LIMIT = 30 * 1000; // Minimum 30 seconds between requests for the same address

// Get claimable balances for a wallet with caching and rate limiting
router.get('/claimable-balances/:address', async (req, res) => {
  try {
    const address = req.params.address;
    const requestTime = Date.now();
    
    // Check if we've had a recent request for this address to prevent hammering
    const lastRequestTime = requestTimestamps.get(address) || 0;
    const timeSinceLastRequest = requestTime - lastRequestTime;
    
    if (timeSinceLastRequest < REQUEST_LIMIT) {
      console.log(`Rate limit applied for ${address.substring(0, 6)}... (${Math.floor(timeSinceLastRequest/1000)}s since last request)`);
      
      // Check if we have a valid cache entry we can return
      const cacheKey = `balances-${address}`;
      const cachedData = balanceCache.get(cacheKey);
      
      if (cachedData && (requestTime - cachedData.timestamp < CACHE_TTL)) {
        console.log(`Serving cached balances for ${address.substring(0, 6)}... (age: ${Math.floor((requestTime - cachedData.timestamp)/1000)}s)`);
        return res.json(cachedData.data);
      }
      
      // If we don't have a cache entry but we're being rate limited, return a 429
      return res.status(429).json({
        message: 'Too many requests, please wait at least 30 seconds between balance checks',
        retryAfter: Math.ceil((REQUEST_LIMIT - timeSinceLastRequest) / 1000)
      });
    }
    
    // Update request timestamp for rate limiting
    requestTimestamps.set(address, requestTime);
    
    // Check cache
    const cacheKey = `balances-${address}`;
    const cachedData = balanceCache.get(cacheKey);
    
    if (cachedData && (requestTime - cachedData.timestamp < CACHE_TTL)) {
      console.log(`Serving cached balances for ${address.substring(0, 6)}... (age: ${Math.floor((requestTime - cachedData.timestamp)/1000)}s)`);
      return res.json(cachedData.data);
    }
    
    // Cache miss or expired, fetch from API
    console.log(`Cache miss for ${address.substring(0, 6)}..., fetching from API`);
    const balances = await fetchClaimableBalances(address);
    
    // Update cache
    balanceCache.set(cacheKey, {
      data: balances,
      timestamp: requestTime
    });
    
    res.json(balances);
  } catch (error) {
    console.error('Error in claimable-balances endpoint:', error);
    res.status(500).json({ 
      message: `Failed to fetch claimable balances: ${error.message}` 
    });
  }
});

// Get all claimable balances being monitored
router.get('/monitored-balances', (req, res) => {
  try {
    const balances = getAllClaimableBalances();
    res.json(balances);
  } catch (error) {
    console.error('Error in monitored-balances endpoint:', error);
    res.status(500).json({ 
      message: `Failed to get monitored balances: ${error.message}` 
    });
  }
});

// Get monitored balances for a specific wallet
router.get('/monitored-balances/:walletId', (req, res) => {
  try {
    const balances = getWalletClaimableBalances(req.params.walletId);
    res.json(balances);
  } catch (error) {
    console.error('Error in monitored-balances for wallet endpoint:', error);
    res.status(500).json({ 
      message: `Failed to get monitored balances: ${error.message}` 
    });
  }
});

// Get sequence number for an account
router.get('/sequence/:address', async (req, res) => {
  try {
    const address = req.params.address;
    const sequence = await fetchSequenceNumber(address);
    res.json({ sequence });
  } catch (error) {
    console.error('Error in sequence endpoint:', error);
    res.status(500).json({ 
      message: `Failed to fetch sequence number: ${error.message}` 
    });
  }
});

// Remove a claimable balance (usually after claiming)
router.delete('/monitored-balances/:balanceId', (req, res) => {
  try {
    removeClaimableBalance(req.params.balanceId);
    res.json({ message: 'Balance removed from monitoring' });
  } catch (error) {
    console.error('Error in delete monitored-balance endpoint:', error);
    res.status(500).json({ 
      message: `Failed to remove balance: ${error.message}` 
    });
  }
});

// Clear cache entry for an address (useful after claim operations)
router.delete('/cache/:address', (req, res) => {
  try {
    const address = req.params.address;
    const cacheKey = `balances-${address}`;
    
    if (balanceCache.has(cacheKey)) {
      balanceCache.delete(cacheKey);
      // Also clear rate limit entry
      requestTimestamps.delete(address);
      res.json({ message: `Cache cleared for address ${address.substring(0, 6)}...` });
    } else {
      res.json({ message: 'No cache entry found' });
    }
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ message: `Failed to clear cache: ${error.message}` });
  }
});

export default router;
