const { getUserById } = require('../data/dbService');

module.exports = async function (req, res, next) {
  try {
    const user = await getUserById(req.user.id);
    if (!user || !user.isAdmin) {
      return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
    }
    next();
  } catch (error) {
    console.error('Admin middleware error:', error);
    res.status(500).json({ message: 'Server error verifying admin status.' });
  }
};
