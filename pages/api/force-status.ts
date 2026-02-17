import type { NextApiRequest, NextApiResponse } from 'next';
import { sql } from '@vercel/postgres';
import shopify from '../../lib/shopify';

/**
 * API to manually force a fulfillment status update for a specific order.
 * This reuses the logic from 'shipping-update.ts' but is triggered manually from the UI.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { orderId, status, trackingNumber, trackingCompany } = req.body;

  if (!orderId || !status) {
    return res.status(400).json({ message: 'Missing orderId or status' });
  }

  const desiredStatus = status; // in_transit, out_for_delivery, delivered
  const flowLog: any[] = [];
  const addLog = (step: string, detail: any = null) => {
    const entry = { timestamp: new Date().toISOString(), step, detail };
    console.log(`[Force] ${step}`, detail ? JSON.stringify(detail) : '');
    flowLog.push(entry);
  };

  try {
    addLog('Manual Force Request Received', { orderId, status });

    // 1. Fetch Order and Fulfillments
    let order;
    try {
        // If orderId is not a number, try searching by name
        if (isNaN(Number(orderId))) {
            addLog('OrderId is not numeric, searching by name', { name: orderId });
            const foundOrders = await shopify.order.list({ name: orderId, status: 'any', limit: 1 });
            if (foundOrders.length > 0) {
                order = foundOrders[0];
                addLog('Order found by name', { id: order.id });
            } else {
                return res.status(404).json({ message: `Order Name ${orderId} not found` });
            }
        } else {
            order = await shopify.order.get(orderId, { fields: 'id,name,fulfillments,tags' });
        }
    } catch (e: any) {
        return res.status(404).json({ message: `Order ${orderId} not found: ${e.message}` });
    }

    const orderNumericId = order.id;
    const fulfillments = order.fulfillments || [];
    addLog('Order Fetched', { name: order.name, fulfillmentCount: fulfillments.length });

    // Strategy 0: Mark as Ready/Out for Delivery (Blue Badge)
    // We avoid creating a fulfillment Record for these states because it turns the badge Grey.
    if (desiredStatus === 'ready_for_delivery' || desiredStatus === 'out_for_delivery' || desiredStatus === 'in_transit') {
        addLog(`Action: Mark as Ready/Out for Delivery requested for status: ${desiredStatus}`);
        // @ts-ignore
        const fos = await shopify.order.fulfillmentOrders(orderNumericId);
        const openFO = fos.find((fo: any) => fo.status === 'open' || fo.status === 'in_progress');
        
        if (openFO) {
            addLog('Found Fulfillment Order to mark', { id: openFO.id, currentStatus: openFO.status });
            
            // For "Out for Delivery", we use the specific endpoint.
            // For others (Ready, In Transit), we use "Ready for Delivery" as the base Blue state.
            const endpoint = desiredStatus === 'out_for_delivery' ? 'mark_as_out_for_delivery' : 'mark_as_ready_for_delivery';
            const url = `/fulfillment_orders/${openFO.id}/${endpoint}.json`;
            
            // @ts-ignore
            await shopify.request(url, 'POST');
            addLog(`Successfully marked as ${endpoint} (REST)`);
            
            // Log to DB
            await sql`
              INSERT INTO webhook_logs (status, message, payload, flow_log, summary)
              VALUES ('SUCCESS', ${`Manually set ${desiredStatus}: Order ${orderNumericId}`}, ${JSON.stringify({ manual: true, orderId, status })}, ${JSON.stringify(flowLog)}, ${JSON.stringify({ manual: true, badge: 'blue' })});
            `;
            return res.status(200).json({ message: `Marked as ${desiredStatus} (Blue Badge)`, flowLog });
        } else {
            addLog('No open/in-progress fulfillment order found for this action');
            return res.status(400).json({ message: 'No OPEN fulfillment order found.', flowLog });
        }
    }

    // Strategy A: Update existing fulfillment
    const openFulfillment = fulfillments.find((f: any) => 
        f.status === 'success' || f.status === 'open' || f.status === 'processing'
    );

    if (openFulfillment) {
        addLog('Updating existing legacy fulfillment', { id: openFulfillment.id, status: openFulfillment.status });
        
        // If we want it to be BLUE, try calling 'open' first if it's currently 'success'
        if (openFulfillment.status === 'success' && (desiredStatus === 'in_transit' || desiredStatus === 'out_for_delivery')) {
            try {
                addLog('Attempting to re-open fulfillment');
                await shopify.fulfillment.open(orderNumericId, openFulfillment.id);
                addLog('Fulfillment re-opened');
            } catch (e: any) {
                addLog('Re-open failed (already open or not supported)', { error: e.message });
            }
        }

        addLog(`Creating fulfillment event: ${desiredStatus}`);
        await shopify.fulfillmentEvent.create(orderNumericId, openFulfillment.id, { status: desiredStatus });
        addLog('Fulfillment event created successfully');
    } else {
        // Strategy B: Create fulfillment from Fulfillment Order
        addLog('No active fulfillment found. Checking Fulfillment Orders...');
        // @ts-ignore
        const fulfillmentOrders = await shopify.order.fulfillmentOrders(orderNumericId);
        const openFO = fulfillmentOrders.find((fo: any) => fo.status === 'open' || fo.status === 'in_progress');

        if (openFO) {
            addLog('Found open Fulfillment Order', { id: openFO.id });
            const params: any = {
                line_items_by_fulfillment_order: [{ fulfillment_order_id: openFO.id }]
            };

            if (desiredStatus === 'in_transit' || desiredStatus === 'out_for_delivery') {
                params.tracking_info = {
                    number: trackingNumber || 'MANUAL-FORCE',
                    company: trackingCompany || 'Local Delivery'
                };
                params.status = 'open';
            }

            // @ts-ignore
            const newF = await shopify.fulfillment.createV2(params);
            addLog('Fulfillment created (V2)', { id: newF.id, status: newF.status });

            // Explicitly open if it defaulted to success
            if (newF.status === 'success' && (desiredStatus === 'in_transit' || desiredStatus === 'out_for_delivery')) {
                try {
                    await shopify.fulfillment.open(orderNumericId, newF.id);
                    addLog('Fulfillment explicitly opened');
                } catch (e) {}
            }

            // More delay for Shopify to catch up
            await new Promise(r => setTimeout(r, 3000));
            await shopify.fulfillmentEvent.create(orderNumericId, newF.id, { status: desiredStatus });
            addLog('Fulfillment event created');
        } else {
            addLog('No open fulfillment orders found. Cannot force status change.');
            return res.status(400).json({ message: 'No open fulfillment orders found' });
        }
    }

    // Log the manual action in the DB
    const summary = {
        manual: true,
        fulfillment: { status: 'success', targetStatus: desiredStatus }
    };

    await sql`
      INSERT INTO webhook_logs (status, message, payload, flow_log, summary)
      VALUES (
        'SUCCESS',
        ${`Manually forced status: ${desiredStatus} for Order ${orderId}`},
        ${JSON.stringify({ manual: true, orderId, status })},
        ${JSON.stringify(flowLog)},
        ${JSON.stringify(summary)}
      );
    `;

    return res.status(200).json({ message: 'Status updated successfully', flowLog });
  } catch (error: any) {
    addLog('FATAL ERROR', { message: error.message });
    return res.status(500).json({ message: error.message, flowLog });
  }
}
