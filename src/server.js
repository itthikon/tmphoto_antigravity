const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const reminderService = require('./services/reminderService');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for development
app.use(cors());

// Parse requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static web client assets
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/photos', require('./routes/photos'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/webhook', require('./routes/webhook'));

// Fallback index.html for Single Page App client routing
app.get('*', (req, res) => {
  // If it's a request to /admin, serve admin.html
  if (req.path.startsWith('/admin')) {
    return res.sendFile(path.join(__dirname, '../public/admin.html'));
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start listening
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` PHOTO STUDIO SERVER STARTED SUCCESSFULLY`);
  console.log(` Port: ${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Web App URL: http://localhost:${PORT}`);
  console.log(` Admin URL:   http://localhost:${PORT}/admin.html`);
  console.log(`==================================================`);

  // Start background reminder scheduler
  reminderService.startReminderScheduler();
});

module.exports = app;
