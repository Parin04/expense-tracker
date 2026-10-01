const { Pool, types } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

// DATE ให้คืนเป็น string "YYYY-MM-DD" ตรงๆ ไม่แปลงเป็น Date (กันวันเลื่อนเพราะ timezone)
types.setTypeParser(1082, (v) => v);
// NUMERIC ให้คืนเป็น number
types.setTypeParser(1700, (v) => parseFloat(v));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // ต่อจากนอก Render (External URL) ต้องใช้ SSL, ใน Render (Internal URL) ไม่ต้อง
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

// connection ที่ว่างอยู่หลุด (เช่น DB restart) ไม่ให้ทำ app crash, pool จะต่อใหม่เอง
pool.on("error", (err) => {
  console.error("Idle database connection error:", err.message);
});

async function waitForDb(retries = 10, delayMs = 2000) {
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      if (attempt >= retries) throw err;
      console.log(`Database not ready (${err.message}), retry ${attempt}/${retries}...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function init() {
  await waitForDb();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id         SERIAL PRIMARY KEY,
      type       VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
      amount     NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
      category   VARCHAR(50) NOT NULL,
      note       VARCHAR(200) NOT NULL DEFAULT '',
      date       DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS transactions_date_idx ON transactions (date)");
}

module.exports = { pool, init };
