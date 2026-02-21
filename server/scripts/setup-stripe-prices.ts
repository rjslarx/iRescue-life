/**
 * Setup Stripe Products and Prices
 * Run this once to create the subscription products and prices in your Stripe account
 * 
 * Usage: tsx server/scripts/setup-stripe-prices.ts
 */

import Stripe from 'stripe';

const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.TESTING_STRIPE_SECRET_KEY;

if (!stripeKey) {
  console.error('❌ Missing STRIPE_SECRET_KEY or TESTING_STRIPE_SECRET_KEY environment variable');
  process.exit(1);
}

const stripe = new Stripe(stripeKey, {
  apiVersion: '2025-09-30.clover',
});

async function setupStripePrices() {
  console.log('🔧 Setting up Stripe products and prices...\n');

  const tiers = [
    {
      name: 'iRescue Starter',
      description: 'Perfect for small rescues - up to 50 animals in care',
      price: 1200, // $12.00 in cents
      tier: 'starter',
    },
    {
      name: 'iRescue Professional',
      description: 'For growing organizations - unlimited animals and records',
      price: 3900, // $39.00 in cents
      tier: 'professional',
    },
    {
      name: 'iRescue Enterprise',
      description: 'For large organizations - unlimited everything with priority support',
      price: 9900, // $99.00 in cents
      tier: 'enterprise',
    },
  ];

  const results: Record<string, string> = {};

  for (const tier of tiers) {
    console.log(`📦 Creating product: ${tier.name}...`);
    
    // Create product
    const product = await stripe.products.create({
      name: tier.name,
      description: tier.description,
      metadata: {
        tier: tier.tier,
      },
    });

    console.log(`   ✅ Product created: ${product.id}`);

    // Create price
    console.log(`💰 Creating price for ${tier.name}...`);
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: tier.price,
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
      metadata: {
        tier: tier.tier,
      },
    });

    console.log(`   ✅ Price created: ${price.id}\n`);
    results[tier.tier] = price.id;
  }

  console.log('\n✨ Setup complete! Add these price IDs to your application:\n');
  console.log('Environment variables to add:');
  console.log(`STRIPE_PRICE_STARTER=${results.starter}`);
  console.log(`STRIPE_PRICE_PROFESSIONAL=${results.professional}`);
  console.log(`STRIPE_PRICE_ENTERPRISE=${results.enterprise}`);
  
  console.log('\nOr update TenantSignupPage.tsx with these values:');
  console.log(`const STRIPE_PRICES = {`);
  console.log(`  starter: '${results.starter}',`);
  console.log(`  professional: '${results.professional}',`);
  console.log(`  enterprise: '${results.enterprise}',`);
  console.log(`};`);

  return results;
}

setupStripePrices()
  .then(() => {
    console.log('\n✅ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error setting up Stripe prices:', error.message);
    process.exit(1);
  });
