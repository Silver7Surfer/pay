// utils/emailService.js
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create nodemailer transporter
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

/**
 * Sends payment confirmation email
 * @param {Object} paymentData - Payment information
 * @returns {Promise<boolean>} - Success status
 */
export const sendPaymentConfirmation = async (paymentData) => {
  const { serverProvider, username, amount, paymentId } = paymentData;
  
  try {
    // Create a unique subject line with the transaction ID
    const uniqueSubject = `New Payment Received - ${serverProvider} - ${username} - ID: ${paymentId.substring(0, 8)}`;
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: 'storemf69@gmail.com', // Hard-coded email as requested
      subject: uniqueSubject,
      // Add a unique message ID header
      headers: {
        'X-Transaction-ID': paymentId,
        'Message-ID': `<payment-${paymentId}@bigwin.gold>`
      },
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">Payment Notification</h2>
          <div style="background-color: #f8f8f8; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p>A new payment has been successfully processed.</p>
            
            <h3 style="margin-top: 20px;">Payment Details:</h3>
            <ul style="list-style: none; padding-left: 0;">
              <li><strong>Amount:</strong> $${parseFloat(amount).toFixed(2)}</li>
              <li><strong>Server Provider:</strong> ${serverProvider}</li>
              <li><strong>Username:</strong> ${username}</li>
              <li><strong>Transaction ID:</strong> ${paymentId}</li>
              <li><strong>Date:</strong> ${new Date().toLocaleString()}</li>
            </ul>
          </div>
          
          <p>This payment has been processed and the customer's account will be credited shortly.</p>
          
          <div style="text-align: center; margin-top: 30px; color: #777; font-size: 0.9em;">
            <p>This is an automated email notification.</p>
            <p>Transaction Reference: ${paymentId}</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Payment confirmation email sent to storemf69@gmail.com`);
    return true;
  } catch (error) {
    console.error('Error sending payment confirmation email:', error);
    return false;
  }
};

export default {
  sendPaymentConfirmation
};