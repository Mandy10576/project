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

// @route   POST /api/admin/scrape
// @desc    Scrape and import products from external feed
// @access  Private (Admin)
router.post('/scrape', authMiddleware, adminAuth, async (req, res) => {
  const { source } = req.body;

  if (!source || (source !== 'dummyjson' && source !== 'fakestore')) {
    return res.status(400).json({ message: 'Invalid or missing scraper source.' });
  }

  const logs = [];
  logs.push(`[Scraper] Starting scrape from source: ${source}`);

  try {
    let url = '';
    if (source === 'dummyjson') {
      url = 'https://dummyjson.com/products?limit=15';
    } else {
      url = 'https://fakestoreapi.com/products?limit=15';
    }

    logs.push(`[Scraper] Fetching feed from URL: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Feed request failed with status: ${response.status}`);
    }

    const data = await response.json();
    let rawProducts = [];

    if (source === 'dummyjson') {
      rawProducts = data.products || [];
    } else {
      rawProducts = data || [];
    }

    logs.push(`[Scraper] Successfully loaded ${rawProducts.length} items from source feed.`);
    const importedList = [];

    for (const item of rawProducts) {
      // Map properties uniformly
      let id = '';
      let name = '';
      let description = '';
      let price = 0;
      let category = '';
      let stock = 100;
      let imageUrl = '';

      if (source === 'dummyjson') {
        id = `scrape-dj-${item.id}`;
        name = item.title;
        description = item.description || 'No description provided.';
        price = parseFloat(item.price) || 29.99;
        category = item.category || 'Accessories';
        stock = parseInt(item.stock, 10) || 50;
        imageUrl = item.thumbnail || item.images?.[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500';
      } else {
        id = `scrape-fs-${item.id}`;
        name = item.title;
        description = item.description || 'No description provided.';
        price = parseFloat(item.price) || 29.99;
        category = item.category || 'Accessories';
        stock = 80;
        imageUrl = item.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500';
      }

      logs.push(`[Database] Upserting product: "${name.substring(0, 30)}..."`);
      
      // Upsert into database
      await pool.query(`
        INSERT INTO products (id, name, description, price, category, stock, image_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) 
        DO UPDATE SET 
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          price = EXCLUDED.price,
          category = EXCLUDED.category,
          stock = EXCLUDED.stock,
          image_url = EXCLUDED.image_url
      `, [id, name, description, price, category, stock, imageUrl]);

      importedList.push({ id, name, price, category, imageUrl });
    }

    logs.push(`[Scraper] Scrape process completed successfully. ${importedList.length} products imported.`);
    res.json({
      success: true,
      logs,
      count: importedList.length,
      products: importedList
    });
  } catch (err) {
    console.error('Scrape error:', err);
    logs.push(`[Error] Scraper process aborted: ${err.message}`);
    res.status(500).json({ success: false, message: 'Scrape process failed.', logs });
  }
});

module.exports = router;
