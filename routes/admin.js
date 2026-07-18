const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const { pool } = require('../data/dbService');

// ==========================================================================
// ORDER MANAGEMENT (ADMIN)
// ==========================================================================

// @route   GET /api/admin/orders
// @desc    Get all orders placed by all users
// @access  Private (Admin)
router.get('/orders', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { rows: orders } = await pool.query(`
      SELECT 
        o.id, 
        o.user_id AS "userId", 
        o.total_price::float AS "totalPrice", 
        o.shipping_address AS "shippingAddress", 
        o.payment_method AS "paymentMethod", 
        o.status, 
        o.created_at AS "createdAt",
        u.name AS "userName",
        u.email AS "userEmail"
      FROM orders o
      JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
    `);
    
    // Populate items for each order
    for (const order of orders) {
      const { rows: items } = await pool.query(
        'SELECT product_id AS "productId", name, price::float, image_url AS "imageUrl", quantity, item_total::float AS "itemTotal" FROM order_items WHERE order_id = $1',
        [order.id]
      );
      order.items = items;
    }
    
    res.json(orders);
  } catch (error) {
    console.error('Fetch all orders error:', error);
    res.status(500).json({ message: 'Server error fetching orders.' });
  }
});

// @route   PUT /api/admin/orders/:id
// @desc    Update order status
// @access  Private (Admin)
router.put('/orders/:id', authMiddleware, adminAuth, async (req, res) => {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ message: 'Status is required.' });
  }
  
  try {
    const { rowCount } = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2',
      [status, req.params.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ message: 'Order not found.' });
    }
    res.json({ message: 'Order status updated successfully.' });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ message: 'Server error updating order status.' });
  }
});

// ==========================================================================
// PRODUCT CATALOG MANAGEMENT (ADMIN)
// ==========================================================================

// @route   POST /api/admin/products
// @desc    Create a new product
// @access  Private (Admin)
router.post('/products', authMiddleware, adminAuth, async (req, res) => {
  const { name, description, price, category, stock, imageUrl } = req.body;
  
  if (!name || price === undefined || !category || stock === undefined) {
    return res.status(400).json({ message: 'Please enter name, price, category, and stock.' });
  }
  
  try {
    const id = `prod-${Date.now()}`;
    const { rows } = await pool.query(
      `INSERT INTO products (id, name, description, price, category, stock, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, description, price::float, category, stock, image_url AS "imageUrl"`,
      [id, name, description || '', price, category, stock, imageUrl || '']
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ message: 'Server error creating product.' });
  }
});

// @route   PUT /api/admin/products/:id
// @desc    Update a product's details and stock
// @access  Private (Admin)
router.put('/products/:id', authMiddleware, adminAuth, async (req, res) => {
  const { name, description, price, category, stock, imageUrl } = req.body;
  
  if (!name || price === undefined || !category || stock === undefined) {
    return res.status(400).json({ message: 'Please enter name, price, category, and stock.' });
  }

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE products 
       SET name = $1, description = $2, price = $3, category = $4, stock = $5, image_url = $6
       WHERE id = $7
       RETURNING id, name, description, price::float, category, stock, image_url AS "imageUrl"`,
      [name, description || '', price, category, stock, imageUrl || '', req.params.id]
    );
    
    if (rowCount === 0) {
      return res.status(404).json({ message: 'Product not found.' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ message: 'Server error updating product.' });
  }
});

// @route   DELETE /api/admin/products/:id
// @desc    Delete a product
// @access  Private (Admin)
router.delete('/products/:id', authMiddleware, adminAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    if (rowCount === 0) {
      return res.status(404).json({ message: 'Product not found.' });
    }
    res.json({ message: 'Product deleted successfully.' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Server error deleting product.' });
  }
});

module.exports = router;
