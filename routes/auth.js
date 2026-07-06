const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getUserByEmail, getUserById, createUser } = require('../data/dbService');
const authMiddleware = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'ecommerce_secret_key_change_this_in_production';

// @route   POST /api/auth/signup
// @desc    Register a new user
// @access  Public
router.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;

  // Basic validation
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Please enter all fields (name, email, password)' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  }

  try {
    // Check if user already exists
    const userExists = await getUserByEmail(email);
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Save to database
    const newUser = await createUser({
      id: `user-${Date.now()}`,
      name,
      email: email.toLowerCase(),
      password: hashedPassword
    });

    // Create JWT payload & sign token
    const payload = {
      id: newUser.id,
      email: newUser.email
    };

    jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
      if (err) throw err;
      res.status(201).json({
        token,
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email
        }
      });
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error during signup' });
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Basic validation
  if (!email || !password) {
    return res.status(400).json({ message: 'Please enter both email and password' });
  }

  try {
    // Find user
    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Create JWT payload & sign token
    const payload = {
      id: user.id,
      email: user.email
    };

    jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
      if (err) throw err;
      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email
        }
      });
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// @route   GET /api/auth/profile
// @desc    Get current user profile (Protected)
// @access  Private
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ message: 'Server error fetching profile' });
  }
});

module.exports = router;
