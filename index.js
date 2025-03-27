// index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import paymentRoutes, { handleWebhook } from './routes/paymentRoutes.js';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// IMPORTANT: Webhook endpoint must be defined BEFORE the express.json middleware
// because it needs the raw request body for signature verification
app.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

// Configure CORS for regular routes
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON requests for routes other than webhooks
app.use(express.json());

// Register routes
app.use('/', paymentRoutes);

// Basic health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Server is running' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});