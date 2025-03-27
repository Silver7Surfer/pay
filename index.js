import Stripe from 'stripe';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'crypto';

// Load environment variables
dotenv.config();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
// Set security headers
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use(limiter);

// Apply stricter rate limits to sensitive endpoints
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each IP to 20 payment attempts per hour
  message: 'Too many payment attempts from this IP, please try again later'
});

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsers
app.use(express.json({ limit: '10kb' })); // Body limit is 10kb
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Add request ID for tracking
app.use((req, res, next) => {
  req.id = randomBytes(16).toString('hex');
  next();
});

// Add request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms | ReqID: ${req.id}`
    );
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'Server is running' });
});

// Checkout endpoint - returns session URL instead of redirecting
app.post('/checkout', paymentLimiter, async (req, res) => {
  try {
    const { serverProvider, username, amount } = req.body;
    console.log(`[ReqID: ${req.id}] Deposit Data:`, { serverProvider, username, amount });

    // Input validation
    if (!serverProvider || !username || !amount) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields'
      });
    }

    // Additional validation
    const amountFloat = parseFloat(amount);
    if (isNaN(amountFloat) || amountFloat <= 0 || amountFloat > 10000) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid amount. Must be a positive number less than 10,000'
      });
    }

    // Create metadata for better tracking
    const metadata = {
      requestId: req.id,
      userIp: req.ip.replace(/::ffff:/, ''), // Remove IPv6 prefix if present
      username,
      serverProvider
    };

    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Game: ${serverProvider} - Username: ${username}`,
            metadata
          },
          unit_amount: Math.round(amountFloat * 100) // Ensure it's a valid integer
        },
        quantity: 1
      }],
      mode: 'payment',
      metadata,
      shipping_address_collection: {
        allowed_countries: ['US', 'BR', 'CA']
      },
      success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment-cancel`,
      locale: 'en',
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // Expire after 30 minutes
    });
    
    // Return the session URL for the frontend to handle the redirect
    res.status(200).json({
      status: 'success',
      url: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error(`[ReqID: ${req.id}] Error in /checkout:`, error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while processing the payment',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Verify session endpoint - for the frontend to verify payment status
app.get('/verify-payment/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId || typeof sessionId !== 'string' || sessionId.length < 10) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid session ID is required'
      });
    }
    
    // Sanitize the sessionId (Stripe IDs typically start with 'cs_')
    if (!sessionId.startsWith('cs_')) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid session ID format'
      });
    }
    
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'line_items']
    });
    
    // Return session details including payment status
    res.status(200).json({
      status: 'success',
      paymentStatus: session.payment_status,
      amount: session.amount_total ? (session.amount_total / 100).toFixed(2) : null,
      customerDetails: {
        email: session.customer_details?.email || null,
        name: session.customer_details?.name || null
      },
      // Only include payment details if payment was successful
      paymentDetails: session.payment_status === 'paid' ? {
        paymentMethod: session.payment_intent?.payment_method_types?.[0] || null,
        paymentId: session.payment_intent?.id || null,
        receiptUrl: session.payment_intent?.charges?.data?.[0]?.receipt_url || null
      } : null
    });
  } catch (error) {
    console.error(`[ReqID: ${req.id}] Error verifying payment:`, error);
    
    // Special handling for "not found" errors
    if (error.type === 'StripeInvalidRequestError' && error.message.includes('No such checkout.session')) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment session not found'
      });
    }
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to verify payment status',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(`[ReqID: ${req.id}] Unhandled error:`, err);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    requestId: req.id
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Resource not found'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API is available for the Vite frontend`);
});