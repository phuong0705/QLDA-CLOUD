// Simple auth middleware placeholder
// Expects an Authorization header with a Bearer token containing a numeric user ID for demo purposes.
// In production, replace with proper JWT verification or session checks.

module.exports = function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: missing token' });
  }
  const token = authHeader.slice('Bearer '.length).trim();
  // Very naive parsing – assume token is just the user ID number.
  const userId = parseInt(token, 10);
  if (Number.isNaN(userId) || userId <= 0) {
    return res.status(401).json({ error: 'Unauthorized: invalid token' });
  }
  // Attach minimal user info to request for downstream handlers.
  req.user = { id: userId };
  next();
};
