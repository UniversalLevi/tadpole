import mongoose from 'mongoose';
import { config } from '../config/index.js';

export async function connectMongo(): Promise<void> {
  await mongoose.connect(config.mongodbUri);
}

export function getMongoSession() {
  return mongoose.startSession();
}
