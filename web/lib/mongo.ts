import 'server-only';

import { attachDatabasePool } from '@vercel/functions';
import { type Db, MongoClient } from 'mongodb';

const globalForMongo = globalThis as unknown as { __tagnewsMongo?: MongoClient };

/** Returns the shared read-only database handle, or undefined when Mongo is not configured. */
export function getDb(): Db | undefined {
  const uri = process.env.MONGODB_URI;
  if (!uri) return undefined;

  if (!globalForMongo.__tagnewsMongo) {
    const client = new MongoClient(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5_000,
      appName: 'tagnewspaper-web',
    });
    attachDatabasePool(client);
    globalForMongo.__tagnewsMongo = client;
  }
  return globalForMongo.__tagnewsMongo.db(process.env.MONGODB_DB ?? 'tagnewspaper');
}
