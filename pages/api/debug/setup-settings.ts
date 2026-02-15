import type { NextApiRequest, NextApiResponse } from 'next';
import { sql } from '@vercel/postgres';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(50) PRIMARY KEY,
        value JSONB
      );
    `;
    // Initialize default if not exists
    await sql`
      INSERT INTO settings (key, value)
      VALUES ('system_enabled', 'true')
      ON CONFLICT (key) DO NOTHING;
    `;
    
    return res.status(200).json({ message: 'Settings table created and initialized' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
