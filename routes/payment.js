const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Razorpay = require('razorpay');

// Helper to check if credentials are set
const hasCredentials = () => {
  return process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET;
};

// Initialize Razorpay only if keys are present
let razorpay = null;
if (hasCredentials()) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
  console.log('⚡ Razorpay Client successfully initialized.');
} else {
  console.warn('⚠️ Razorpay credentials missing from .env. Payments will run in MOCK MODE.');
}

// Create order
router.post('/create-order', async (req, res) => {
  const { amount } = req.body; // Amount in INR

  if (!amount || isNaN(amount)) {
    return res.status(400).json({ success: false, message: 'Invalid order amount' });
  }

  const amountInPaise = Math.round(amount * 100);

  if (!hasCredentials()) {
    // Return mock order if credentials are not configured
    return res.json({
      success: true,
      mockMode: true,
      orderId: 'order_mock_' + Math.random().toString(36).substr(2, 9),
      amount: amountInPaise,
      currency: 'INR',
      keyId: 'rzp_test_placeholder_key'
    });
  }

  try {
    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: 'receipt_order_' + Date.now()
    };

    const order = await razorpay.orders.create(options);
    res.json({
      success: true,
      mockMode: false,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    console.error('❌ Razorpay order creation failed:', err);
    res.status(500).json({ success: false, message: 'Payment gateway error', error: err.message });
  }
});

// Verify payment signature
router.post('/verify-signature', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, mockMode } = req.body;

  if (mockMode) {
    // If running in mock mode, bypass verification and approve automatically
    return res.json({ success: true, message: 'Mock payment verified successfully' });
  }

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ success: false, message: 'Missing signature parameters' });
  }

  try {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      res.json({ success: true, message: 'Payment signature verified successfully' });
    } else {
      res.status(400).json({ success: false, message: 'Invalid signature signature match failed' });
    }
  } catch (err) {
    console.error('❌ Signature verification error:', err);
    res.status(500).json({ success: false, message: 'Internal server error verifying signature' });
  }
});

module.exports = router;
