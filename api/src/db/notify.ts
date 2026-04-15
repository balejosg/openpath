import type { Notification, PoolClient } from 'pg';
import { pool } from './pool.js';

export async function sendPgNotification(channel: string, payload: unknown): Promise<void> {
  await pool.query('SELECT pg_notify($1, $2)', [channel, JSON.stringify(payload)]);
}

export async function listenToPgChannel(params: {
  channel: string;
  onNotification: (msg: Notification) => void;
  onError?: (error: unknown) => void;
}): Promise<PoolClient> {
  const client = await pool.connect();

  client.on('notification', params.onNotification);
  if (params.onError) {
    client.on('error', params.onError);
  }

  await client.query(`LISTEN ${params.channel}`);
  return client;
}

export async function stopListeningToPgChannel(params: {
  channel: string;
  client: PoolClient;
}): Promise<void> {
  await params.client.query(`UNLISTEN ${params.channel}`);
  params.client.removeAllListeners('notification');
  params.client.removeAllListeners('error');
  params.client.release();
}
