// src/utils/seedAdmin.js
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

export async function ensureSeedAdmin() {
  const existing = await User.findOne({ role: 'admin' });
  if (existing) return;
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  const hash = await bcrypt.hash(password, 10);
  await User.create({
    name: 'Admin',
    email: email.toLowerCase(),
    phone: '',
    passwordHash: hash,
    role: 'admin'
  });
  console.log(`[seed] Admin user created → ${email} / ${password}`);
}
