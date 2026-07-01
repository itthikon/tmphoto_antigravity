const db = require('../db/database');
const lineService = require('./line');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Checks for confirmed bookings happening tomorrow and sends notifications.
 */
async function checkAndSendReminders() {
  console.log('[ReminderService] Running upcoming booking checks...');

  try {
    // 1. Calculate tomorrow's date boundaries
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const tomorrowYMD = tomorrow.toISOString().split('T')[0]; // "YYYY-MM-DD"
    
    const tomorrowStart = new Date(tomorrow);
    tomorrowStart.setHours(0, 0, 0, 0);
    const tomorrowStartStr = tomorrowStart.toISOString();

    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);
    const tomorrowEndStr = tomorrowEnd.toISOString();

    console.log(`[ReminderService] Checking for bookings on date: ${tomorrowYMD}`);

    // 2. Fetch confirmed bookings for tomorrow with reminder_sent = 0
    const upcomingBookings = await db('bookings')
      .join('users', 'bookings.user_id', 'users.id')
      .where({ 'bookings.status': 'confirmed' })
      .andWhere(function() {
        this.whereNull('bookings.reminder_sent')
            .orWhere('bookings.reminder_sent', 0)
            .orWhere('bookings.reminder_sent', false);
      })
      .andWhere(function() {
        // Support both YYYY-MM-DD strings and ISO timestamps
        this.where('bookings.booking_date', tomorrowYMD)
            .orWhere('bookings.booking_date', 'like', `${tomorrowYMD}%`)
            .orWhereBetween('bookings.booking_date', [tomorrowStartStr, tomorrowEndStr]);
      })
      .select(
        'bookings.*',
        'users.line_user_id as customer_line_id',
        'users.display_name as customer_name',
        'users.phone as customer_phone'
      );

    if (upcomingBookings.length === 0) {
      console.log('[ReminderService] No upcoming bookings found requiring reminders.');
      return;
    }

    console.log(`[ReminderService] Found ${upcomingBookings.length} upcoming bookings. Sending reminders...`);

    // Get all admin users with LINE accounts to notify the photographers
    const admins = await db('users')
      .where({ role: 'admin' })
      .whereNotNull('line_user_id')
      .andWhereNot('line_user_id', '');

    const adminIds = admins.map(a => a.line_user_id);
    
    // Add fallback admin from environment variables
    const envAdminId = process.env.ADMIN_LINE_USER_ID;
    if (envAdminId && !adminIds.includes(envAdminId)) {
      adminIds.push(envAdminId);
    }

    for (const booking of upcomingBookings) {
      const trx = await db.transaction();
      try {
        // A. Notify Customer
        if (booking.customer_line_id) {
          try {
            await lineService.sendCustomerBookingReminder(booking.customer_line_id, booking);
            console.log(`[ReminderService] Sent reminder to customer: ${booking.customer_name} (${booking.customer_line_id})`);
          } catch (customerLineErr) {
            console.error(`[ReminderService] Failed to send LINE to customer ${booking.customer_name}:`, customerLineErr.message);
          }
        } else {
          console.log(`[ReminderService] Customer ${booking.customer_name} has no registered LINE User ID. Skipping customer reminder.`);
        }

        // B. Notify Admin Photographers
        for (const adminId of adminIds) {
          try {
            await lineService.sendAdminBookingReminder(adminId, booking, booking.customer_name, booking.customer_phone);
            console.log(`[ReminderService] Sent reminder to admin: ${adminId}`);
          } catch (adminLineErr) {
            console.error(`[ReminderService] Failed to send LINE to admin ${adminId}:`, adminLineErr.message);
          }
        }

        // C. Update booking as sent
        await trx('bookings')
          .where({ id: booking.id })
          .update({ reminder_sent: 1 });

        await trx.commit();
        console.log(`[ReminderService] Booking ID ${booking.id} marked as reminder sent.`);
      } catch (err) {
        await trx.rollback();
        console.error(`[ReminderService] Failed processing booking reminder for ID ${booking.id}:`, err);
      }
    }

  } catch (error) {
    console.error('[ReminderService] Error in reminder check loop:', error);
  }
}

/**
 * Initializes and starts the background reminder schedule checking loop.
 */
function startReminderScheduler() {
  console.log('[ReminderService] Initializing upcoming booking reminder scheduler...');
  
  // Run check immediately on start
  checkAndSendReminders();

  // Run every 1 hour (3600000 ms)
  setInterval(checkAndSendReminders, 60 * 60 * 1000);
}

module.exports = {
  checkAndSendReminders,
  startReminderScheduler
};
