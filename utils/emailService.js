// utils/emailService.js
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create a transporter object
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE, // e.g., 'gmail'
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Function to send payment confirmation email
export const sendPaymentConfirmation = async (paymentData) => {
  const { serverProvider, username, amount, paymentId } = paymentData;
  
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: 'storemf69@gmail.com', // Hard-coded email as requested
      subject: 'New Payment Received',
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
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Payment confirmation email sent to exmarine@gmail.com`);
    return true;
  } catch (error) {
    console.error('Error sending payment confirmation email:', error);
    return false;
  }
};

// General email sending function
export const sendEmail = async (to, subject, html) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to,
      subject,
      html
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Email sending error:', error);
    return false;
  }
};