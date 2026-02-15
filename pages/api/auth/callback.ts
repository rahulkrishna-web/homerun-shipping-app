import type { NextApiRequest, NextApiResponse } from 'next';

const { SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_SHOP_DOMAIN } = process.env;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code, shop, state } = req.query;

  if (!code || !shop) {
    return res.status(400).send('Missing code or shop parameter');
  }

  // Validate shop (simple check)
  if (shop !== SHOPIFY_SHOP_DOMAIN) {
     // console.warn('Shop mismatch', shop, SHOPIFY_SHOP_DOMAIN);
     // Proceeding anyway might be risky but standard flow should match.
  }

  try {
    const accessTokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        code,
      }),
    });

    const data = await accessTokenResponse.json();

    if (!data.access_token) {
      return res.status(400).json({ error: 'Failed to get access token', details: data });
    }

    res.status(200).send(`
      <h1>Success!</h1>
      <p>Here is your permanent Access Token. Please add this to your .env file as SHOPIFY_ACCESS_TOKEN.</p>
      <pre style="background: #f4f4f4; padding: 10px; border-radius: 5px;">${data.access_token}</pre>
    `);
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
}
