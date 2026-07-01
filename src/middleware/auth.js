const jwt = require('jsonwebtoken');
const db = require('../db/database');
const lineService = require('../services/line');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'photostudio_admin_secret_key_123!';

/**
 * Middleware to authenticate LINE LIFF users via access token
 */
async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' });
    }

    const token = authHeader.split(' ')[1];
    
    // Retrieve profile from LINE (mock or real)
    const profile = await lineService.getProfile(token);
    if (!profile || !profile.userId) {
      return res.status(401).json({ error: 'Unauthorized: Invalid LINE token' });
    }

    // Find user in DB
    const user = await db('users').where({ line_user_id: profile.userId }).first();
    
    req.lineProfile = profile;
    req.user = user; // Will be undefined if user is not registered yet, but route handler can handle this
    next();
  } catch (error) {
    console.error('User authentication error:', error.message);
    return res.status(401).json({ error: 'Unauthorized: Token verification failed' });
  }
}

/**
 * Middleware to authenticate admin users via JWT
 */
async function authenticateAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing admin token' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const admin = await db('users').where({ id: decoded.id, role: 'admin' }).first();
    if (!admin) {
      return res.status(403).json({ error: 'Forbidden: Access denied' });
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error('Admin authentication error:', error.message);
    return res.status(401).json({ error: 'Unauthorized: Invalid admin token' });
  }
}

module.exports = {
  authenticateUser,
  authenticateAdmin
};
