require('dotenv').config();
const Shopify = require('shopify-api-node');

const { SHOPIFY_SHOP_DOMAIN, SHOPIFY_ACCESS_TOKEN } = process.env;
const ORDER_ID = '7096090067259';

const shopify = new Shopify({
  shopName: SHOPIFY_SHOP_DOMAIN,
  accessToken: SHOPIFY_ACCESS_TOKEN,
});

async function main() {
  try {
    console.log(`Fetching order ${ORDER_ID}...`);
    const order = await shopify.order.get(ORDER_ID, { fields: 'id,tags,name' });
    console.log(`Order ${order.name} found. Current tags: "${order.tags}"`);

    const specificTag = 'test-ofd';
    const currentTags = order.tags ? order.tags.split(',').map(t => t.trim()) : [];

    if (!currentTags.includes(specificTag)) {
      console.log(`Adding tag "${specificTag}"...`);
      const newTags = [...currentTags, specificTag].join(',');
      await shopify.order.update(ORDER_ID, { tags: newTags });
      console.log('Tag added successfully!');
      
      // Verify
      const updatedOrder = await shopify.order.get(ORDER_ID, { fields: 'tags' });
      console.log(`Verified tags: "${updatedOrder.tags}"`);
    } else {
      console.log(`Order already has tag "${specificTag}". Skipping.`);
    }

  } catch (error) {
    console.error('Error updating order:', error);
    if (error.response) {
      console.error('Response body:', error.response.body);
    }
  }
}

main();
