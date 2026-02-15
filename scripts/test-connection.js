require('dotenv').config();
const Shopify = require('shopify-api-node');

const { SHOPIFY_SHOP_DOMAIN, SHOPIFY_ACCESS_TOKEN } = process.env;

if (!SHOPIFY_SHOP_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
  console.error('Missing credentials');
  process.exit(1);
}

const shopify = new Shopify({
  shopName: SHOPIFY_SHOP_DOMAIN,
  accessToken: SHOPIFY_ACCESS_TOKEN,
});

async function main() {
  try {
    const shop = await shopify.shop.get();
    console.log('Connected to shop:', shop.domain);
    console.log('Shop Name:', shop.name);
    console.log('Shop ID:', shop.id);
  } catch (error) {
    console.error('Error connecting to shop:', error);
    // If domain is wrong, maybe we can try to find it? No, we need it to connect.
    // Error usually indicates if domain is wrong or token is invalid.
  }
}

main();
