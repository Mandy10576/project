const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { pool, getUserByEmail, getUserById, createUser } = require('../data/dbService');
const authMiddleware = require('../middleware/auth');
const { OAuth2Client } = require('google-auth-library');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '343304830383-24ol8p9pp01ndnl33gr31h2848n9o4p2.apps.googleusercontent.com';
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

const JWT_SECRET = process.env.JWT_SECRET || 'ecommerce_secret_key_change_this_in_production';

// Helper to configure standard transporter
const getTransporter = () => {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return null;
};

// @route   POST /api/auth/send-otp
// @desc    Generate and send 6-digit OTP code to email
// @access  Public
router.post('/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Please enter your email address' });
  }

  try {
    // Check if user already exists
    const userExists = await getUserByEmail(email);
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email address' });
    }

    // Generate random 6-digit verification code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store/update verification code in email_otps table
    await pool.query(`
      INSERT INTO email_otps (email, otp, created_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (email)
      DO UPDATE SET otp = EXCLUDED.otp, created_at = CURRENT_TIMESTAMP
    `, [email.toLowerCase(), otp]);

    const transporter = getTransporter();

    if (transporter) {
      const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME || 'AETHER Shop'}" <${process.env.SMTP_USER}>`,
        to: email.toLowerCase(),
        subject: '🔒 AETHER Registration Verification Code',
        text: `Your account verification code is: ${otp}. It will expire in 10 minutes.`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #0d0e15; color: #ffffff; border-radius: 12px; border: 1px solid #1f2d3d; max-width: 500px; margin: auto;">
            <h2 style="color: #00f2fe; text-align: center; border-bottom: 1px solid #1f2d3d; padding-bottom: 10px; font-family: 'Outfit', sans-serif;">AETHER SECURITY CORE</h2>
            <p style="font-size: 0.95rem; line-height: 1.5;">Hello,</p>
            <p style="font-size: 0.95rem; line-height: 1.5;">Thank you for registering. Enter the verification code below on the signup screen to create your account:</p>
            <div style="background-color: #07080d; padding: 15px; border-radius: 8px; text-align: center; font-size: 24px; font-weight: bold; color: #00f2fe; letter-spacing: 5px; margin: 20px 0; border: 1px dashed var(--border-glass);">
              ${otp}
            </div>
            <p style="font-size: 0.8rem; color: #8f9cae; text-align: center;">This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`✉️ Real OTP email sent successfully to: ${email}`);
      return res.json({ success: true, message: 'Verification OTP sent to your email.' });
    } else {
      // Sandbox fallback mode: print code to terminal and output file
      console.log(`\n========================================`);
      console.log(`🔑 [OTP Sandbox Mock Mode]`);
      console.log(`Recipient: ${email}`);
      console.log(`Verification OTP Code: ${otp}`);
      console.log(`========================================\n`);

      const fs = require('fs');
      fs.writeFileSync('otp-code.txt', `Email: ${email}\nOTP Code: ${otp}\nGenerated At: ${new Date().toLocaleString()}`);

      return res.json({
        success: true,
        mockMode: true,
        message: 'OTP generated! (Sandbox Mode: code printed in server terminal and saved to otp-code.txt file).'
      });
    }

  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ message: 'Server error generating OTP verification code' });
  }
});

// @route   POST /api/auth/signup
// @desc    Register a new user (OTP Required)
// @access  Public
router.post('/signup', async (req, res) => {
  const { name, email, password, otp } = req.body;

  // Basic validation
  if (!name || !email || !password || !otp) {
    return res.status(400).json({ message: 'Please enter all fields including verification code (otp)' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  }

  try {
    // 1. Fetch OTP row
    const { rows: otpRows } = await pool.query(
      'SELECT otp, created_at FROM email_otps WHERE email = $1',
      [email.toLowerCase()]
    );

    if (otpRows.length === 0) {
      return res.status(400).json({ message: 'Verification code not found or expired. Please request a new OTP.' });
    }

    const { otp: storedOtp, created_at: createdAt } = otpRows[0];

    // Check if matching
    if (storedOtp !== otp.trim()) {
      return res.status(400).json({ message: 'Invalid verification code. Please check and try again.' });
    }

    // Check if expired (10 minutes)
    const timeDiff = Date.now() - new Date(createdAt).getTime();
    if (timeDiff > 10 * 60 * 1000) {
      await pool.query('DELETE FROM email_otps WHERE email = $1', [email.toLowerCase()]);
      return res.status(400).json({ message: 'Verification code has expired. Please request a new OTP.' });
    }

    // Clear verification code
    await pool.query('DELETE FROM email_otps WHERE email = $1', [email.toLowerCase()]);

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
          email: newUser.email,
          isAdmin: newUser.isAdmin
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
          email: user.email,
          isAdmin: user.isAdmin
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

// @route   POST /api/auth/google
// @desc    Authenticate or register user with Google OAuth Token
// @access  Public
router.post('/google', async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: 'Google ID Token is missing.' });
  }

  try {
    // 1. Verify Google ID token
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: GOOGLE_CLIENT_ID,
      maxExpiry: 3900 // 65-minute buffer to account for minor system clock skew
    });

    const payload = ticket.getPayload();
    const { email, name } = payload;

    if (!email) {
      return res.status(400).json({ message: 'Google account does not provide an email address.' });
    }

    // 2. Check if user already exists
    let user = await getUserByEmail(email);

    if (!user) {
      // 3. Register user if they do not exist
      const generatedPassword = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(generatedPassword, salt);

      user = await createUser({
        id: `user-${Date.now()}`,
        name: name || 'Google User',
        email: email.toLowerCase(),
        password: hashedPassword
      });
    }

    // 4. Issue custom JWT for the user session
    const jwtPayload = {
      id: user.id,
      email: user.email
    };

    jwt.sign(jwtPayload, JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
      if (err) throw err;
      res.json({
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          isAdmin: user.isAdmin
        }
      });
    });

  } catch (error) {
    console.error('Google Auth validation error:', error);
    res.status(400).json({ message: `Invalid Google login attempt: ${error.message}` });
  }
});

module.exports = router;
