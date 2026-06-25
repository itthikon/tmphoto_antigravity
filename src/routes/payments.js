const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/database');
const { authenticateUser } = require('../middleware/auth');

// Setup storage folder for payment slips
const slipsDir = path.resolve(process.cwd(), './public/slips');
if (!fs.existsSync(slipsDir)) {
  fs.mkdirSync(slipsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, slipsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'slip-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    const filetypes = /jpeg|jpg|png/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only JPEG, JPG, and PNG images are allowed'));
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

/**
 * POST /api/payments/upload-slip
 * Upload slip image for a pending payment
 */
router.post('/upload-slip', authenticateUser, upload.single('slip'), async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: User not registered' });
  }

  const { payment_id } = req.body;
  if (!payment_id) {
    return res.status(400).json({ error: 'Missing payment_id' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No slip file uploaded' });
  }

  try {
    // Check if payment belongs to user and is pending
    const payment = await db('payments')
      .where({ id: payment_id, user_id: req.user.id })
      .first();

    if (!payment) {
      // Remove uploaded file if payment record not found
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Payment transaction record not found' });
    }

    if (payment.status !== 'pending') {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Payment has already been processed' });
    }

    const relativeUrl = `/slips/${req.file.filename}`;

    // Update payment record with slip URL
    await db('payments')
      .where({ id: payment_id })
      .update({
        slip_image_url: relativeUrl,
        updated_at: db.fn.now()
      });

    return res.status(200).json({
      success: true,
      message: 'Slip uploaded successfully. Waiting for admin verification.',
      slip_url: relativeUrl
    });
  } catch (error) {
    console.error('Error uploading slip:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/payments/pending
 * Get all pending payments for the logged-in user
 */
router.get('/pending', authenticateUser, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const pendingPayments = await db('payments')
      .where({ user_id: req.user.id, status: 'pending' })
      .orderBy('created_at', 'desc');

    return res.status(200).json(pendingPayments);
  } catch (error) {
    console.error('Error fetching pending payments:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
