const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticateUser } = require('../middleware/auth');
const lineService = require('../services/line');

/**
 * GET /api/bookings/busy
 * Returns list of booked dates and times to prevent duplicate bookings
 */
router.get('/busy', async (req, res) => {
  try {
    const busyBookings = await db('bookings')
      .whereIn('status', ['pending', 'confirmed'])
      .select('booking_date', 'booking_time');

    // Format dates to YYYY-MM-DD
    const formatted = busyBookings.map(b => ({
      booking_date: new Date(b.booking_date).toISOString().split('T')[0],
      booking_time: b.booking_time
    }));

    return res.status(200).json(formatted);
  } catch (error) {
    console.error('Error fetching busy bookings:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/bookings/my
 * Get logged-in user's bookings
 */
router.get('/my', authenticateUser, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: User not registered' });
  }

  try {
    const bookings = await db('bookings')
      .where({ user_id: req.user.id })
      .orderBy('booking_date', 'desc')
      .orderBy('booking_time', 'desc');

    const formatted = bookings.map(b => ({
      ...b,
      booking_date: new Date(b.booking_date).toISOString().split('T')[0]
    }));

    return res.status(200).json(formatted);
  } catch (error) {
    console.error('Error fetching my bookings:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * POST /api/bookings
 * Book a photography session slot
 */
router.post('/', authenticateUser, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: User not registered' });
  }

  const { booking_date, booking_time, notes } = req.body;

  if (!booking_date || !booking_time) {
    return res.status(400).json({ error: 'Missing booking_date or booking_time' });
  }

  try {
    // 1. Double check if slot is already booked
    const existing = await db('bookings')
      .where({
        booking_date,
        booking_time
      })
      .whereIn('status', ['pending', 'confirmed'])
      .first();

    if (existing) {
      return res.status(400).json({ error: 'This time slot is already booked' });
    }

    // 2. Create the booking
    const [bookingId] = await db('bookings').insert({
      user_id: req.user.id,
      booking_date,
      booking_time,
      status: 'pending', // pending admin verification/confirmation
      notes: notes || ''
    });

    // 3. Send notification to user via LINE that booking is received
    try {
      await lineService.sendBookingUpdateNotification(
        req.user.line_user_id,
        booking_date,
        booking_time,
        'pending'
      );
    } catch (lineErr) {
      console.error('Could not send LINE notification for booking:', lineErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Booking request submitted successfully',
      bookingId
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
