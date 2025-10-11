const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
});

async function setupDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS stocks (
                id SERIAL PRIMARY KEY,
                service_type VARCHAR(100) NOT NULL,
                account_data TEXT NOT NULL,
                used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            );
            
            CREATE TABLE IF NOT EXISTS payouts (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                user_name VARCHAR(100) NOT NULL,
                reward_type VARCHAR(100) NOT NULL,
                status VARCHAR(50) DEFAULT 'pending',
                vouch_message_id VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('[✅] Database tables created successfully');
    } catch (error) {
        console.error('[❌] Database setup error:', error);
    } finally {
        await pool.end();
    }
}

setupDatabase();