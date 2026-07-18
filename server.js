const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS (Cross-Origin Resource Sharing)
app.use(cors());

// Parse incoming JSON requests
app.use(express.json());

// Serve Static Frontend Files
app.use(express.static(path.join(__dirname, 'public')));

// Import Route modules
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');
const paymentRoutes = require('./routes/payment');

// Register Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment', paymentRoutes);

// Serves API documentation at /api
app.get('/api', (req, res) => {
  res.json({
    message: "Welcome to the E-Commerce Backend API",
    status: "Running",
    documentation: {
      auth: {
        signup: "POST /api/auth/signup (Body: name, email, password)",
        login: "POST /api/auth/login (Body: email, password)",
        profile: "GET /api/auth/profile (Headers: Authorization: Bearer <token>)"
      },
      products: {
        list: "GET /api/products (Query params: q, category, sort[price-asc|price-desc|name-asc|name-desc])",
        detail: "GET /api/products/:id"
      },
      cart: {
        view: "GET /api/cart (Headers: Authorization: Bearer <token>)",
        add: "POST /api/cart (Body: productId, quantity) (Headers: Authorization: Bearer <token>)",
        update: "PUT /api/cart/:productId (Body: quantity) (Headers: Authorization: Bearer <token>)",
        delete: "DELETE /api/cart/:productId (Headers: Authorization: Bearer <token>)",
        clear: "POST /api/cart/clear (Headers: Authorization: Bearer <token>)"
      },
      orders: {
        place: "POST /api/orders (Body: shippingAddress, paymentMethod) (Headers: Authorization: Bearer <token>)",
        list: "GET /api/orders (Headers: Authorization: Bearer <token>)",
        detail: "GET /api/orders/:id (Headers: Authorization: Bearer <token>)"
      }
    }
  });
});

// 404 Route handler for API endpoints
app.use('/api/*', (req, res) => {
  res.status(404).json({ message: "API Endpoint not found" });
});

// Fallback to index.html for all other routes (SPA routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong on the server!' });
});

// Initialize database and start server
const { initDb } = require('./data/dbService');

async function startServer() {
  try {
    // Try to initialize database first
    await initDb();
    
    app.listen(PORT, () => {
      console.log(`=========================================`);
      console.log(`🚀 Server started on port: ${PORT}`);
      console.log(`📄 API Specs: http://localhost:${PORT}/`);
      console.log(`=========================================`);
    });
  } catch (err) {
    console.error('❌ Failed to start server due to database initialization error:', err);
    process.exit(1);
  }
}

startServer();

