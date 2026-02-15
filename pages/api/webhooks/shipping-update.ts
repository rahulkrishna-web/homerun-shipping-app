import type { NextApiRequest, NextApiResponse } from 'next';
import { sql } from '@vercel/postgres';
import shopify from '../../../lib/shopify';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const topic = req.headers['x-shopify-topic'] || 'test';
    const shop = req.headers['x-shopify-shop-domain'];
    const body = req.body;

    console.log('Webhook received:', topic, shop);
    console.log('Body:', JSON.stringify(body, null, 2));

    // For testing: we expect a payload that looks like a Shopify Order or a fulfillment event
    // The user wants to start with adding a test-ofd tag.
    // We assume the payload contains an 'id' which is the Order ID, or we extract it.
    
    // Log helper
    const logEvent = async (status: string, message: string, payload: any) => {
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS webhook_logs (
            id SERIAL PRIMARY KEY,
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(50),
            message TEXT,
            payload JSONB
          );
        `;
        await sql`
          INSERT INTO webhook_logs (status, message, payload)
          VALUES (${status}, ${message}, ${JSON.stringify(payload)});
        `;
      } catch (dbError) {
        console.error('Database Error:', dbError);
      }
    };

    let orderId = body.id;
    // Handle 'fulfillment_events/create' or 'orders/updated' or custom shipping payload
    // If it's a custom payload, we need to know the structure.
    // Assuming standard Shopify payload or simple ID map for now.

    if (!orderId) {
       await logEvent('ERROR', 'No Order ID found', body);
       return res.status(400).json({ message: 'No Order ID found' });
    }

    await logEvent('INFO', `Processing Order ${orderId}`, body);

    // 1. Add 'test-ofd' tag (Existing logic)
    const order = await shopify.order.get(orderId, { fields: 'id,tags,fulfillments' });
    const specificTag = 'test-ofd';
    const currentTags = order.tags ? order.tags.split(',').map((t: string) => t.trim()) : [];
    
    if (!currentTags.includes(specificTag)) {
      const newTags = [...currentTags, specificTag].join(',');
      await shopify.order.update(orderId, { tags: newTags });
      await logEvent('SUCCESS', `Added tag ${specificTag}`, {});
    }

    // 2. Update Fulfillment Status to "Out for Delivery"
    // We need to find the fulfillment ID.
    // Takes the first open fulfillment.
    const fulfillments = order.fulfillments || [];
    const openFulfillment = fulfillments.find((f: any) => f.status === 'success' || f.status === 'open' || f.status === 'processing'); // specific logic might vary

    if (openFulfillment) {
      // Create a fulfillment event. 
      // Statuses: 'confirmed', 'in_transit', 'out_for_delivery', 'delivered', 'failure'
      // "In Progress" in UI usually maps to 'in_transit' or 'out_for_delivery'.
      // User asked for "In progress", which usually means 'in_transit'.
      // But triggering on "Out for Delivery" event suggesting 'out_for_delivery' status.
      // Let's use 'out_for_delivery' as it's more specific to the event.
      
      try {
        await shopify.fulfillmentEvent.create(openFulfillment.id, { status: 'out_for_delivery' });
        await logEvent('SUCCESS', `Updated fulfillment ${openFulfillment.id} to out_for_delivery`, {});
      } catch (fError: any) {
         await logEvent('ERROR', `Failed to update fulfillment: ${fError.message}`, {});
         console.error('Fulfillment Update Error', fError);
      }
    } else {
       await logEvent('WARNING', 'No open fulfillment found to update', {});
    }

    res.status(200).json({ message: 'Success' });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    // Try to log error if DB is accessible
    // const { sql } = require('@vercel/postgres'); 
    // ...
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
}
