const db = require('./database');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

async function init() {
  console.log('Initializing database...');

  // For SQLite, ensure directory exists
  if (process.env.DB_TYPE === 'sqlite' || !process.env.DB_TYPE) {
    const dbPath = process.env.DB_FILENAME || './src/db/database.sqlite';
    const absoluteDbPath = path.resolve(process.cwd(), dbPath);
    const dir = path.dirname(absoluteDbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // 1. users
  if (!(await db.schema.hasTable('users'))) {
    console.log('Creating table: users');
    await db.schema.createTable('users', (table) => {
      table.increments('id').primary();
      table.string('line_user_id').unique().nullable();
      table.string('display_name').notNullable();
      table.string('phone').notNullable();
      table.string('email').notNullable();
      table.string('role').defaultTo('user'); // user, admin
      table.string('password_hash').nullable(); // for admin
      table.timestamps(true, true);
    });
  }

  // 2. packages
  if (!(await db.schema.hasTable('packages'))) {
    console.log('Creating table: packages');
    await db.schema.createTable('packages', (table) => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('type').notNullable(); // flat, per_photo
      table.decimal('price', 10, 2).notNullable();
      table.decimal('photo_price', 10, 2).defaultTo(0.00);
      table.text('description').nullable();
      table.boolean('is_active').defaultTo(true);
      table.timestamps(true, true);
    });
  }

  // 3. user_packages
  if (!(await db.schema.hasTable('user_packages'))) {
    console.log('Creating table: user_packages');
    await db.schema.createTable('user_packages', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.integer('package_id').unsigned().references('id').inTable('packages').onDelete('RESTRICT');
      table.decimal('amount_paid', 10, 2).defaultTo(0.00);
      table.string('status').defaultTo('active'); // active, pending_change
      table.timestamps(true, true);
    });
  }

  // 4. bookings
  if (!(await db.schema.hasTable('bookings'))) {
    console.log('Creating table: bookings');
    await db.schema.createTable('bookings', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.date('booking_date').notNullable();
      table.string('booking_time').notNullable(); // e.g. "09:00-12:00", "13:00-16:00"
      table.string('status').defaultTo('pending'); // pending, confirmed, cancelled, completed
      table.text('notes').nullable();
      table.boolean('reminder_sent').defaultTo(false);
      table.timestamps(true, true);
    });
  } else {
    const hasReminderCol = await db.schema.hasColumn('bookings', 'reminder_sent');
    if (!hasReminderCol) {
      console.log('Migration: adding reminder_sent to bookings');
      await db.schema.alterTable('bookings', (table) => {
        table.boolean('reminder_sent').defaultTo(false);
      });
    }
  }

  // 5. photos
  if (!(await db.schema.hasTable('photos'))) {
    console.log('Creating table: photos');
    await db.schema.createTable('photos', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.integer('booking_id').unsigned().references('id').inTable('bookings').onDelete('SET NULL').nullable();
      table.string('storage_key').notNullable();
      table.string('filename').notNullable();
      table.string('status').defaultTo('uploaded'); // uploaded, selected, purchased
      table.timestamps(true, true);
    });
  } else {
    // Migration: If photos table exists and still has google_drive_file_id, rename to storage_key
    const hasGoogleDriveCol = await db.schema.hasColumn('photos', 'google_drive_file_id');
    if (hasGoogleDriveCol) {
      console.log('Migrating photos schema: renaming google_drive_file_id to storage_key');
      await db.schema.alterTable('photos', (table) => {
        table.renameColumn('google_drive_file_id', 'storage_key');
      });
    }
  }

  // 6. cart
  if (!(await db.schema.hasTable('cart'))) {
    console.log('Creating table: cart');
    await db.schema.createTable('cart', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.integer('photo_id').unsigned().references('id').inTable('photos').onDelete('CASCADE');
      table.timestamps(true, true);
    });
  }

  // 7. payments
  if (!(await db.schema.hasTable('payments'))) {
    console.log('Creating table: payments');
    await db.schema.createTable('payments', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.decimal('amount', 10, 2).notNullable();
      table.string('payment_type').notNullable(); // package_purchase, photo_purchase, package_change
      table.string('slip_image_url').nullable();
      table.string('status').defaultTo('pending'); // pending, approved, rejected
      table.string('receipt_url').nullable();
      table.text('details').nullable(); // JSON string
      table.timestamps(true, true);
    });
  }

  console.log('Tables created. Checking seeds...');

  // Seed default admin user
  const adminExists = await db('users').where({ role: 'admin' }).first();
  if (!adminExists) {
    console.log('Seeding default admin user...');
    const adminPasswordHash = await bcrypt.hash('adminpassword', 10);
    await db('users').insert({
      display_name: 'Admin Photographer',
      phone: '0999999999',
      email: 'admin@photostudio.com',
      role: 'admin',
      password_hash: adminPasswordHash
    });
  }

  // Seed default packages
  const packagesCount = await db('packages').count('id as count').first();
  if (parseInt(packagesCount.count || '0', 10) === 0) {
    console.log('Seeding default packages...');
    await db('packages').insert([
      {
        name: 'เหมาจ่าย 3 ชั่วโมง ไม่จำกัดภาพ',
        type: 'flat',
        price: 200.00,
        photo_price: 0.00,
        description: 'ถ่ายภาพเหมาจ่ายเป็นเวลา 3 ชั่วโมง ได้รับรูปภาพทั้งหมดโดยไม่จำกัดจำนวน',
        is_active: true
      },
      {
        name: 'เริ่มต้นเลือกซื้อรายภาพ',
        type: 'per_photo',
        price: 100.00,
        photo_price: 10.00,
        description: 'ค่าบริการเริ่มต้น 100 บาท (ไม่รวมไฟล์ภาพ) และสามารถเลือกซื้อรูปภาพเพิ่มภายหลังในราคาภาพละ 10 บาท',
        is_active: true
      }
    ]);
  }

  console.log('Database initialized successfully.');
  process.exit(0);
}

init().catch((err) => {
  console.error('Error initializing database:', err);
  process.exit(1);
});
