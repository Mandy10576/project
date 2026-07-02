require('dotenv').config();
const { Pool } = require('pg');

// Initialize database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function seedDummyJSON() {
  const limit = 100;
  const url = `https://dummyjson.com/products?limit=${limit}`;
  console.log(`🌐 Fetching ${limit} products from DummyJSON API...`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch from DummyJSON: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const dummyProducts = data.products || [];
    console.log(`📦 Fetched ${dummyProducts.length} products.`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Clear existing products
      console.log('🗑️ Clearing existing products from database...');
      await client.query('DELETE FROM products');

      console.log('🌱 Mapping and inserting DummyJSON products into database...');
      for (const p of dummyProducts) {
        const id = `prod-dj-${p.id}`;
        const name = p.title.substring(0, 255);
        const description = p.description || 'No description available.';
        const price = (parseFloat(p.price) || 0.0) * 95.0;
        
        // Map DummyJSON categories to the frontend UI's hardcoded categories:
        // Electronics, Audio, Footwear, Accessories, Furniture, Food
        let category = 'Accessories'; // Default fallback
        const rawCat = (p.category || '').toLowerCase();
        const titleLower = p.title.toLowerCase();
        const descLower = description.toLowerCase();

        // 1. Food check (based on category 'groceries' or foods, excluding pet food/tissues)
        if (
          (['groceries'].includes(rawCat) && !titleLower.includes('dog') && !titleLower.includes('cat') && !titleLower.includes('tissue') && !titleLower.includes('paper')) ||
          ['food', 'drinks'].includes(rawCat)
        ) {
          category = 'Food';
        }
        // 2. Audio check (based on title/desc keywords)
        else if (
          titleLower.includes('airpods') || 
          titleLower.includes('headphone') || 
          titleLower.includes('earbud') || 
          titleLower.includes('speaker') || 
          titleLower.includes('audio') ||
          descLower.includes('headphone') ||
          descLower.includes('earbud') ||
          descLower.includes('speaker')
        ) {
          category = 'Audio';
        }
        // 3. Electronics check
        else if (
          ['laptops', 'smartphones', 'lighting', 'automotive', 'motorcycle', 'tablets', 'mobile-accessories'].includes(rawCat) ||
          titleLower.includes('laptop') ||
          titleLower.includes('phone') ||
          titleLower.includes('charger')
        ) {
          category = 'Electronics';
        }
        // 4. Footwear check
        else if (
          ['mens-shoes', 'womens-shoes', 'shoes', 'footwear'].includes(rawCat) ||
          titleLower.includes('shoe') ||
          titleLower.includes('sneaker') ||
          titleLower.includes('boot') ||
          titleLower.includes('cleats')
        ) {
          category = 'Footwear';
        }
        // 5. Furniture check
        else if (
          ['furniture', 'home-decoration'].includes(rawCat) ||
          titleLower.includes('bed') ||
          titleLower.includes('sofa') ||
          titleLower.includes('chair') ||
          titleLower.includes('table')
        ) {
          category = 'Furniture';
        }
        // 6. Default Fallback
        else {
          category = 'Accessories';
        }

        // Use DummyJSON's actual stock, ensuring at least 10 units for practicing checkouts
        const stock = p.stock > 0 ? p.stock : 25;
        const imageUrl = p.thumbnail || (p.images && p.images[0]) || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500';

        await client.query(
          `INSERT INTO products (id, name, description, price, category, stock, image_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, name, description, price, category, stock, imageUrl]
        );
        console.log(`✅ Saved product: "${name.substring(0, 30)}..." -> Category: [${category}] ($${price.toFixed(2)})`);
      }

      await client.query('COMMIT');
      console.log(`\n🎉 Successfully seeded database with mapped DummyJSON products!`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Error seeding products:', error.message);
  } finally {
    await pool.end();
  }
}

seedDummyJSON();
