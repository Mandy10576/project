require('dotenv').config();
const { Pool } = require('pg');

// Initialize database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
];

function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Scrape details from a single product page HTML
function parseProductDetails(html, customCategory) {
  const getMetaTag = (property) => {
    const regex = new RegExp(`<meta[^>]*(?:property|name)=["']og:${property}["'][^>]*content=["']([^"']*)["']`, 'i');
    const match = html.match(regex);
    if (match) return match[1];

    const altRegex = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']og:${property}["']`, 'i');
    const altMatch = html.match(altRegex);
    return altMatch ? altMatch[1] : '';
  };

  // 1. Title Extraction
  const ogTitle = getMetaTag('title');
  const amazonTitleMatch = html.match(/<span[^>]*id=["']productTitle["'][^>]*>([^<]*)<\/span>/i);
  const genericTitleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);

  let title = 'Imported Product';
  if (ogTitle) {
    title = ogTitle;
  } else if (amazonTitleMatch) {
    title = amazonTitleMatch[1];
  } else if (genericTitleMatch) {
    title = genericTitleMatch[1];
  }

  title = title.replace(/\s+/g, ' ').trim();
  if (title.length > 250) {
    title = title.substring(0, 247) + '...';
  }

  // 2. Image Extraction
  const ogImage = getMetaTag('image');
  const amazonLandingImg = html.match(/id=["']landingImage["'][^>]*src=["']([^"']*)["']/i);
  const amazonCdnImg = html.match(/["'](https:\/\/m\.media-amazon\.com\/images\/I\/[a-zA-Z0-9%_-]+\.(?:jpg|png|jpeg))["']/i);

  let imageUrl = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500';
  if (ogImage) {
    imageUrl = ogImage;
  } else if (amazonLandingImg) {
    imageUrl = amazonLandingImg[1];
  } else if (amazonCdnImg) {
    imageUrl = amazonCdnImg[1];
  }

  // 3. Price Extraction
  let price = 1499.00; // Realistic default price in INR
  const ogPrice = getMetaTag('price') || getMetaTag('price:amount');
  const amazonPrice = html.match(/<span class=["']a-price-whole["']>([^<]*)<\/span>/i);

  if (ogPrice) {
    const parsed = parseFloat(ogPrice.replace(/[^0-9.]/g, ''));
    if (!isNaN(parsed)) price = parsed;
  } else if (amazonPrice) {
    const parsed = parseFloat(amazonPrice[1].replace(/[^0-9.]/g, ''));
    if (!isNaN(parsed)) price = parsed;
  }

  // Currency normalizer (If scraped price is in USD < 250, convert to INR by multiplying by 83)
  if (price < 250) {
    price = Math.round(price * 83.0 * 100) / 100;
  }

  const description = getMetaTag('description') || `High quality ${customCategory} imported via AI bulk scraper.`;

  return { title, imageUrl, price, description };
}

async function bulkImport(searchTerm) {
  if (!searchTerm) {
    console.error('❌ Error: Please specify a search term. Example: node scripts/bulk-import.js "shoes"');
    process.exit(1);
  }

  console.log(`🤖 Starting AI Bulk Product Importer for keyword: "${searchTerm}"`);
  console.log(`📡 Connecting to Amazon India Search...`);

  const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(searchTerm)}`;
  const headers = {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5'
  };

  let productUrls = [];

  try {
    const res = await fetch(searchUrl, { headers });
    const html = await res.text();

    if (html.includes('api-services-support@amazon.com') || html.includes('Robot Check')) {
      console.warn('⚠️ Amazon detected automated scraping (Robot Captcha). Falling back to sandbox product feed search...');
      
      // Fallback: Query Sandbox API
      const fallbackUrl = `https://dummyjson.com/products/search?q=${encodeURIComponent(searchTerm)}`;
      const fallbackRes = await fetch(fallbackUrl);
      const data = await fallbackRes.json();
      const rawList = data.products || [];

      if (rawList.length === 0) {
        console.log('❌ No products found matching that keyword in sandbox database.');
        process.exit(0);
      }

      console.log(`📦 Found ${rawList.length} products in sandbox feed. Saving directly to PostgreSQL...`);
      for (const item of rawList) {
        const id = `bulk-dj-${item.id}`;
        // Convert USD to INR
        const priceInInr = Math.round(item.price * 83.0 * 100) / 100;
        const name = item.title.substring(0, 250);
        const description = item.description || 'No description available.';
        const category = item.category || 'Electronics';
        const image = item.thumbnail || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500';

        await pool.query(`
          INSERT INTO products (id, name, description, price, category, stock, image_url)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            description = EXCLUDED.description,
            price = EXCLUDED.price,
            image_url = EXCLUDED.image_url
        `, [id, name, description, priceInInr, category, 100, image]);
        console.log(`✅ Saved product: "${name}" at ₹${priceInInr}`);
      }

      console.log(`🎉 Bulk import completed successfully. Refreshed catalog with sandbox products.`);
      process.exit(0);
    }

    // Parse Amazon product links from search results page
    const linkMatches = html.matchAll(/href=["'](\/[a-zA-Z0-9%_-]+\/dp\/[a-zA-Z0-9]{10}[^"']*)["']/g);
    for (const match of linkMatches) {
      const fullUrl = `https://www.amazon.in${match[1]}`;
      if (!productUrls.includes(fullUrl)) {
        productUrls.push(fullUrl);
      }
    }

    // Limit to top 5 products to avoid fast rate-limiting
    productUrls = productUrls.slice(0, 5);

    if (productUrls.length === 0) {
      console.warn('⚠️ No products links parsed from Amazon search results. Trying secondary fallback search...');
      // Fallback search
      const fallbackUrl = `https://dummyjson.com/products/search?q=${encodeURIComponent(searchTerm)}`;
      const fallbackRes = await fetch(fallbackUrl);
      const data = await fallbackRes.json();
      const rawList = data.products || [];

      for (const item of rawList) {
        const id = `bulk-dj-${item.id}`;
        const priceInInr = Math.round(item.price * 83.0 * 100) / 100;
        const name = item.title.substring(0, 250);
        const image = item.thumbnail || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500';

        await pool.query(`
          INSERT INTO products (id, name, description, price, category, stock, image_url)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            price = EXCLUDED.price,
            image_url = EXCLUDED.image_url
        `, [id, name, item.description, priceInInr, item.category || 'Accessories', 100, image]);
        console.log(`✅ Saved product: "${name}" at ₹${priceInInr}`);
      }
      process.exit(0);
    }

    console.log(`🔗 Found ${productUrls.length} unique Amazon product pages to scrape.`);

    for (let i = 0; i < productUrls.length; i++) {
      const url = productUrls[i];
      console.log(`\n🔍 [${i + 1}/${productUrls.length}] Scrape parsing: ${url}`);
      
      // Wait to behave like a human
      await delay(1500 + Math.random() * 1000);

      try {
        const detailRes = await fetch(url, {
          headers: {
            'User-Agent': getRandomUserAgent(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
          }
        });
        const detailHtml = await detailRes.text();

        const product = parseProductDetails(detailHtml, searchTerm);

        if (product.title === 'Imported Product') {
          console.warn(`  ⚠️ Captcha blocked detail page. Skipping...`);
          continue;
        }

        const id = `bulk-az-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

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
        console.error(`  ❌ Error scraping page: ${err.message}`);
      }
    }

    console.log(`\n🎉 AI Bulk Importer process finished.`);
    process.exit(0);

  } catch (err) {
    console.error('❌ Scraper script crash error:', err);
    process.exit(1);
  }
}

// Run script using arguments
const searchArg = process.argv.slice(2).join(' ');
bulkImport(searchArg);
