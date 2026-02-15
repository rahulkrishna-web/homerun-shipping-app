import type { NextApiRequest, NextApiResponse } from 'next';
import { sql } from '@vercel/postgres';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // In a real app, add authentication here!
    // For now, we'll keep it open or add a simple query param check if needed.
    
    // Create table if not exists (just in case webhook hasn't run yet)
    await sql`
      CREATE TABLE IF NOT EXISTS webhook_logs (
        id SERIAL PRIMARY KEY,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50),
        message TEXT,
        payload JSONB
      );
    `;

    const result = await sql`
      SELECT id, date, status, message, payload, flow_log
      FROM webhook_logs 
      ORDER BY date DESC 
      LIMIT 50;
    `;
    
    res.status(200).json({ logs: result.rows });
  } catch (error: any) {
    console.error('Database Error:', error);
    res.status(500).json({ error: error.message });
  }
}
