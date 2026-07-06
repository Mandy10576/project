const express = require('express');
const router = express.Router();
const { getProducts, getProductById } = require('../data/dbService');

// @route   GET /api/products
// @desc    Get all products (with optional search, category filter, and sorting)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { q, category, sort } = req.query;
    const products = await getProducts({ q, category, sort });
    res.json(products);
  } catch (error) {
    console.error('Fetch products error:', error);
    res.status(500).json({ message: 'Server error fetching products' });
  }
});

// @route   GET /api/products/:id
// @desc    Get a single product by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const product = await getProductById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Fetch product by ID error:', error);
    res.status(500).json({ message: 'Server error fetching product details' });
  }
});

module.exports = router;
