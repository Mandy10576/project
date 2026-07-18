require('dotenv').config();
const { Pool } = require('pg');
const puppeteer = require('puppeteer');

// Initialize database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function bulkImport(searchTerm) {
  if (!searchTerm) {
    console.error('❌ Error: Please specify a search term. Example: node scripts/bulk-import.js "shoes"');
    process.exit(1);
  }

  console.log(`🤖 Starting Puppeteer AI Bulk Importer for keyword: "${searchTerm}"`);
  
  let browser;
  try {
    console.log(`🚀 Launching Headless Chromium Browser...`);
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    // Emulate realistic desktop window viewport
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log(`📡 Searching Amazon.in for "${searchTerm}"...`);
    const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(searchTerm)}`;
    
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Check if we hit a captcha robot wall
    const pageTitle = await page.title();
    if (pageTitle.includes('Robot Check') || pageTitle.includes('Captcha')) {
      console.warn('⚠️ Amazon triggered Robot Captcha block. Activating Sandbox feed fallback...');
      await browser.close();
      await runFallback(searchTerm);
      return;
    }

    // Extract product page links from search results (must contain /dp/ in URL)
    console.log(`🔍 Extracting product listing page URLs...`);
    let productUrls = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href*="/dp/"]'));
      return anchors
        .map(a => a.href)
        .filter(url => url.includes('/dp/') && !url.includes('/customerReviews') && !url.includes('/offer-listing/'));
    });

    // Deduplicate URLs
    productUrls = [...new Set(productUrls)].slice(0, 5);

    if (productUrls.length === 0) {
      console.warn('⚠️ No products links parsed from Amazon page. Activating Sandbox feed fallback...');
      await browser.close();
      await runFallback(searchTerm);
      return;
    }

    console.log(`📦 Found ${productUrls.length} unique product pages. Scraping details...`);

    for (let i = 0; i < productUrls.length; i++) {
      const url = productUrls[i];
      console.log(`\n🔍 [${i + 1}/${productUrls.length}] Navigating to: ${url}`);
      
      // Delay slightly between requests
      await delay(2000 + Math.random() * 1000);

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        
        // Extract product properties in browser DOM context
        const product = await page.evaluate((category) => {
          // 1. Title selector
          const titleEl = document.querySelector('#productTitle');
          const title = titleEl ? titleEl.innerText.trim() : 'Imported Product';

          // 2. Image selector
          const imgEl = document.querySelector('#landingImage') || document.querySelector('#imgBlkFront') || document.querySelector('img[data-old-hires]');
          let imageUrl = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500';
          if (imgEl) {
            imageUrl = imgEl.src || imgEl.getAttribute('data-old-hires') || imgEl.getAttribute('src');
          }

          // 3. Price selector
          const priceEl = document.querySelector('.a-price-whole');
          let price = 1499.00; // default standard fallback
          if (priceEl) {
            const parsed = parseFloat(priceEl.innerText.replace(/[^0-9.]/g, ''));
            if (!isNaN(parsed)) price = parsed;
          }

          const descEl = document.querySelector('#feature-bullets') || document.querySelector('#productDescription');
          const description = descEl ? descEl.innerText.trim().substring(0, 500) : `High quality ${category} product imported via Puppeteer browser crawler.`;

          return { title, imageUrl, price, description };
        }, searchTerm);

        if (product.title === 'Imported Product') {
          console.warn(`  ⚠️ Detail page blocked/empty. Skipping...`);
          continue;
        }

        // Convert USD price to INR if it is low (less than 250)
        if (product.price < 250) {
          product.price = Math.round(product.price * 83.0 * 100) / 100;
        }

        const id = `bulk-puppeteer-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        console.log(`  * Title: "${product.title.substring(0, 45)}..."`);
        console.log(`  * Price: ₹${product.price.toFixed(2)}`);
        console.log(`  * Image: "${product.imageUrl.substring(0, 45)}..."`);

        await pool.query(`
          INSERT INTO products (id, name, description, price, category, stock, image_url)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            price = EXCLUDED.price,
            image_url = EXCLUDED.image_url
        `, [id, product.title, product.description, product.price, searchTerm, 100, product.imageUrl]);

        console.log(`  ✅ Successfully saved to database.`);

      } catch (err) {
        console.error(`  ❌ Error parsing page details: ${err.message}`);
      }
    }

    console.log(`\n🎉 Puppeteer AI Bulk Importer finished successfully.`);
    await browser.close();
    process.exit(0);

  } catch (err) {
    console.error('❌ Puppeteer script crash error:', err);
    if (browser) await browser.close();
    process.exit(1);
  }
}

// Fallback search using open sandbox feeds
async function runFallback(searchTerm) {
  console.log(`📡 Fetching from open sandbox product feed database...`);
  try {
    const fallbackUrl = `https://dummyjson.com/products/search?q=${encodeURIComponent(searchTerm)}`;
    const fallbackRes = await fetch(fallbackUrl);
    const data = await fallbackRes.json();
    const rawList = data.products || [];

    if (rawList.length === 0) {
      console.log('❌ No fallback items found for that search query.');
      process.exit(0);
    }

    console.log(`📦 Found ${rawList.length} products. Saving to PostgreSQL...`);
    for (const item of rawList) {
      const id = `bulk-dj-${item.id}`;
      const priceInInr = Math.round(item.price * 83.0 * 100) / 100;
      const name = item.title.substring(0, 250);
      const description = item.description || 'No description available.';
      const image = item.thumbnail || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500';

      await pool.query(`
        INSERT INTO products (id, name, description, price, category, stock, image_url)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          price = EXCLUDED.price,
          image_url = EXCLUDED.image_url
      `, [id, name, description, priceInInr, item.category || 'Accessories', 100, image]);
      console.log(`✅ Saved product: "${name}" at ₹${priceInInr}`);
    }
    console.log(`🎉 Fallback import complete.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Fallback crawler error:', err);
    process.exit(1);
  }
}

// Run crawler
const searchArg = process.argv.slice(2).join(' ');
bulkImport(searchArg);
