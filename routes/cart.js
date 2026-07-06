const express = require('express');
const router = express.Router();
const { 
  getCart, 
  getProductById, 
  addToCart, 
  updateCartItemQuantity, 
  removeCartItem, 
  clearCart 
} = require('../data/dbService');
const authMiddleware = require('../middleware/auth');

// @route   GET /api/cart
// @desc    Get user's cart details (Protected)
// @access  Private
router.get('/', authMiddleware, async (req, res) => {
  try {
    const cartData = await getCart(req.user.id);
    res.json(cartData);
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ message: 'Server error retrieving cart' });
  }
});

// @route   POST /api/cart
// @desc    Add item to cart or increment quantity (Protected)
// @access  Private
router.post('/', authMiddleware, async (req, res) => {
  const { productId, quantity } = req.body;
  const qty = parseInt(quantity, 10);

  if (!productId || isNaN(qty) || qty <= 0) {
    return res.status(400).json({ message: 'Valid productId and positive integer quantity are required' });
  }

  try {
    const product = await getProductById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check product stock limit
    const cart = await getCart(req.user.id);
    const existingItem = cart.items.find(item => item.product.id === productId);
    let targetQty = qty;

    if (existingItem) {
      targetQty += existingItem.quantity;
    }

    if (targetQty > product.stock) {
      return res.status(400).json({ 
        message: `Cannot add. Insufficient stock. Only ${product.stock} items left in stock.` 
      });
    }

    const cartData = await addToCart(req.user.id, productId, qty);
    res.json({ message: 'Item added/updated in cart successfully', cart: cartData });

  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ message: 'Server error updating cart' });
  }
});

// @route   PUT /api/cart/:productId
// @desc    Update quantity of specific product in cart (Protected)
// @access  Private
router.put('/:productId', authMiddleware, async (req, res) => {
  const { productId } = req.params;
  const { quantity } = req.body;
  const qty = parseInt(quantity, 10);

  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ message: 'Quantity must be a positive integer' });
  }

  try {
    const product = await getProductById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (qty > product.stock) {
      return res.status(400).json({ 
        message: `Insufficient stock. Only ${product.stock} items left in stock.` 
      });
    }

    const cart = await getCart(req.user.id);
    const existingItem = cart.items.find(item => item.product.id === productId);
    if (!existingItem) {
      return res.status(404).json({ message: 'Product not found in your cart' });
    }

    const cartData = await updateCartItemQuantity(req.user.id, productId, qty);
    res.json({ message: 'Cart updated successfully', cart: cartData });

  } catch (error) {
    console.error('Update cart item error:', error);
    res.status(500).json({ message: 'Server error updating cart item' });
  }
});

// @route   DELETE /api/cart/:productId
// @desc    Remove item from cart (Protected)
// @access  Private
router.delete('/:productId', authMiddleware, async (req, res) => {
  const { productId } = req.params;

  try {
    const cart = await getCart(req.user.id);
    const existingItem = cart.items.find(item => item.product.id === productId);
    if (!existingItem) {
      return res.status(404).json({ message: 'Product not in cart' });
    }

    const cartData = await removeCartItem(req.user.id, productId);
    res.json({ message: 'Item removed from cart successfully', cart: cartData });

  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ message: 'Server error removing item' });
  }
});

// @route   POST /api/cart/clear
// @desc    Clear entire cart (Protected)
// @access  Private
router.post('/clear', authMiddleware, async (req, res) => {
  try {
    const cartData = await clearCart(req.user.id);
    res.json({ message: 'Cart cleared successfully', cart: cartData });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ message: 'Server error clearing cart' });
  }
});

module.exports = router;
