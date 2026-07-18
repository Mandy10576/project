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

router.post('/scrape', authMiddleware, adminAuth, async (req, res) => {
  const { source, categoryFilter, customUrl, customCategory } = req.body;
  const logs = [];

  // CASE 1: Custom URL Scraper
  if (customUrl) {
    logs.push(`[Scraper] Starting scrape of custom product page: ${customUrl}`);
    try {
      logs.push(`[Network] Fetching custom page content...`);
      const response = await fetch(customUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Server returned status code: ${response.status}`);
      }

      const html = await response.text();
      logs.push(`[Network] Web page successfully downloaded. Parsing DOM metadata...`);

      // Regex parser for Open Graph tags
      const getMetaTag = (property) => {
        const regex = new RegExp(`<meta[^>]*(?:property|name)=["']og:${property}["'][^>]*content=["']([^"']*)["']`, 'i');
        const match = html.match(regex);
        if (match) return match[1];

        const altRegex = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']og:${property}["']`, 'i');
        const altMatch = html.match(altRegex);
        return altMatch ? altMatch[1] : '';
      };

      // 1. Title Extraction (OG, Amazon-specific span, or generic title tag)
      const ogTitle = getMetaTag('title');
      const amazonTitleMatch = html.match(/<span[^>]*id=["']productTitle["'][^>]*>([^<]*)<\/span>/i);
      const genericTitleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);

      let title = 'Imported Product';
      if (ogTitle) {
        title = ogTitle;
      } else if (amazonTitleMatch) {
        title = amazonTitleMatch[1];
      } else if (genericTitleMatch) {
        title = genericTitleMatch[1];
      }
      
      title = title.replace(/\s+/g, ' ').trim();
      if (title.length > 250) {
        title = title.substring(0, 247) + '...';
      }

      // 2. Image Extraction (OG image, Amazon landingImage, or Amazon CDN image patterns)
      const ogImage = getMetaTag('image');
      const amazonLandingImg = html.match(/id=["']landingImage["'][^>]*src=["']([^"']*)["']/i);
      const amazonCdnImg = html.match(/["'](https:\/\/m\.media-amazon\.com\/images\/I\/[a-zA-Z0-9%_-]+\.(?:jpg|png|jpeg))["']/i);

      let imageUrl = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500';
      if (ogImage) {
        imageUrl = ogImage;
      } else if (amazonLandingImg) {
        imageUrl = amazonLandingImg[1];
      } else if (amazonCdnImg) {
        imageUrl = amazonCdnImg[1];
      }

      const description = getMetaTag('description') || 'No description extracted from page metadata.';
      const category = (customCategory || 'Imported').trim();

      // 3. Price Extraction (OG price tags, Amazon price tags, or standard price schemas)
      let price = 39.99; // Default fallback price
      const ogPrice = getMetaTag('price') || getMetaTag('price:amount');
      const amazonPrice = html.match(/<span class=["']a-price-whole["']>([^<]*)<\/span>/i);
      const genericPrice = html.match(/class=["']price["'][^>]*>([^<]*)/i);

      if (ogPrice) {
        const parsed = parseFloat(ogPrice.replace(/[^0-9.]/g, ''));
        if (!isNaN(parsed)) price = parsed;
      } else if (amazonPrice) {
        const parsed = parseFloat(amazonPrice[1].replace(/[^0-9.]/g, ''));
        if (!isNaN(parsed)) price = parsed;
      } else if (genericPrice) {
        const parsed = parseFloat(genericPrice[1].replace(/[^0-9.]/g, ''));
        if (!isNaN(parsed)) price = parsed;
      }

      // Smart currency handling: If price is in USD (less than 250), convert to INR. Otherwise keep INR.
      if (price < 250) {
        price = Math.round((price * 83.0) * 100) / 100;
      }

      const id = `scrape-custom-${Date.now()}`;
      const stock = 100;

      logs.push(`[Scraper] Successfully extracted data:`);
      logs.push(`  * Title: "${title.substring(0, 40)}${title.length > 40 ? '...' : ''}"`);
      logs.push(`  * Estimated Price: $${price.toFixed(2)}`);
      logs.push(`  * Category Tag: "${category}"`);
      logs.push(`  * Image Source: "${imageUrl.substring(0, 50)}..."`);
      
      logs.push(`[Database] Inserting product into database catalog...`);
      await pool.query(`
        INSERT INTO products (id, name, description, price, category, stock, image_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          price = EXCLUDED.price,
          category = EXCLUDED.category,
          image_url = EXCLUDED.image_url
      `, [id, title, description, price, category, stock, imageUrl]);

      logs.push(`[Success] Import complete! Product ID: ${id}`);
      return res.json({
        success: true,
        logs,
        count: 1,
        products: [{ id, name: title, price, category, imageUrl }]
      });
    } catch (err) {
      console.error('Custom scrape error:', err);
      logs.push(`[Error] Custom URL Scrape failed: ${err.message}`);
      return res.status(500).json({ success: false, message: 'Custom URL Scraper failed.', logs });
    }
  }

  // CASE 2: Feed Bulk Importer (DummyJSON or FakeStoreAPI)
  if (!source || (source !== 'dummyjson' && source !== 'fakestore')) {
    return res.status(400).json({ message: 'Invalid or missing scraper source.' });
  }

  logs.push(`[Scraper] Starting bulk scrape from feed: ${source}`);
  logs.push(`[Scraper] Category filter setting: ${categoryFilter || 'all'}`);

  try {
    let urlsToFetch = [];
    
    if (source === 'dummyjson') {
      if (categoryFilter === 'electronics') {
        urlsToFetch.push('https://dummyjson.com/products/category/smartphones');
        urlsToFetch.push('https://dummyjson.com/products/category/laptops');
      } else if (categoryFilter === 'shoes') {
        urlsToFetch.push('https://dummyjson.com/products/category/mens-shoes');
        urlsToFetch.push('https://dummyjson.com/products/category/womens-shoes');
      } else if (categoryFilter === 'clothing') {
        urlsToFetch.push('https://dummyjson.com/products/category/mens-shirts');
        urlsToFetch.push('https://dummyjson.com/products/category/womens-dresses');
      } else {
        urlsToFetch.push('https://dummyjson.com/products?limit=15');
      }
    } else {
      // FakeStore API
      if (categoryFilter === 'electronics') {
        urlsToFetch.push('https://fakestoreapi.com/products/category/electronics');
      } else if (categoryFilter === 'clothing') {
        urlsToFetch.push("https://fakestoreapi.com/products/category/men's clothing");
        urlsToFetch.push("https://fakestoreapi.com/products/category/women's clothing");
      } else if (categoryFilter === 'shoes') {
        logs.push(`[Info] FakeStore API has no shoes category. Importing Jewelry as placeholder accessories...`);
        urlsToFetch.push('https://fakestoreapi.com/products/category/jewelery');
      } else {
        urlsToFetch.push('https://fakestoreapi.com/products?limit=15');
      }
    }

    let rawProducts = [];
    for (const fetchUrl of urlsToFetch) {
      logs.push(`[Network] Fetching: ${fetchUrl}`);
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`Feed request failed for URL: ${fetchUrl} (${response.status})`);
      }
      
      const feedData = await response.json();
      if (source === 'dummyjson') {
        rawProducts = rawProducts.concat(feedData.products || []);
      } else {
        rawProducts = rawProducts.concat(feedData || []);
      }
    }

    logs.push(`[Scraper] Retrieved ${rawProducts.length} items from feed. Commencing database imports...`);
    const importedList = [];

    for (const item of rawProducts) {
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
        price = Math.round((parseFloat(item.price) || 29.99) * 83.0 * 100) / 100;
        
        // Map category nice labels
        if (item.category === 'smartphones' || item.category === 'laptops') {
          category = 'Electronics';
        } else if (item.category === 'mens-shoes' || item.category === 'womens-shoes') {
          category = 'Shoes';
        } else if (item.category === 'mens-shirts' || item.category === 'womens-dresses') {
          category = 'Clothing';
        } else {
          category = item.category || 'Accessories';
        }

        stock = parseInt(item.stock, 10) || 50;
        imageUrl = item.thumbnail || item.images?.[0] || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500';
      } else {
        id = `scrape-fs-${item.id}`;
        name = item.title;
        description = item.description || 'No description provided.';
        price = Math.round((parseFloat(item.price) || 29.99) * 83.0 * 100) / 100;
        
        // Map category nice labels
        if (item.category === 'electronics') {
          category = 'Electronics';
        } else if (item.category === "men's clothing" || item.category === "women's clothing") {
          category = 'Clothing';
        } else if (item.category === 'jewelery') {
          category = 'Accessories';
        } else {
          category = item.category || 'Accessories';
        }
        
        stock = 80;
        imageUrl = item.image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500';
      }

      if (name.length > 250) {
        name = name.substring(0, 247) + '...';
      }

      logs.push(`[Database] Upserting: "${name.substring(0, 25)}..."`);
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
    console.error('Bulk scrape error:', err);
    logs.push(`[Error] Scraper process aborted: ${err.message}`);
    res.status(500).json({ success: false, message: 'Scrape process failed.', logs });
  }
});

module.exports = router;
