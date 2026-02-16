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
    
    // Flow Log Helper
    const flowLog: any[] = [];
    const addLog = (step: string, detail: any = null) => {
        const entry = { timestamp: new Date().toISOString(), step, detail };
        console.log(`[Flow] ${step}`, detail ? JSON.stringify(detail) : '');
        flowLog.push(entry);
    };

    addLog('Webhook received', { topic, shop });

    // Load Settings
    let settings = {
        system_enabled: true,
        tagging_enabled: false,
        tag_name: 'test-ofd',
        fulfillment_update_enabled: false,
        fulfillment_status: 'in_transit'
    };

    try {
        const settingsResult = await sql`SELECT key, value FROM settings;`;
        settingsResult.rows.forEach(row => {
            // @ts-ignore
            settings[row.key] = row.value;
        });
        addLog('Settings Loaded', settings);
    } catch (sError) {
        console.error('Error loading settings:', sError);
        // Fail open with defaults or current behavior? 
        // Let's assume defaults if DB fails, but log it.
        addLog('Error loading settings', { message: 'Using defaults' });
    }

    if (!settings.system_enabled) {
        addLog('System Disabled', { message: 'Skipping processing' });
        console.log('System is disabled. Skipping webhook.');
        return res.status(200).json({ message: 'System disabled' });
    }

    // DB Logger
    const logEvent = async (status: string, message: string, payload: any) => {
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS webhook_logs (
            id SERIAL PRIMARY KEY,
            date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(50),
            message TEXT,
            payload JSONB,
            flow_log JSONB
          );
        `;
        await sql`
          INSERT INTO webhook_logs (status, message, payload, flow_log)
          VALUES (${status}, ${message}, ${JSON.stringify(payload)}, ${JSON.stringify(flowLog)});
        `;
      } catch (dbError) {
        console.error('Database Error:', dbError);
      }
    };

    let orderId = body.id;
    addLog('Initial Order ID check', { orderId });
    
    // Handle nested payload from shipping provider
    if (!orderId && body.data && body.data.order && body.data.order.id) {
      orderId = body.data.order.id;
      addLog('Found Order ID in nested payload', { orderId });
    }

    if (!orderId) {
       addLog('Error: No Order ID found');
       await logEvent('ERROR', 'No Order ID found', body);
       return res.status(400).json({ message: 'No Order ID found' });
    }

    addLog('Processing Order', { orderId });

    try {
        addLog('Fetching Order from Shopify');
        const order = await shopify.order.get(orderId, { fields: 'id,tags,fulfillments' });
        addLog('Order Fetched', { tags: order.tags, fulfillmentCount: order.fulfillments?.length });

        // 1. Tagging Logic
        if (settings.tagging_enabled && settings.tag_name) {
            const specificTag = settings.tag_name;
            const currentTags = order.tags ? order.tags.split(',').map((t: string) => t.trim()) : [];
            
            if (!currentTags.includes(specificTag)) {
                const newTags = [...currentTags, specificTag].join(',');
                await shopify.order.update(orderId, { tags: newTags });
                addLog('Tag added', { tag: specificTag });
            } else {
                addLog('Tag already exists', { tag: specificTag });
            }
        } else {
            addLog('Tagging skipped', { enabled: settings.tagging_enabled, tagName: settings.tag_name });
        }

        // 2. Update Fulfillment Status
        if (settings.fulfillment_update_enabled && settings.fulfillment_status) {
            const fulfillments = order.fulfillments || [];
            // Filter for open fulfillments (success, open, processing are considered "active" for updates usually)
            // Null status often means open/pending in some contexts, but Shopify usually has 'open'.
            const openFulfillment = fulfillments.find((f: any) => 
                f.status === 'success' || f.status === 'open' || f.status === 'processing' || f.status === null
            ); 
            
            addLog('Searching for open fulfillment', { 
                found: !!openFulfillment, 
                fulfillmentId: openFulfillment?.id,
                allFulfillments: fulfillments.map((f:any) => ({ id: f.id, status: f.status }))
            });

            if (openFulfillment) {
                try {
                    const targetStatus = settings.fulfillment_status;
                    addLog('Attempting to create fulfillment event', { status: targetStatus });
                    await shopify.fulfillmentEvent.create(openFulfillment.id, { status: targetStatus });
                    addLog('Fulfillment event created successfully');
                    
                    // Final Success Log
                    await logEvent('SUCCESS', `Processed Order ${orderId}`, body);
                } catch (fError: any) {
                    addLog('Error updating fulfillment', { error: fError.message });
                    throw fError; 
                }
            } else {
                addLog('Warning: No open fulfillment found', { message: 'Skipping status update as per policy' });
                // We still log SUCCESS for the overall webhook if tagging worked, or WARNING if only part worked?
                // Let's log SUCCESS but note the skip in the message or keep it simple.
                await logEvent('SUCCESS', `Processed (Fulfillment update skipped - no open fulfillment)`, body);
            }
        } else {
            addLog('Fulfillment update skipped', { enabled: settings.fulfillment_update_enabled });
            await logEvent('SUCCESS', `Processed Order ${orderId}`, body);
        }

    } catch (opError: any) {
        addLog('Operation Error', { message: opError.message });
        await logEvent('ERROR', `Operation failed: ${opError.message}`, body);
        return res.status(500).json({ message: 'Error processing order' });
    }

    res.status(200).json({ message: 'Success' });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
}
