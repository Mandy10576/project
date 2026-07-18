const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('⚠️ WARNING: DATABASE_URL is not set in your environment variables. Please add it to your .env file.');
}

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false // Required for Neon serverless postgres connections
  }
});

// Default products to seed the database
const DEFAULT_PRODUCTS = [
  {
    id: "prod-1",
    name: "iPhone 15 Pro",
    description: "Experience the ultimate iPhone with titanium design, A17 Pro chip, and a powerful camera system.",
    price: 999.99,
    category: "Electronics",
    stock: 50,
    imageUrl: "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=500&auto=format&fit=crop&q=60"
  },
  {
    id: "prod-2",
    name: "Sony WH-1000XM5 Wireless Headphones",
    description: "Industry-leading noise canceling wireless over-ear headphones with exceptional sound and call quality.",
    price: 349.99,
    category: "Audio",
    stock: 30,
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60"
  },
  {
    id: "prod-3",
    name: "Nike Air Max 270",
    description: "Nike's first lifestyle Air Max brings you style, comfort and big attitude with every step.",
    price: 150.00,
    category: "Footwear",
    stock: 100,
    imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&auto=format&fit=crop&q=60"
  },
  {
    id: "prod-4",
    name: "Mechanical Gaming Keyboard",
    description: "Tactile mechanical switches, customizable RGB backlighting, and durable aluminum top plate.",
    price: 89.99,
    category: "Electronics",
    stock: 75,
    imageUrl: "https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=500&auto=format&fit=crop&q=60"
  },
  {
    id: "prod-5",
    name: "Minimalist Leather Wallet",
    description: "Handcrafted full-grain leather wallet with RFID blocking, designed to hold up to 10 cards and cash.",
    price: 39.99,
    category: "Accessories",
    stock: 150,
    imageUrl: "https://images.unsplash.com/photo-1601597111158-2fceff292cdc?w=500&auto=format&fit=crop&q=60"
  },
  {
    id: "prod-6",
    name: "Ergonomic Office Chair",
    description: "High-back mesh chair with adjustable lumbar support, 3D armrests, and dynamic recline.",
    price: 249.50,
    category: "Furniture",
    stock: 20,
    imageUrl: "https://images.unsplash.com/photo-1505797149-43b0069ec26b?w=500&auto=format&fit=crop&q=60"
  }
];

// Initialize database tables & seed products
async function initDb() {
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is missing. Please define it in your environment configurations (e.g. .env file or Render Environment variables).');
  }

  const client = await pool.connect();
  try {
    console.log('🔄 Connected to PostgreSQL database. Initializing tables...');

    // 1. Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure is_admin column exists
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE
    `);

    // 2. Products Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price NUMERIC(10, 2) NOT NULL,
        category VARCHAR(50) NOT NULL,
        stock INTEGER NOT NULL,
        image_url TEXT
      )
    `);

    // 3. Cart Items Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        product_id VARCHAR(50) REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL,
        PRIMARY KEY (user_id, product_id)
      )
    `);

    // 4. Orders Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) REFERENCES users(id) ON DELETE CASCADE,
        total_price NUMERIC(10, 2) NOT NULL,
        shipping_address TEXT NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'Processing',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. Order Items Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(50) REFERENCES orders(id) ON DELETE CASCADE,
        product_id VARCHAR(50),
        name VARCHAR(100) NOT NULL,
        price NUMERIC(10, 2) NOT NULL,
        image_url TEXT,
        quantity INTEGER NOT NULL,
        item_total NUMERIC(10, 2) NOT NULL
      )
    `);

    // 6. Email OTPs Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS email_otps (
        email VARCHAR(100) PRIMARY KEY,
        otp VARCHAR(6) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Tables checked/created successfully.');

    // Increase name column capacity to VARCHAR(255) for long custom products
    await client.query(`
      ALTER TABLE products ALTER COLUMN name TYPE VARCHAR(255);
    `);

    // Grant Admin permissions automatically to mandeeprao10576@gmail.com
    await client.query(`
      UPDATE users 
      SET is_admin = TRUE 
      WHERE LOWER(email) = 'mandeeprao10576@gmail.com'
    `);

    // Seed products if table is empty
    const productCheck = await client.query('SELECT COUNT(*) FROM products');
    const productCount = parseInt(productCheck.rows[0].count, 10);
    
    if (productCount === 0) {
      console.log('🌱 Seeding database with default products...');
      for (const p of DEFAULT_PRODUCTS) {
        await client.query(
          `INSERT INTO products (id, name, description, price, category, stock, image_url) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [p.id, p.name, p.description, p.price, p.category, p.stock, p.imageUrl]
        );
      }
      console.log('✅ Default products seeded.');
    } else {
      console.log('ℹ️ Products table already seeded.');
    }

    // Correct the wallet image if it's using the deleted Unsplash URL
    await client.query(`
      UPDATE products 
      SET image_url = 'https://images.unsplash.com/photo-1601597111158-2fceff292cdc?w=500&auto=format&fit=crop&q=60'
      WHERE id = 'prod-5' AND (image_url IS NULL OR image_url LIKE '%photo-1627124718185%')
    `);

  } catch (err) {
    console.error('❌ Error during database initialization:', err);
    throw err;
  } finally {
    client.release();
  }
}

// ==========================================
// USER DATABASE METHODS
// ==========================================

async function getUserByEmail(email) {
  const { rows } = await pool.query(
    'SELECT id, name, email, password, is_admin AS "isAdmin", created_at AS "createdAt" FROM users WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  return rows[0] || null;
}

async function getUserById(id) {
  const { rows } = await pool.query(
    'SELECT id, name, email, is_admin AS "isAdmin", created_at AS "createdAt" FROM users WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function createUser({ id, name, email, password }) {
  const { rows } = await pool.query(
    `INSERT INTO users (id, name, email, password) 
     VALUES ($1, $2, $3, $4) 
     RETURNING id, name, email, is_admin AS "isAdmin", created_at AS "createdAt"`,
    [id, name, email.toLowerCase(), password]
  );
  return rows[0];
}

// ==========================================
// PRODUCTS DATABASE METHODS
// ==========================================

async function getProducts({ q, category, sort } = {}) {
  let queryText = 'SELECT id, name, description, price::float, category, stock, image_url AS "imageUrl" FROM products';
  const queryParams = [];
  const conditions = [];

  if (category) {
    queryParams.push(category);
    conditions.push(`LOWER(category) = LOWER($${queryParams.length})`);
  }

  if (q) {
    queryParams.push(`%${q.toLowerCase()}%`);
    const paramIdx = queryParams.length;
    conditions.push(`(LOWER(name) LIKE $${paramIdx} OR LOWER(description) LIKE $${paramIdx})`);
  }

  if (conditions.length > 0) {
    queryText += ' WHERE ' + conditions.join(' AND ');
  }

  if (sort) {
    if (sort === 'price-asc') {
      queryText += ' ORDER BY price ASC';
    } else if (sort === 'price-desc') {
      queryText += ' ORDER BY price DESC';
    } else if (sort === 'name-asc') {
      queryText += ' ORDER BY name ASC';
    } else if (sort === 'name-desc') {
      queryText += ' ORDER BY name DESC';
    }
  }

  const { rows } = await pool.query(queryText, queryParams);
  return rows;
}

async function getProductById(id) {
  const { rows } = await pool.query(
    'SELECT id, name, description, price::float, category, stock, image_url AS "imageUrl" FROM products WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

// ==========================================
// CART DATABASE METHODS
// ==========================================

async function getCart(userId) {
  const query = `
    SELECT 
      c.product_id AS "productId",
      c.quantity,
      p.name,
      p.description,
      p.price::float,
      p.category,
      p.stock,
      p.image_url AS "imageUrl"
    FROM cart_items c
    JOIN products p ON c.product_id = p.id
    WHERE c.user_id = $1
  `;
  const { rows } = await pool.query(query, [userId]);

  let totalPrice = 0;
  const items = rows.map(row => {
    const itemTotal = Number((row.price * row.quantity).toFixed(2));
    totalPrice += itemTotal;
    return {
      product: {
        id: row.productId,
        name: row.name,
        description: row.description,
        price: row.price,
        category: row.category,
        stock: row.stock,
        imageUrl: row.imageUrl
      },
      quantity: row.quantity,
      itemTotal
    };
  });

  return {
    items,
    totalPrice: Number(totalPrice.toFixed(2))
  };
}

async function addToCart(userId, productId, quantity) {
  // We use ON CONFLICT to upsert the quantity
  await pool.query(
    `INSERT INTO cart_items (user_id, product_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id)
     DO UPDATE SET quantity = cart_items.quantity + $3`,
    [userId, productId, quantity]
  );
  return getCart(userId);
}

async function updateCartItemQuantity(userId, productId, quantity) {
  await pool.query(
    'UPDATE cart_items SET quantity = $3 WHERE user_id = $1 AND product_id = $2',
    [userId, productId, quantity]
  );
  return getCart(userId);
}

async function removeCartItem(userId, productId) {
  await pool.query(
    'DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2',
    [userId, productId]
  );
  return getCart(userId);
}

async function clearCart(userId) {
  await pool.query(
    'DELETE FROM cart_items WHERE user_id = $1',
    [userId]
  );
  return { items: [], totalPrice: 0 };
}

// ==========================================
// ORDER DATABASE METHODS
// ==========================================

async function createOrder(userId, shippingAddress, paymentMethod) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch current cart items and join with products for stock and price validation
    const cartQuery = `
      SELECT 
        c.product_id AS "productId",
        c.quantity,
        p.name,
        p.price::float,
        p.stock,
        p.image_url AS "imageUrl"
      FROM cart_items c
      JOIN products p ON c.product_id = p.id
      WHERE c.user_id = $1
      FOR UPDATE -- Lock rows to prevent stock race conditions
    `;
    const { rows: cartItems } = await client.query(cartQuery, [userId]);

    if (cartItems.length === 0) {
      throw new Error('Cannot place order. Your cart is empty.');
    }

    // 2. Validate stock for all items
    let totalPrice = 0;
    const orderItems = [];

    for (const item of cartItems) {
      if (item.stock < item.quantity) {
        throw new Error(`Insufficient stock for product "${item.name}". Requested: ${item.quantity}, Available: ${item.stock}`);
      }
      const itemTotal = Number((item.price * item.quantity).toFixed(2));
      totalPrice += itemTotal;
      orderItems.push({
        ...item,
        itemTotal
      });
    }

    // 3. Deduct stock for products and update products table
    for (const item of orderItems) {
      await client.query(
        'UPDATE products SET stock = stock - $1 WHERE id = $2',
        [item.quantity, item.productId]
      );
    }

    // 4. Create order entry
    const orderId = `order-${Date.now()}`;
    const orderQuery = `
      INSERT INTO orders (id, user_id, total_price, shipping_address, payment_method, status)
      VALUES ($1, $2, $3, $4, $5, 'Processing')
      RETURNING id, user_id AS "userId", total_price::float AS "totalPrice", shipping_address AS "shippingAddress", payment_method AS "paymentMethod", status, created_at AS "createdAt"
    `;
    const { rows: orderRows } = await client.query(orderQuery, [
      orderId,
      userId,
      totalPrice,
      shippingAddress || '123 Main St, City, Country',
      paymentMethod || 'Card'
    ]);
    const createdOrder = orderRows[0];

    // 5. Create order items entries
    for (const item of orderItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, name, price, image_url, quantity, item_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [orderId, item.productId, item.name, item.price, item.imageUrl, item.quantity, item.itemTotal]
      );
    }

    // 6. Clear user cart
    await client.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);

    await client.query('COMMIT');

    createdOrder.items = orderItems.map(item => ({
      productId: item.productId,
      name: item.name,
      price: item.price,
      imageUrl: item.imageUrl,
      quantity: item.quantity,
      itemTotal: item.itemTotal
    }));

    return createdOrder;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getOrders(userId) {
  // Fetch orders
  const { rows: orders } = await pool.query(
    'SELECT id, user_id AS "userId", total_price::float AS "totalPrice", shipping_address AS "shippingAddress", payment_method AS "paymentMethod", status, created_at AS "createdAt" FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );

  // Fetch items for each order
  for (const order of orders) {
    const { rows: items } = await pool.query(
      'SELECT product_id AS "productId", name, price::float, image_url AS "imageUrl", quantity, item_total::float AS "itemTotal" FROM order_items WHERE order_id = $1',
      [order.id]
    );
    order.items = items;
  }

  return orders;
}

async function getOrderById(orderId, userId) {
  const { rows: orderRows } = await pool.query(
    'SELECT id, user_id AS "userId", total_price::float AS "totalPrice", shipping_address AS "shippingAddress", payment_method AS "paymentMethod", status, created_at AS "createdAt" FROM orders WHERE id = $1 AND user_id = $2',
    [orderId, userId]
  );
  
  const order = orderRows[0];
  if (!order) return null;

  const { rows: items } = await pool.query(
    'SELECT product_id AS "productId", name, price::float, image_url AS "imageUrl", quantity, item_total::float AS "itemTotal" FROM order_items WHERE order_id = $1',
    [orderId]
  );
  order.items = items;

  return order;
}

module.exports = {
  pool,
  initDb,
  getUserByEmail,
  getUserById,
  createUser,
  getProducts,
  getProductById,
  getCart,
  addToCart,
  updateCartItemQuantity,
  removeCartItem,
  clearCart,
  createOrder,
  getOrders,
  getOrderById
};
