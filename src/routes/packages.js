const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticateUser } = require('../middleware/auth');

/**
 * GET /api/packages
 * Get all active packages
 */
router.get('/', async (req, res) => {
  try {
    const packages = await db('packages').where({ is_active: true });
    return res.status(200).json(packages);
  } catch (error) {
    console.error('Error fetching packages:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/packages/active
 * Get current user's active package details
 */
router.get('/active', authenticateUser, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: User not registered' });
  }

  try {
    const activePkg = await db('user_packages')
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

    // Check if there are any pending payments/changes for this user
    const pendingPayment = await db('payments')
      .where({ user_id: req.user.id, status: 'pending' })
      .orderBy('created_at', 'desc')
      .first();

    return res.status(200).json({
      activePackage: activePkg || null,
      pendingPayment: pendingPayment || null
    });
  } catch (error) {
    console.error('Error fetching active package:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/packages/change
 * Request package change (upgrade/downgrade)
 */
router.post('/change', authenticateUser, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: User not registered' });
  }

  const { target_package_id } = req.body;
  if (!target_package_id) {
    return res.status(400).json({ error: 'Missing target_package_id' });
  }

  try {
    // 1. Get user's current package
    const currentPkgRelation = await db('user_packages')
      .where({ user_id: req.user.id })
      .first();

    if (!currentPkgRelation) {
      return res.status(400).json({ error: 'User does not have an active package' });
    }

    if (currentPkgRelation.package_id === parseInt(target_package_id, 10)) {
      return res.status(400).json({ error: 'Target package is the same as the current package' });
    }

    // Check if there is already a pending payment to avoid duplicates
    const existingPending = await db('payments')
      .where({ user_id: req.user.id, status: 'pending', payment_type: 'package_change' })
      .first();
    if (existingPending) {
      return res.status(400).json({ 
        error: 'You have a pending package change request. Please pay or wait for admin approval/refund.',
        pendingPayment: existingPending
      });
    }

    // 2. Fetch current and target package details
    const currentPkg = await db('packages').where({ id: currentPkgRelation.package_id }).first();
    const targetPkg = await db('packages').where({ id: target_package_id, is_active: true }).first();

    if (!targetPkg) {
      return res.status(404).json({ error: 'Target package not found or inactive' });
    }

    const currentPrice = parseFloat(currentPkg.price);
    const targetPrice = parseFloat(targetPkg.price);
    const difference = targetPrice - currentPrice;

    // Create a payment record
    const paymentData = {
      user_id: req.user.id,
      amount: difference, // Can be positive (upgrade) or negative (downgrade)
      payment_type: 'package_change',
      status: 'pending', // Pending payment slip OR pending admin refund processing
      details: JSON.stringify({
        old_package_id: currentPkg.id,
        old_package_name: currentPkg.name,
        target_package_id: targetPkg.id,
        target_package_name: targetPkg.name,
        difference: difference
      })
    };

    // If difference is 0, we can make it auto-approved
    if (difference === 0) {
      const trx = await db.transaction();
      try {
        await trx('user_packages')
          .where({ user_id: req.user.id })
          .update({
            package_id: targetPkg.id,
            amount_paid: currentPkgRelation.amount_paid,
            status: 'active'
          });

        await trx('payments').insert({
          ...paymentData,
          status: 'approved',
          details: JSON.stringify({
            ...JSON.parse(paymentData.details),
            approved_automatically: true
          })
        });
        await trx.commit();
        return res.status(200).json({
          success: true,
          message: 'Package changed successfully (no price difference)',
          difference: 0,
          autoApproved: true
        });
      } catch (error) {
        await trx.rollback();
        throw error;
      }
    }

    // Insert pending payment/refund record
    const [paymentId] = await db('payments').insert(paymentData);

    return res.status(200).json({
      success: true,
      message: difference > 0 
        ? 'Package upgrade requested. Please upload your payment slip.' 
        : 'Package downgrade requested. Admin will process your refund.',
      paymentId,
      difference,
      direction: difference > 0 ? 'upgrade' : 'downgrade'
    });
  } catch (error) {
    console.error('Error changing package:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
