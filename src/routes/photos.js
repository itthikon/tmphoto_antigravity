const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const db = require('../db/database');
const { authenticateUser } = require('../middleware/auth');
const cloudflareR2Service = require('../services/cloudflareR2');

// Create previews directory if not exists
const previewsDir = path.resolve(process.cwd(), './src/db/previews');
if (!fs.existsSync(previewsDir)) {
  fs.mkdirSync(previewsDir, { recursive: true });
}

/**
 * GET /api/photos
 * Fetch photo catalog for the logged-in user
 */
router.get('/', authenticateUser, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: User not registered' });
  }

  try {
    // 1. Get user's package type
    const userPkg = await db('user_packages')
      .join('packages', 'user_packages.package_id', 'packages.id')
      .where({ 'user_packages.user_id': req.user.id })
      .select('packages.type as type')
      .first();

    const isFlatRate = userPkg && userPkg.type === 'flat';

    // 2. Fetch all photos uploaded for this user
    const photos = await db('photos')
      .where({ user_id: req.user.id })
      .orderBy('created_at', 'desc');

    // Add download flag based on package or status
    const formattedPhotos = photos.map(photo => {
      const isPurchased = photo.status === 'purchased' || isFlatRate;
      return {
        id: photo.id,
        filename: photo.filename,
        status: photo.status,
        can_download: isPurchased,
        created_at: photo.created_at
      };
    });

    return res.status(200).json(formattedPhotos);
  } catch (error) {
    console.error('Error fetching photos:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/photos/preview/:id
 * Securely streams the low-res watermarked preview of a photo
 */
router.get('/preview/:id', authenticateUser, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.params;

  try {
    const photo = await db('photos').where({ id, user_id: req.user.id }).first();
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    const previewPath = path.join(previewsDir, `preview-${photo.id}.jpg`);
    if (!fs.existsSync(previewPath)) {
      return res.status(404).json({ error: 'Preview not generated yet' });
    }

    return res.sendFile(previewPath);
  } catch (error) {
    console.error('Error streaming preview:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/photos/download/:id
 * Securely streams the original high-resolution photo from Google Drive
 */
router.get('/download/:id', authenticateUser, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.params;

  try {
    const photo = await db('photos').where({ id, user_id: req.user.id }).first();
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Check if user has permission to download (either flat-rate or photo is purchased)
    const userPkg = await db('user_packages')
      .join('packages', 'user_packages.package_id', 'packages.id')
      .where({ 'user_packages.user_id': req.user.id })
      .select('packages.type as type')
      .first();

    const isFlatRate = userPkg && userPkg.type === 'flat';
    const isPurchased = photo.status === 'purchased' || isFlatRate;

    if (!isPurchased) {
      return res.status(403).json({ error: 'Forbidden: Photo must be purchased before download' });
    }

    // Stream from Cloudflare R2
    const stream = await cloudflareR2Service.getFileStream(photo.storage_key);
    
    res.setHeader('Content-disposition', `attachment; filename="${photo.filename}"`);
    res.setHeader('Content-type', 'image/jpeg');
    
    stream.pipe(res);
  } catch (error) {
    console.error('Error downloading photo:', error);
    return res.status(500).json({ error: 'Failed to download photo' });
  }
});

/**
 * GET /api/photos/cart
 * Get current shopping cart items
 */
router.get('/cart', authenticateUser, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const cartItems = await db('cart')
      .join('photos', 'cart.photo_id', 'photos.id')
      .where({ 'cart.user_id': req.user.id })
      .select('photos.id', 'photos.filename', 'photos.status');

    return res.status(200).json(cartItems);
  } catch (error) {
    console.error('Error fetching cart:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/photos/cart/add
 * Add a watermarked photo to cart
 */
router.post('/cart/add', authenticateUser, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { photo_id } = req.body;
  if (!photo_id) {
    return res.status(400).json({ error: 'Missing photo_id' });
  }

  try {
    // 1. Verify photo belongs to user and is not purchased
    const photo = await db('photos').where({ id: photo_id, user_id: req.user.id }).first();
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    if (photo.status === 'purchased') {
      return res.status(400).json({ error: 'Photo is already purchased' });
    }

    // 2. Check if already in cart
    const exists = await db('cart').where({ user_id: req.user.id, photo_id }).first();
    if (exists) {
      return res.status(400).json({ error: 'Photo is already in the cart' });
    }

    // 3. Add to cart
    await db('cart').insert({ user_id: req.user.id, photo_id });

    return res.status(200).json({ success: true, message: 'Photo added to cart' });
  } catch (error) {
    console.error('Error adding to cart:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/photos/cart/remove
 * Remove a photo from cart
 */
router.post('/cart/remove', authenticateUser, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { photo_id } = req.body;
  if (!photo_id) {
    return res.status(400).json({ error: 'Missing photo_id' });
  }

  try {
    await db('cart').where({ user_id: req.user.id, photo_id }).del();
    return res.status(200).json({ success: true, message: 'Photo removed from cart' });
  } catch (error) {
    console.error('Error removing from cart:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/photos/checkout
 * Checkout items in cart, calculate amount and create payment request
 */
router.post('/checkout', authenticateUser, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const trx = await db.transaction();
  try {
    // 1. Fetch cart items
    const cartItems = await trx('cart')
      .join('photos', 'cart.photo_id', 'photos.id')
      .where({ 'cart.user_id': req.user.id })
      .select('photos.id', 'photos.filename', 'photos.status');

    if (cartItems.length === 0) {
      await trx.rollback();
      return res.status(400).json({ error: 'Your cart is empty' });
    }

    // Ensure none of the items are already purchased
    const invalidItems = cartItems.filter(item => item.status === 'purchased');
    if (invalidItems.length > 0) {
      await trx.rollback();
      return res.status(400).json({ error: 'Some photos in your cart have already been purchased' });
    }

    // 2. Fetch user's package pricing
    const userPkg = await trx('user_packages')
      .join('packages', 'user_packages.package_id', 'packages.id')
      .where({ 'user_packages.user_id': req.user.id })
      .select('packages.photo_price', 'packages.type')
      .first();

    if (!userPkg) {
      await trx.rollback();
      return res.status(400).json({ error: 'User does not have an active package' });
    }

    if (userPkg.type === 'flat') {
      await trx.rollback();
      return res.status(400).json({ error: 'Flat-rate package users do not need to buy individual photos' });
    }

    // Calculate total price
    const pricePerPhoto = parseFloat(userPkg.photo_price || '10.00');
    const totalAmount = cartItems.length * pricePerPhoto;

    // 3. Create pending payment record
    const photoIds = cartItems.map(item => item.id);
    const [paymentId] = await trx('payments').insert({
      user_id: req.user.id,
      amount: totalAmount,
      payment_type: 'photo_purchase',
      status: 'pending',
      details: JSON.stringify({ photo_ids: photoIds })
    });

    // 4. Update photo statuses to 'selected' (awaiting payment)
    await trx('photos')
      .whereIn('id', photoIds)
      .update({ status: 'selected' });

    // 5. Empty the cart
    await trx('cart').where({ user_id: req.user.id }).del();

    await trx.commit();

    return res.status(200).json({
      success: true,
      message: 'Checkout successful. Please submit the payment slip.',
      paymentId,
      amount: totalAmount,
      itemCount: photoIds.length
    });
  } catch (error) {
    await trx.rollback();
    console.error('Checkout error:', error);
    return res.status(500).json({ error: 'Failed to complete checkout' });
  }
});

module.exports = router;
