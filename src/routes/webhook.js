const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const db = require('../db/database');
const lineService = require('../services/line');

// Ensure storage folders exist
const slipsDir = path.resolve(process.cwd(), './public/slips');
if (!fs.existsSync(slipsDir)) {
  fs.mkdirSync(slipsDir, { recursive: true });
}
const receiptsDir = path.resolve(process.cwd(), './public/receipts');
if (!fs.existsSync(receiptsDir)) {
  fs.mkdirSync(receiptsDir, { recursive: true });
}

/**
 * Helper to generate HTML receipt (duplicate of admin.js helper for simplicity)
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
    h2 { text-align: center; color: #c5a880; margin-top: 0; font-size: 24px; font-weight: bold; }
    .studio-name { text-align: center; font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; margin-bottom: 20px; }
    .row { display: flex; justify-content: space-between; margin: 12px 0; font-size: 14px; }
    .label { color: #6b7280; }
    .value { font-weight: 500; color: #111827; }
    .total { font-weight: 700; border-top: 2px dashed #e5e7eb; padding-top: 15px; margin-top: 20px; font-size: 18px; }
    .total-val { color: #c5a880; }
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
 * POST /api/webhook/line
 * Receives Webhook events from LINE Official Account
 */
router.post('/line', async (req, res) => {
  const events = req.body.events;
  if (!events || !Array.isArray(events)) {
    return res.status(200).send('OK');
  }

  // Process each event asynchronously
  for (const event of events) {
    try {
      if (event.type === 'message' && event.message.type === 'image') {
        const messageId = event.message.id;
        const lineUserId = event.source.userId;

        console.log(`[Webhook] Received slip image from user: ${lineUserId}, MessageID: ${messageId}`);

        // 1. Find user by LINE User ID
        const user = await db('users').where({ line_user_id: lineUserId }).first();
        if (!user) {
          console.warn(`[Webhook] User not registered in system: ${lineUserId}`);
          // We don't reply if user is not in system to avoid bot loops/spam
          continue;
        }

        // 2. Fetch image buffer from LINE Content API
        const imageBuffer = await lineService.downloadMessageContent(messageId);

        // 3. Save slip locally
        const filename = `slip-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
        const localSlipPath = path.join(slipsDir, filename);
        fs.writeFileSync(localSlipPath, imageBuffer);
        const relativeSlipUrl = `/slips/${filename}`;

        // 4. Verify using Easyslip (or Mock if API Key is missing/mock)
        const apiKey = process.env.EASYSLIP_API_KEY;
        const isMockVerification = !apiKey || apiKey === 'mock' || lineService.isMock();

        let verificationResult = null;
        let transAmount = 0;
        let transTime = '';
        let senderName = '';
        let isValid = false;
        let failReason = '';

        if (isMockVerification) {
          console.log('[Webhook] Running in Mock Slip Verification Mode.');
          // Find user's latest pending payment to match
          const pendingPayment = await db('payments')
            .where({ user_id: user.id, status: 'pending' })
            .first();

          if (pendingPayment) {
            isValid = true;
            transAmount = parseFloat(pendingPayment.amount);
            transTime = new Date().toLocaleString('th-TH');
            senderName = user.display_name;
          } else {
            isValid = false;
            failReason = 'ไม่พบรายการที่ค้างชำระเงินของท่านในระบบ กรุณาทำรายการจองคิวหรือเลือกซื้อภาพก่อนส่งสลิปค่ะ';
          }
        } else {
          // Real Easyslip API call
          try {
            const base64Str = imageBuffer.toString('base64');
            const easyslipRes = await axios.post('https://api.easyslip.com/v2/verify/bank', {
              base64: base64Str
            }, {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              }
            });

            if (easyslipRes.data && easyslipRes.data.status === 200) {
              const data = easyslipRes.data.data;
              verificationResult = data;
              isValid = true;
              transAmount = data.amount;
              transTime = data.transDate + ' ' + data.transTime;
              senderName = data.sender.displayName;
            } else {
              isValid = false;
              failReason = 'สลิปนี้ไม่ผ่านการตรวจสอบข้อมูลธนาคาร หรือไม่มีรหัสคิวอาร์โค้ด';
            }
          } catch (easyslipErr) {
            console.error('[Webhook] Easyslip API Error:', easyslipErr.response ? easyslipErr.response.data : easyslipErr.message);
            isValid = false;
            failReason = 'ระบบขัดข้องไม่สามารถติดต่อธนาคารได้ชั่วคราว กรุณาส่งสลิปใหม่อีกครั้ง';
          }
        }

        // 5. Database update and reply based on verification result
        if (isValid) {
          // Find matching pending payment
          const payment = await db('payments')
            .where({ user_id: user.id, status: 'pending' })
            .andWhere(function() {
              // Match exact amount or close enough (within 0.5 THB)
              this.whereBetween('amount', [transAmount - 0.5, transAmount + 0.5]);
            })
            .orderBy('created_at', 'desc')
            .first();

          if (!payment) {
            console.log(`[Webhook] Valid slip for user but no matching pending payment of ${transAmount} THB.`);
            await lineService.sendPaymentAutoRejectedNotification(
              lineUserId,
              transAmount,
              `สลิปจำนวน ${transAmount} บาท ถูกต้อง แต่ไม่พบรายการสั่งซื้อ/จองคิวที่มียอดชำระเงินเท่านี้ค้างอยู่ในระบบค่ะ`
            );
            continue;
          }

          // Approve payment inside transaction
          const trx = await db.transaction();
          try {
            const details = JSON.parse(payment.details || '{}');
            let receiptDescription = '';
            let notificationPackageName = '';

            if (payment.payment_type === 'package_purchase') {
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
              const photoIds = details.photo_ids;
              await trx('photos')
                .whereIn('id', photoIds)
                .update({ status: 'purchased' });

              receiptDescription = `ซื้อไฟล์รูปภาพจำนวน ${photoIds.length} ภาพ`;
              notificationPackageName = `ซื้อรูปภาพ (${photoIds.length} ภาพ)`;

            } else if (payment.payment_type === 'package_change') {
              const targetPackageId = details.target_package_id;
              const targetPkg = await trx('packages').where({ id: targetPackageId }).first();
              const currentPkgRelation = await trx('user_packages').where({ user_id: payment.user_id }).first();
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

            // Generate HTML receipt
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

            // Update payment record in DB
            await trx('payments')
              .where({ id: payment.id })
              .update({
                status: 'approved',
                slip_image_url: relativeSlipUrl,
                receipt_url: `/receipts/${receiptFilename}`,
                updated_at: trx.fn.now()
              });

            await trx.commit();
            console.log(`[Webhook] Auto-approved payment ID ${payment.id} for user ${user.id}`);

            // Send push receipt & success notification
            await lineService.sendPaymentAutoApprovedNotification(
              lineUserId,
              transAmount,
              transTime,
              senderName,
              receiptUrl,
              payment.id
            );

          } catch (trxErr) {
            await trx.rollback();
            console.error('[Webhook] Transaction error in automated slip approval:', trxErr);
            await lineService.sendPaymentAutoRejectedNotification(
              lineUserId,
              transAmount,
              'เกิดข้อผิดพลาดในการบันทึกข้อมูลกรุณาติดต่อเจ้าหน้าที่'
            );
          }
        } else {
          // Slip is invalid
          console.log(`[Webhook] Invalid slip submitted: ${failReason}`);
          await lineService.sendPaymentAutoRejectedNotification(lineUserId, 0, failReason);
        }
      }
    } catch (err) {
      console.error('[Webhook] Error processing event:', err);
    }
  }

  return res.status(200).send('OK');
});

module.exports = router;
