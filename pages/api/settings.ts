import type { NextApiRequest, NextApiResponse } from 'next';
import { sql } from '@vercel/postgres';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'GET') {
    try {
      const result = await sql`SELECT key, value FROM settings;`;
      
      // Default settings
      const settings = {
        system_enabled: true,
        tagging_enabled: false,
        tag_name: 'test-ofd',
        fulfillment_update_enabled: false,
        fulfillment_status: 'in_transit'
      };

      result.rows.forEach(row => {
        if (row.key in settings) {
            // @ts-ignore
            settings[row.key] = row.value;
        }
      });

      res.status(200).json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  } else if (req.method === 'POST') {
    try {
      const { system_enabled, tagging_enabled, tag_name, fulfillment_update_enabled, fulfillment_status } = req.body;
      
      // Upsert each setting
      const updates = [
        { key: 'system_enabled', value: system_enabled },
        { key: 'tagging_enabled', value: tagging_enabled },
        { key: 'tag_name', value: tag_name },
        { key: 'fulfillment_update_enabled', value: fulfillment_update_enabled },
        { key: 'fulfillment_status', value: fulfillment_status }
      ];

      for (const update of updates) {
          if (update.value !== undefined) {
            await sql`
                INSERT INTO settings (key, value)
                VALUES (${update.key}, ${update.value})
                ON CONFLICT (key) 
                DO UPDATE SET value = ${update.value};
            `;
          }
      }

      res.status(200).json({ message: 'Settings updated' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
