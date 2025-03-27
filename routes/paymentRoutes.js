// routes/paymentRoutes.js
import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { sendPaymentConfirmation } from '../utils/emailService.js';

dotenv.config();

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Configure rate limiter for payment endpoints
const paymentLimiter = (req, res, next) => {
  // Simple request ID generator
  req.id = Date.now().toString(36) + Math.random().toString(36).substring(2);
  next();
};

// Webhook handler (will be registered in the main server file with raw body parsing)
export const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verify the event came from Stripe
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    // Check if payment was successful
    if (session.payment_status === 'paid') {
      try {
        // Extract user information from session metadata
        const { username, serverProvider } = session.metadata;
        
        // Send confirmation email with payment details
        await sendPaymentConfirmation({
          serverProvider,
          username,
          amount: session.amount_total / 100, // Convert from cents to dollars
          paymentId: session.id
        });
        
        console.log(`Payment confirmation email sent for payment: ${session.id}`);
        
        // You can also update your database here to record the successful payment
        
      } catch (error) {
        console.error('Error processing webhook:', error);
      }
    }
  }

  // Return a 200 response to acknowledge receipt of the event
  res.send();
};

// Checkout endpoint
router.post('/checkout', paymentLimiter, async (req, res) => {
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
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment-cancel`,
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

// Verify payment endpoint (for the frontend to check payment status)
router.get('/verify-payment/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({
        status: 'error',
        message: 'Session ID is required'
      });
    }
    
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status === 'paid') {
      res.status(200).json({
        status: 'success',
        paymentStatus: 'paid',
        paymentDetails: {
          amount: session.amount_total / 100,
          currency: session.currency
        }
      });
    } else {
      res.status(200).json({
        status: 'success',
        paymentStatus: session.payment_status,
        paymentDetails: {
          amount: session.amount_total / 100,
          currency: session.currency
        }
      });
    }
  } catch (error) {
    console.error(`Error verifying payment:`, error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to verify payment'
    });
  }
});

export default router;