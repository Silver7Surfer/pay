import Stripe from 'stripe';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173', // Default Vite dev server port
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'Server is running' });
});

// Checkout endpoint - returns session URL instead of redirecting
app.post('/checkout', async (req, res) => {
  try {
    const { serverProvider, username, amount } = req.body;
    console.log('Deposit Data:', { serverProvider, username, amount });

    if (!serverProvider || !username || !amount) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields'
      });
    }

    const session = await stripe.checkout.sessions.create({
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Game: ${serverProvider} - Username: ${username}`
          },
          unit_amount: Math.round(parseFloat(amount) * 100) // Ensure it's a valid integer
        },
        quantity: 1
      }],
      mode: 'payment',
      shipping_address_collection: {
        allowed_countries: ['US', 'BR', 'CA']
      },
      success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment-cancel`,
      //failure_url: `${process.env.FRONTEND_URL}/payment-failure?error={FAILURE_REASON}`,
      locale: 'en',
    });
    
    // Return the session URL for the frontend to handle the redirect
    res.status(200).json({
      status: 'success',
      url: session.url
    });
  } catch (error) {
    console.error('Error in /checkout:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while processing the payment',
      details: error.message
    });
  }
});

// Verify session endpoint - for the frontend to verify payment status
app.get('/verify-payment/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        status: 'error',
        message: 'Session ID is required'
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
      }
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to verify payment status',
      details: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API is available for the Vite frontend`);
});
