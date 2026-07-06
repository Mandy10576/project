const express = require('express');
const router = express.Router();
const { createOrder, getOrders, getOrderById } = require('../data/dbService');
const authMiddleware = require('../middleware/auth');

// @route   POST /api/orders
// @desc    Place a new order (Checkout)
// @access  Private
router.post('/', authMiddleware, async (req, res) => {
  const { shippingAddress, paymentMethod } = req.body;

  try {
    const newOrder = await createOrder(req.user.id, shippingAddress, paymentMethod);
    res.status(201).json({
      message: 'Order placed successfully!',
      order: newOrder
    });
  } catch (error) {
    console.error('Checkout error:', error);
    if (error.message.includes('empty') || error.message.includes('stock') || error.message.includes('not found')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error during checkout' });
  }
});

// @route   GET /api/orders
// @desc    Get all orders of the logged-in user
// @access  Private
router.get('/', authMiddleware, async (req, res) => {
  try {
    const orders = await getOrders(req.user.id);
    res.json(orders);
  } catch (error) {
    console.error('Fetch user orders error:', error);
    res.status(500).json({ message: 'Server error fetching orders' });
  }
});

// @route   GET /api/orders/:id
// @desc    Get specific order details by ID
// @access  Private
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const order = await getOrderById(req.params.id, req.user.id);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    res.json(order);
  } catch (error) {
    console.error('Fetch order by ID error:', error);
    res.status(500).json({ message: 'Server error fetching order details' });
  }
});

module.exports = router;
