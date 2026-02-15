import Shopify from 'shopify-api-node';

if (!process.env.SHOPIFY_SHOP_DOMAIN || !process.env.SHOPIFY_ACCESS_TOKEN) {
  throw new Error('Missing SHOPIFY_SHOP_DOMAIN or SHOPIFY_ACCESS_TOKEN');
}

const shopify = new Shopify({
  shopName: process.env.SHOPIFY_SHOP_DOMAIN,
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
});

export default shopify;
