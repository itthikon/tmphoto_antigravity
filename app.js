/**
 * Entry point for hosting providers (like Plesk, cPanel Phusion Passenger)
 * that look for an app.js or index.js in the root directory.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('./src/server.js');
