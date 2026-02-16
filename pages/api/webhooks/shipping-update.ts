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

    // Processing Summary
    const processingSummary: any = {
        tag: { status: 'skipped' },
        fulfillment: { status: 'skipped', retries: 0 }
    };

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
            flow_log JSONB,
            summary JSONB
          );
        `;
        // Ensure column exists (idempotent-ish via catch or explicit check, let's just allow it to fail silently if exists or use a separate migration step in real app. 
        // For now, we'll just try to add it safely if we can, or rely on the INSERT to fail if column missing? 
        // Better: alter table if not exists is hard in standard SQL without a function. 
        // Let's just try to ADD COLUMN and ignore error, or assume it exists after this run.
        try {
            await sql`ALTER TABLE webhook_logs ADD COLUMN IF NOT EXISTS summary JSONB;`;
        } catch (e) {
            // ignore if column exists or other non-critical error
            console.log('Column add error (ignorable):', e);
        }

        await sql`
          INSERT INTO webhook_logs (status, message, payload, flow_log, summary)
          VALUES (${status}, ${message}, ${JSON.stringify(payload)}, ${JSON.stringify(flowLog)}, ${JSON.stringify(processingSummary)});
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
            
            processingSummary.tag.tagName = specificTag;

            if (!currentTags.includes(specificTag)) {
                try {
                    const newTags = [...currentTags, specificTag].join(',');
                    await shopify.order.update(orderId, { tags: newTags });
                    addLog('Tag added', { tag: specificTag });
                    
                    processingSummary.tag.status = 'success';
                } catch (tagError: any) {
                    processingSummary.tag.status = 'failed';
                    processingSummary.tag.error = tagError.message;
                    addLog('Error adding tag', { error: tagError.message });
                }
            } else {
                addLog('Tag already exists', { tag: specificTag });
                processingSummary.tag.status = 'exists';
            }
        } else {
            addLog('Tagging skipped', { enabled: settings.tagging_enabled, tagName: settings.tag_name });
            processingSummary.tag.status = 'skipped';
        }

        // 2. Update Fulfillment Status
        if (settings.fulfillment_update_enabled && settings.fulfillment_status) {
            const desiredStatus = settings.fulfillment_status;
            let fulfillmentUpdated = false;
            
            processingSummary.fulfillment.targetStatus = desiredStatus;

            // Retry logic: try 3 times to find an open fulfillment
            for (let attempt = 1; attempt <= 3; attempt++) {
                addLog(`Fulfillment Update Attempt ${attempt}/3`);
                
                // Re-fetch order on subsequent attempts to get latest state
                let currentOrder = order;
                if (attempt > 1) {
                    try {
                        addLog('Re-fetching order from Shopify...');
                        currentOrder = await shopify.order.get(orderId, { fields: 'id,fulfillments' });
                    } catch (fetchErr: any) {
                        addLog('Error re-fetching order', { error: fetchErr.message });
                    }
                }

                const fulfillments = currentOrder.fulfillments || [];
                
                // Detailed Logging of found fulfillments for debugging
                addLog(`Scanning ${fulfillments.length} fulfillments`, { 
                    fulfillments: fulfillments.map((f: any) => ({
                        id: f.id,
                        status: f.status,
                        service: f.service,
                        tracking_company: f.tracking_company,
                        created_at: f.created_at
                    }))
                });

                // Strategy A: Check Legacy Fulfillments
                const openFulfillment = fulfillments.find((f: any) => 
                    f.status === 'success' || f.status === 'open' || f.status === 'processing' || f.status === null
                );

                if (openFulfillment) {
                    addLog('Found target legacy fulfillment', { id: openFulfillment.id, status: openFulfillment.status });
                    try {
                        addLog(`Creating fulfillment event: ${desiredStatus}`);
                        // FIX: Pass orderId as the first argument
                        await shopify.fulfillmentEvent.create(orderId, openFulfillment.id, { status: desiredStatus });
                        addLog('Fulfillment event created successfully');
                        
                        processingSummary.fulfillment.status = 'success';
                        processingSummary.fulfillment.retries = attempt - 1;

                        await logEvent('SUCCESS', `Processed Order ${orderId}`, body);
                        fulfillmentUpdated = true;
                        break; // Exit loop on success
                    } catch (fError: any) {
                        addLog('Error updating fulfillment event', { error: fError.message });
                    }
                } else {
                    // Strategy B: Check Fulfillment Orders (New / Local Delivery)
                    addLog('No legacy fulfillment found. Checking Fulfillment Orders (Strategy B)...');
                    try {
                        // @ts-ignore
                        const fulfillmentOrders = await shopify.order.fulfillmentOrders(orderId);
                        
                        // Find an OPEN or IN_PROGRESS fulfillment order
                        const openFulfillmentOrder = fulfillmentOrders.find((fo: any) => 
                            fo.status === 'open' || fo.status === 'in_progress'
                        );

                        if (openFulfillmentOrder) {
                            addLog('Found open Fulfillment Order', { 
                                id: openFulfillmentOrder.id, 
                                status: openFulfillmentOrder.status,
                                delivery_method: openFulfillmentOrder.delivery_method ? openFulfillmentOrder.delivery_method.method_type : 'N/A'
                            });

                            // Create Fulfillment (V2)
                            addLog(`Creating Fulfillment from Order (V2)`);
                            
                            const fulfillmentParams: any = {
                                line_items_by_fulfillment_order: [
                                    { fulfillment_order_id: openFulfillmentOrder.id }
                                ]
                            };

                            // If we want "In Transit" / "Out for Delivery", we need the fulfillment to be OPEN.
                            if (desiredStatus === 'in_transit' || desiredStatus === 'out_for_delivery') {
                                // Extract tracking info robustly
                                const trackingNumber = body.awb_no || body.data?.awb_no || body.tracking_number || body.data?.tracking_number || 'PENDING';
                                const trackingCompany = body.tracking_company || body.data?.tracking_company || 'Local Delivery';
                                const trackingUrl = body.tracking_url || body.data?.tracking_url;

                                fulfillmentParams.tracking_info = {
                                    number: trackingNumber,
                                    company: trackingCompany
                                };
                                if (trackingUrl) fulfillmentParams.tracking_info.url = trackingUrl;
                                
                                fulfillmentParams.notify_customer = true; 
                                addLog('Extracted tracking info', { trackingNumber, trackingCompany });
                            }

                            // @ts-ignore
                            const newFulfillment = await shopify.fulfillment.createV2(fulfillmentParams);
                            
                            addLog('Fulfillment created successfully (V2)', { id: newFulfillment.id, status: newFulfillment.status });
                            
                            // Now apply the specific status event
                            if (newFulfillment && newFulfillment.id && desiredStatus) {
                                try {
                                     // FIX: Pass orderId as the first argument
                                     await shopify.fulfillmentEvent.create(orderId, newFulfillment.id, { status: desiredStatus });
                                     addLog(`Applied status event: ${desiredStatus}`);
                                } catch (eventErr: any) {
                                     addLog(`Error adding status event`, { error: eventErr.message });
                                }
                            }

                            processingSummary.fulfillment.status = 'success';
                            processingSummary.fulfillment.retries = attempt - 1;

                            await logEvent('SUCCESS', `Processed Order ${orderId} (via FulfillmentOrder)`, body);
                            fulfillmentUpdated = true;
                            break; // Exit loop on success

                        } else {
                            addLog('No open Fulfillment Order found', { count: fulfillmentOrders.length });
                        }

                    } catch (foError: any) {
                        // 403 or other errors
                        addLog('Failed to check Fulfillment Orders', { error: foError.message });
                    }
                }

                if (!fulfillmentUpdated) {
                    if (attempt < 3) {
                         addLog('Waiting 3s before retry...');
                         await new Promise(resolve => setTimeout(resolve, 3000));
                    } else {
                         processingSummary.fulfillment.retries = 3;
                    }
                }
            }

            if (!fulfillmentUpdated) {
                addLog('Failed to update fulfillment after 3 attempts');
                processingSummary.fulfillment.status = 'failed';
                processingSummary.fulfillment.error = 'No open fulfillment found after 3 retries';
                await logEvent('WARNING', `Fulfillment update skipped - no open fulfillment found after retries`, body);
            }

        } else {
            addLog('Fulfillment update skipped', { enabled: settings.fulfillment_update_enabled });
            processingSummary.fulfillment.status = 'skipped';
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
