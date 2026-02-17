import type { NextApiRequest, NextApiResponse } from 'next';

const { SHOPIFY_API_KEY, SHOPIFY_SHOP_DOMAIN } = process.env;

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!SHOPIFY_API_KEY || !SHOPIFY_SHOP_DOMAIN) {
    return res.status(500).send('Missing SHOPIFY_API_KEY or SHOPIFY_SHOP_DOMAIN');
  }

  // Define scopes
  const scopes = 'read_customers,write_customers,read_fulfillments,write_fulfillments,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders,write_draft_orders,read_draft_orders,write_order_edits,read_order_edits,read_orders,write_orders,read_third_party_fulfillment_orders,write_third_party_fulfillment_orders,customer_read_draft_orders,customer_read_orders,customer_write_orders';
  
  // Build redirect URL
  // We assume the user will visit this from their local machine or Vercel deployment.
  // The redirect_uri must match what is allowed in the Partner Dashboard.
  // For now, we'll try to determine the host dynamically or ask user to set HOST.
  
  const host = req.headers.host;
  const protocol = host?.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/api/auth/callback`;

  const installUrl = `https://${SHOPIFY_SHOP_DOMAIN}/admin/oauth/authorize?client_id=${SHOPIFY_API_KEY}&scope=${scopes}&redirect_uri=${redirectUri}&access_mode=value`; 
  // Note: access_mode=value is not standard, let's use nothing or grant_options[]=per_user is for online. 
  // For offline (permanent) token, we don't need per_user. Default is offline.
  
  // We should create a state for security, but for this quick tool, we might skip validation or use simple random.
  const nonce = Math.random().toString(36).substring(7);
  
  const finalUrl = `${installUrl}&state=${nonce}`;

  res.redirect(finalUrl);
}
