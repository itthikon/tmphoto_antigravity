const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { authenticateUser } = require('../middleware/auth');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'photostudio_admin_secret_key_123!';

/**
 * GET /api/auth/me
 * Check if the LIFF user is registered, and return their profile + package info
 */
router.get('/me', authenticateUser, async (req, res) => {
  try {
    if (!req.user) {
      // User is authenticated via LINE, but not yet registered in our DB
      return res.status(200).json({ 
        registered: false, 
        lineProfile: req.lineProfile 
      });
    }

    // Retrieve active package details
    const userPackage = await db('user_packages')
      .join('packages', 'user_packages.package_id', 'packages.id')
      .where({ 'user_packages.user_id': req.user.id })
      .select(
        'packages.id as package_id',
        'packages.name as package_name',
        'packages.type as package_type',
        'packages.price as package_price',
        'packages.photo_price',
        'packages.description',
        'user_packages.amount_paid',
        'user_packages.status as package_status'
      )
      .first();

    return res.status(200).json({
      registered: true,
      user: {
        id: req.user.id,
        display_name: req.user.display_name,
        phone: req.user.phone,
        email: req.user.email,
        role: req.user.role
      },
      package: userPackage || null,
      lineProfile: req.lineProfile
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/auth/register
 * Register a new LIFF user and assign an initial package
 */
router.post('/register', authenticateUser, async (req, res) => {
  const { display_name, phone, email, package_id } = req.body;

  if (!display_name || !phone || !email || !package_id) {
    return res.status(400).json({ error: 'Missing required registration fields' });
  }

  if (req.user) {
    return res.status(400).json({ error: 'User is already registered' });
  }

  const trx = await db.transaction();
  try {
    // 1. Create user
    const [userId] = await trx('users').insert({
      line_user_id: req.lineProfile.userId,
      display_name,
      phone,
      email,
      role: 'user'
    });

    // 2. Fetch package details
    const selectedPackage = await trx('packages').where({ id: package_id, is_active: true }).first();
    if (!selectedPackage) {
      await trx.rollback();
      return res.status(400).json({ error: 'Invalid or inactive package selected' });
    }

    const packagePrice = parseFloat(selectedPackage.price);

    if (packagePrice > 0) {
      // Package has cost: create user_package as pending
      await trx('user_packages').insert({
        user_id: userId,
        package_id: selectedPackage.id,
        amount_paid: 0.00,
        status: 'pending' // pending payment approval
      });

      // Create a pending payment log
      await trx('payments').insert({
        user_id: userId,
        amount: packagePrice,
        payment_type: 'package_purchase',
        status: 'pending',
        details: JSON.stringify({ package_id: selectedPackage.id })
      });
    } else {
      // Free package (if any): active immediately
      await trx('user_packages').insert({
        user_id: userId,
        package_id: selectedPackage.id,
        amount_paid: 0.00,
        status: 'active'
      });
    }

    await trx.commit();
    
    // Retrieve newly created user
    const newUser = await db('users').where({ id: userId }).first();
    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: newUser
    });
  } catch (error) {
    await trx.rollback();
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Failed to complete registration' });
  }
});

/**
 * POST /api/auth/admin/login
 * Standard admin credential login (returns JWT)
 */
router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  try {
    const admin = await db('users').where({ email, role: 'admin' }).first();
    if (!admin) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      token,
      admin: {
        id: admin.id,
        display_name: admin.display_name,
        email: admin.email
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
});

module.exports = router;
