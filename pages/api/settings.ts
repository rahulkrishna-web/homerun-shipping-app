import type { NextApiRequest, NextApiResponse } from 'next';
import { sql } from '@vercel/postgres';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    try {
      const result = await sql`SELECT value FROM settings WHERE key = 'system_enabled';`;
      const isEnabled = result.rows.length > 0 ? result.rows[0].value : true;
      res.status(200).json({ enabled: isEnabled });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'POST') {
    try {
      const { enabled } = req.body;
      await sql`
        INSERT INTO settings (key, value)
        VALUES ('system_enabled', ${enabled})
        ON CONFLICT (key) 
        DO UPDATE SET value = ${enabled};
      `;
      res.status(200).json({ message: 'Settings updated', enabled });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
