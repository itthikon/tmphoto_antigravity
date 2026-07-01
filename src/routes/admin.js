const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { authenticateAdmin } = require('../middleware/auth');
const cloudflareR2Service = require('../services/cloudflareR2');
const lineService = require('../services/line');
const watermarkService = require('../services/watermark');

// Ensure directories exist
const tempUploadsDir = path.resolve(process.cwd(), './src/db/temp_uploads');
if (!fs.existsSync(tempUploadsDir)) {
  fs.mkdirSync(tempUploadsDir, { recursive: true });
}

const receiptsDir = path.resolve(process.cwd(), './public/receipts');
if (!fs.existsSync(receiptsDir)) {
  fs.mkdirSync(receiptsDir, { recursive: true });
}

const previewsDir = path.resolve(process.cwd(), './src/db/previews');
if (!fs.existsSync(previewsDir)) {
  fs.mkdirSync(previewsDir, { recursive: true });
}

// Multer storage config for admin photo uploads
const upload = multer({
  dest: tempUploadsDir,
  limits: { fileSize: 20 * 1024 * 1024 } // Max 20MB per photo
});

/**
 * Helper to generate HTML receipt
 */
function generateHtmlReceipt(paymentId, dateStr, customerName, detailsStr, amount) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Receipt #REC-${paymentId}</title>
  <style>
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #374151; background-color: #f3f4f6; }
    .receipt { border: 1px solid #e5e7eb; padding: 30px; max-width: 450px; margin: 40px auto; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
    h2 { text-align: center; color: #10B981; margin-top: 0; font-size: 24px; font-weight: bold; }
    .studio-name { text-align: center; font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; margin-bottom: 20px; }
    .row { display: flex; justify-content: space-between; margin: 12px 0; font-size: 14px; }
    .label { color: #6b7280; }
    .value { font-weight: 500; color: #111827; }
    .total { font-weight: 700; border-top: 2px dashed #e5e7eb; padding-top: 15px; margin-top: 20px; font-size: 18px; }
    .total-val { color: #10B981; }
    hr { border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0; }
    .footer { text-align: center; font-size: 12px; color: #9ca3af; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="receipt">
    <h2>TmStudio</h2>
    <div class="studio-name">ใบเสร็จรับเงิน / Official Receipt</div>
    <hr>
    <div class="row"><span class="label">เลขที่ใบเสร็จ:</span><span class="value">REC-${paymentId}</span></div>
    <div class="row"><span class="label">วันที่ชำระเงิน:</span><span class="value">${dateStr}</span></div>
    <div class="row"><span class="label">ลูกค้า:</span><span class="value">${customerName}</span></div>
    <div class="row"><span class="label">รายการ:</span><span class="value" style="text-align: right; max-width: 60%;">${detailsStr}</span></div>
    <div class="row total"><span class="label">ยอดชำระสุทธิ:</span><span class="value total-val">${parseFloat(amount).toLocaleString('th-TH')} บาท</span></div>
    <hr>
    <div class="footer">
      ขอบคุณที่ใช้บริการถ่ายภาพกับทางเราค่ะ<br>
      Thank you for choosing TmStudio.
    </div>
  </div>
</body>
</html>`;
}

/**
 * GET /api/admin/bookings
 * Fetch all bookings
 */
router.get('/bookings', authenticateAdmin, async (req, res) => {
  try {
    const bookings = await db('bookings')
      .join('users', 'bookings.user_id', 'users.id')
      .select(
        'bookings.*',
        'users.display_name as user_name',
        'users.phone as user_phone',
        'users.email as user_email'
      )
      .orderBy('bookings.booking_date', 'desc');

    const formatted = bookings.map(b => ({
      ...b,
      booking_date: new Date(b.booking_date).toISOString().split('T')[0]
    }));

    return res.status(200).json(formatted);
  } catch (error) {
    console.error('Error fetching admin bookings:', error);
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
});

/**
 * POST /api/admin/bookings/status
 * Update status of booking (confirmed, cancelled, completed)
 */
router.post('/bookings/status', authenticateAdmin, async (req, res) => {
  const { booking_id, status } = req.body;
  if (!booking_id || !status) {
    return res.status(400).json({ error: 'Missing booking_id or status' });
  }

  try {
    const booking = await db('bookings').where({ id: booking_id }).first();
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    await db('bookings').where({ id: booking_id }).update({ status });

    // Send push notification to user
    const user = await db('users').where({ id: booking.user_id }).first();
    if (user && user.line_user_id) {
      const dateStr = new Date(booking.booking_date).toISOString().split('T')[0];
      await lineService.sendBookingUpdateNotification(user.line_user_id, dateStr, booking.booking_time, status);
    }

    return res.status(200).json({ success: true, message: 'Booking status updated' });
  } catch (error) {
    console.error('Error updating booking status:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/admin/payments
 * Fetch all payments with user details
 */
router.get('/payments', authenticateAdmin, async (req, res) => {
  try {
    const payments = await db('payments')
      .join('users', 'payments.user_id', 'users.id')
      .select(
        'payments.*',
        'users.display_name as user_name',
        'users.phone as user_phone',
        'users.email as user_email'
      )
      .orderBy('payments.created_at', 'desc');

    return res.status(200).json(payments);
  } catch (error) {
    console.error('Error fetching admin payments:', error);
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
});

/**
 * POST /api/admin/payments/approve
 * Approve payment, generate receipt, send LINE message and active packages/photos
 */
router.post('/payments/approve', authenticateAdmin, async (req, res) => {
  const { payment_id } = req.body;
  if (!payment_id) {
    return res.status(400).json({ error: 'Missing payment_id' });
  }

  const trx = await db.transaction();
  try {
    const payment = await trx('payments').where({ id: payment_id }).first();
    if (!payment) {
      await trx.rollback();
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.status !== 'pending') {
      await trx.rollback();
      return res.status(400).json({ error: 'Payment is already processed' });
    }

    const user = await trx('users').where({ id: payment.user_id }).first();
    const details = JSON.parse(payment.details || '{}');
    let receiptDescription = '';
    let notificationPackageName = '';

    // 1. Process payment depending on type
    if (payment.payment_type === 'package_purchase') {
      // Activate user package
      const packageId = details.package_id;
      const pkg = await trx('packages').where({ id: packageId }).first();
      
      await trx('user_packages')
        .where({ user_id: payment.user_id })
        .update({
          status: 'active',
          amount_paid: payment.amount,
          updated_at: trx.fn.now()
        });

      receiptDescription = `ซื้อแพ็คเกจ: ${pkg.name}`;
      notificationPackageName = pkg.name;

    } else if (payment.payment_type === 'photo_purchase') {
      // Approve photo downloads
      const photoIds = details.photo_ids;
      await trx('photos')
        .whereIn('id', photoIds)
        .update({ status: 'purchased' });

      receiptDescription = `ซื้อไฟล์รูปภาพจำนวน ${photoIds.length} ภาพ`;
      notificationPackageName = `ซื้อรูปภาพ (${photoIds.length} ภาพ)`;

    } else if (payment.payment_type === 'package_change') {
      // Upgrade or downgrade package
      const targetPackageId = details.target_package_id;
      const targetPkg = await trx('packages').where({ id: targetPackageId }).first();
      
      const currentPkgRelation = await trx('user_packages').where({ user_id: payment.user_id }).first();
      
      // Calculate new total amount paid
      // If upgrade: user paid extra (payment.amount is positive). If downgrade: user was refunded (payment.amount is negative)
      const newAmountPaid = parseFloat(currentPkgRelation.amount_paid) + parseFloat(payment.amount);

      await trx('user_packages')
        .where({ user_id: payment.user_id })
        .update({
          package_id: targetPkg.id,
          amount_paid: newAmountPaid,
          status: 'active',
          updated_at: trx.fn.now()
        });

      const isUpgrade = parseFloat(payment.amount) >= 0;
      receiptDescription = isUpgrade 
        ? `อัพเกรดแพ็คเกจเป็น: ${targetPkg.name}`
        : `ปรับลดแพ็คเกจเป็น: ${targetPkg.name} (คืนเงิน)`;
      notificationPackageName = targetPkg.name;
    }

    // 2. Generate HTML receipt
    const dateStr = new Date().toLocaleString('th-TH');
    const htmlContent = generateHtmlReceipt(
      payment.id,
      dateStr,
      user.display_name,
      receiptDescription,
      payment.amount
    );
    
    const receiptFilename = `receipt-${payment.id}.html`;
    const receiptPath = path.join(receiptsDir, receiptFilename);
    fs.writeFileSync(receiptPath, htmlContent, 'utf8');
    
    const serverUrl = `${req.protocol}://${req.get('host')}`;
    const receiptUrl = `${serverUrl}/receipts/${receiptFilename}`;

    // 3. Update payment status in DB
    await trx('payments')
      .where({ id: payment.id })
      .update({
        status: 'approved',
        receipt_url: `/receipts/${receiptFilename}`,
        updated_at: trx.fn.now()
      });

    await trx.commit();

    // 4. Send LINE push receipt notification
    if (user.line_user_id) {
      try {
        await lineService.sendReceiptNotification(
          user.line_user_id,
          payment.amount,
          receiptUrl,
          notificationPackageName,
          user.display_name,
          payment.id
        );
      } catch (lineErr) {
        console.error('Error sending LINE payment approval notification:', lineErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Payment approved successfully',
      receipt_url: `/receipts/${receiptFilename}`
    });

  } catch (error) {
    await trx.rollback();
    console.error('Payment approval error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/admin/payments/reject
 * Reject payment
 */
router.post('/payments/reject', authenticateAdmin, async (req, res) => {
  const { payment_id, notes } = req.body;
  if (!payment_id) {
    return res.status(400).json({ error: 'Missing payment_id' });
  }

  const trx = await db.transaction();
  try {
    const payment = await trx('payments').where({ id: payment_id }).first();
    if (!payment) {
      await trx.rollback();
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.status !== 'pending') {
      await trx.rollback();
      return res.status(400).json({ error: 'Payment is already processed' });
    }

    // 1. If photo purchase, revert status back to 'uploaded' so they can be bought again
    const details = JSON.parse(payment.details || '{}');
    if (payment.payment_type === 'photo_purchase') {
      const photoIds = details.photo_ids;
      await trx('photos')
        .whereIn('id', photoIds)
        .update({ status: 'uploaded' });
    }

    // 2. Reject payment record
    await trx('payments')
      .where({ id: payment_id })
      .update({
        status: 'rejected',
        details: JSON.stringify({ ...details, rejection_notes: notes || 'ใบโอนเงินไม่ถูกต้อง' }),
        updated_at: trx.fn.now()
      });

    await trx.commit();

    // 3. Notify user via LINE
    const user = await db('users').where({ id: payment.user_id }).first();
    if (user && user.line_user_id) {
      try {
        await lineService.sendPushMessage(user.line_user_id, {
          type: 'text',
          text: `❌ การชำระเงินจำนวน ${parseFloat(payment.amount).toLocaleString('th-TH')} บาท ของคุณไม่ผ่านการตรวจสอบ\nเหตุผล: ${notes || 'หลักฐานการโอนเงินไม่ถูกต้อง'}\nกรุณาตรวจสอบและอัพโหลดสลิปใหม่อีกครั้งในระบบ LIFF`
        });
      } catch (lineErr) {
        console.error('Error notifying user about rejection:', lineErr.message);
      }
    }

    return res.status(200).json({ success: true, message: 'Payment rejected successfully' });
  } catch (error) {
    await trx.rollback();
    console.error('Payment rejection error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/admin/users
 * List all users (excluding admins)
 */
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const users = await db('users')
      .leftJoin('user_packages', 'users.id', 'user_packages.user_id')
      .leftJoin('packages', 'user_packages.package_id', 'packages.id')
      .whereNot({ 'users.role': 'admin' })
      .select(
        'users.id',
        'users.display_name',
        'users.phone',
        'users.email',
        'users.created_at',
        'packages.name as package_name',
        'user_packages.status as package_status'
      )
      .orderBy('users.created_at', 'desc');

    return res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching admin users:', error);
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
});

/**
 * POST /api/admin/users/reset-password
 * Reset user password (primarily admins since LIFF users use LINE token)
 */
router.post('/users/reset-password', authenticateAdmin, async (req, res) => {
  const { user_id, new_password } = req.body;
  if (!user_id || !new_password) {
    return res.status(400).json({ error: 'Missing user_id or new_password' });
  }

  try {
    const user = await db('users').where({ id: user_id }).first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hashed = await bcrypt.hash(new_password, 10);
    await db('users').where({ id: user_id }).update({
      password_hash: hashed
    });

    return res.status(200).json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    console.error('Password reset error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/admin/photos/upload
 * Upload photos for a user, watermark them and upload originals to Google Drive
 */
router.post('/photos/upload', authenticateAdmin, upload.array('photos', 20), async (req, res) => {
  const { user_id, booking_id } = req.body;
  if (!user_id) {
    return res.status(400).json({ error: 'Missing user_id' });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No photo files uploaded' });
  }

  try {
    const user = await db('users').where({ id: user_id }).first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Determine default status: if user has 'flat' package, status is immediately 'purchased'
    const userPkg = await db('user_packages')
      .join('packages', 'user_packages.package_id', 'packages.id')
      .where({ 'user_packages.user_id': user_id, 'user_packages.status': 'active' })
      .select('packages.type')
      .first();

    const initialStatus = (userPkg && userPkg.type === 'flat') ? 'purchased' : 'uploaded';

    const uploadedPhotos = [];

    for (const file of req.files) {
      // 1. Upload high-res original to Cloudflare R2
      const storageKey = await cloudflareR2Service.uploadFile(
        file.path,
        file.originalname,
        file.mimetype
      );

      // 2. Insert record to database
      const [photoId] = await db('photos').insert({
        user_id: user.id,
        booking_id: booking_id || null,
        storage_key: storageKey,
        filename: file.originalname,
        status: initialStatus
      });

      // 3. Create watermarked preview and save in src/db/previews/preview-<photoId>.jpg
      const previewFilename = `preview-${photoId}.jpg`;
      const previewPath = path.join(previewsDir, previewFilename);
      
      try {
        await watermarkService.applyWatermark(
          file.path,
          previewPath,
          'TmStudio - PREVIEW ONLY'
        );
      } catch (watermarkErr) {
        console.error(`Failed to watermark photo ${photoId}, using copy:`, watermarkErr.message);
        // Fallback: copy file without watermarking to prevent break
        fs.copyFileSync(file.path, previewPath);
      }

      // 4. Delete local temp file
      fs.unlinkSync(file.path);

      uploadedPhotos.push({
        id: photoId,
        filename: file.originalname,
        storage_key: storageKey,
        status: initialStatus
      });
    }

    // 5. Send push notification to user via LINE
    if (user.line_user_id) {
      try {
        await lineService.sendPhotosReadyNotification(user.line_user_id);
      } catch (lineErr) {
        console.error('Error sending LINE photos ready notification:', lineErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Uploaded ${uploadedPhotos.length} photos successfully`,
      photos: uploadedPhotos
    });

  } catch (error) {
    console.error('Admin photo upload error:', error);
    // Cleanup any remaining temp files
    if (req.files) {
      req.files.forEach(f => {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      });
    }
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * Package management routes
 */
router.get('/packages', authenticateAdmin, async (req, res) => {
  try {
    const packages = await db('packages');
    return res.status(200).json(packages);
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/packages', authenticateAdmin, async (req, res) => {
  const { name, type, price, photo_price, description, is_active } = req.body;
  if (!name || !type || price === undefined) {
    return res.status(400).json({ error: 'Missing required package fields' });
  }

  try {
    const [id] = await db('packages').insert({
      name,
      type,
      price,
      photo_price: photo_price || 0.00,
      description: description || '',
      is_active: is_active !== undefined ? is_active : true
    });
    return res.status(201).json({ success: true, id });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.put('/packages/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, type, price, photo_price, description, is_active } = req.body;

  try {
    await db('packages')
      .where({ id })
      .update({
        name,
        type,
        price,
        photo_price,
        description,
        is_active,
        updated_at: db.fn.now()
      });
    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
