/**
 * Script to create a default admin user for Tadpole.
 * Run from backend directory: npm run create-admin
 * Uses ADMIN_EMAIL and ADMIN_PASSWORD from .env, or defaults to admin@tadpole.local / admin123
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '12345678';
const BCRYPT_ROUNDS = 12;

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI in .env');
  process.exit(1);
}

async function createAdmin() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('No database connection');
    process.exit(1);
  }

  const usersCol = db.collection('users');
  const walletsCol = db.collection('wallets');

  const email = ADMIN_EMAIL.toLowerCase();
  const existing = await usersCol.findOne({ email });
  if (existing) {
    await usersCol.updateOne(
      { email },
      { $set: { role: 'admin', isFrozen: false } }
    );
    console.log(`Updated existing user to admin: ${email}`);
  } else {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);
    const { insertedId } = await usersCol.insertOne({
      email,
      passwordHash,
      role: 'admin',
      isVerified: false,
      isFrozen: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`Created admin user: ${email} (id: ${insertedId})`);

    // Create wallet for the new admin
    const walletExisting = await walletsCol.findOne({ userId: insertedId });
    if (!walletExisting) {
      await walletsCol.insertOne({
        userId: insertedId,
        availableBalance: 0,
        lockedBalance: 0,
        currency: 'INR',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log('Created wallet for admin.');
    }
  }

  console.log('Done. You can log in with:', ADMIN_EMAIL);
  await mongoose.disconnect();
}

createAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
