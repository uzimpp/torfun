import { MongoClient } from 'mongodb';
import { loadEnv } from '../config/env';

const env = loadEnv();

const client = new MongoClient(env.MONGODB_URI);

let database: ReturnType<MongoClient['db']> | undefined;

export async function get_database() {
  if (!database) {
    await client.connect();
    database = client.db();
  }

  return database;
}

export async function get_users_collection() {
  const db = await get_database();

  return db.collection('users');
}
