const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  // Get token from Authorization header
  const authHeader = req.header('Authorization');

  if (!authHeader) {
    return res.status(401).json({ message: 'No authorization token found. Access denied.' });
  }

  // Format: Bearer <token>
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ message: 'Token format must be "Bearer <token>"' });
  }

  const token = parts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'ecommerce_secret_key_change_this_in_production');
    req.user = decoded; // Decoded payload will contain user ID and email
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token. Access denied.' });
  }
};
