import type { NextApiRequest, NextApiResponse } from 'next';
import { sql } from '@vercel/postgres';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    await sql`
      ALTER TABLE webhook_logs 
      ADD COLUMN IF NOT EXISTS flow_log JSONB;
    `;
    return res.status(200).json({ message: 'Successfully added flow_log column' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}
