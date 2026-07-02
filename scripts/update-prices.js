require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function updatePrices() {
  console.log('🔄 Updating database products prices (multiplying by 95)...');
  try {
    const { rowCount } = await pool.query('UPDATE products SET price = price * 95.0');
    console.log(`✅ Successfully updated prices for ${rowCount} products!`);
  } catch (err) {
    console.error('❌ Error updating prices in database:', err.message);
  } finally {
    await pool.end();
  }
}

updatePrices();
