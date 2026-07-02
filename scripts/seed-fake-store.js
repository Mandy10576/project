require('dotenv').config();
const { Pool } = require('pg');

// Initialize database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function seedFakeStore() {
  console.log('🌐 Fetching products from Fake Store API...');
  
  try {
    const response = await fetch('https://fakestoreapi.com/products');
    if (!response.ok) {
      throw new Error(`Failed to fetch from Fake Store API: ${response.status} ${response.statusText}`);
    }
    
    const fakeProducts = await response.json();
    console.log(`📦 Fetched ${fakeProducts.length} products from Fake Store API.`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Clear existing products
      console.log('🗑️ Clearing existing products from database...');
      await client.query('DELETE FROM products');

      console.log('🌱 Inserting Fake Store products into database...');
      for (const p of fakeProducts) {
        const id = `prod-${p.id}`;
        const name = p.title.substring(0, 255);
        const description = p.description;
        const price = (parseFloat(p.price) || 0.0) * 95.0;
        
        // Format category name to look nicer (e.g. "men's clothing" -> "Men's Clothing")
        const category = p.category
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        // Assign a random stock number between 20 and 100 for shopping cart practice
        const stock = Math.floor(Math.random() * 81) + 20;
        const imageUrl = p.image;

        await client.query(
          `INSERT INTO products (id, name, description, price, category, stock, image_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, name, description, price, category, stock, imageUrl]
        );
        console.log(`✅ Saved product: "${name.substring(0, 30)}..." ($${price.toFixed(2)})`);
      }

      await client.query('COMMIT');
      console.log('\n🎉 Successfully seeded database with Fake Store API products!');
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

seedFakeStore();
