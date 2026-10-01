const express = require("express");
const path = require("path");
const db = require("./db");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const TYPES = ["income", "expense"];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// "2026-10" -> ["2026-10-01", "2026-11-01"]
function monthRange(month) {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return [`${month}-01`, `${next}-01`];
}

function getMonth(req, res) {
  const month = String(req.query.month ?? "");
  if (!MONTH_RE.test(month)) {
    res.status(400).json({ error: "month must be YYYY-MM" });
    return null;
  }
  return month;
}

app.get("/health", async (req, res) => {
  try {
    await db.pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "db unavailable" });
  }
});

app.get("/api/transactions", async (req, res) => {
  const month = getMonth(req, res);
  if (!month) return;

  const { rows } = await db.pool.query(
    `SELECT id, type, amount, category, note, date
       FROM transactions
      WHERE date >= $1 AND date < $2
      ORDER BY date DESC, id DESC`,
    monthRange(month)
  );
  res.json(rows);
});

app.get("/api/summary", async (req, res) => {
  const month = getMonth(req, res);
  if (!month) return;

  const { rows } = await db.pool.query(
    `SELECT type, category, SUM(amount) AS total
       FROM transactions
      WHERE date >= $1 AND date < $2
      GROUP BY type, category
      ORDER BY total DESC`,
    monthRange(month)
  );

  const sum = (type) => rows.filter((r) => r.type === type).reduce((s, r) => s + r.total, 0);
  const income = sum("income");
  const expense = sum("expense");

  res.json({
    income,
    expense,
    balance: income - expense,
    expenseByCategory: rows
      .filter((r) => r.type === "expense")
      .map((r) => ({ category: r.category, total: r.total })),
  });
});

app.post("/api/transactions", async (req, res) => {
  const body = req.body ?? {};
  const type = String(body.type ?? "");
  const amount = Number(body.amount);
  const category = String(body.category ?? "").trim();
  const note = String(body.note ?? "").trim();
  const date = String(body.date ?? "");

  if (!TYPES.includes(type)) return res.status(400).json({ error: "type must be income or expense" });
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 1e10) {
    return res.status(400).json({ error: "amount must be a positive number" });
  }
  if (!category || category.length > 50) return res.status(400).json({ error: "category is required" });
  if (note.length > 200) return res.status(400).json({ error: "note is too long" });
  if (!DATE_RE.test(date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });

  const { rows } = await db.pool.query(
    `INSERT INTO transactions (type, amount, category, note, date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, type, amount, category, note, date`,
    [type, Math.round(amount * 100) / 100, category, note, date]
  );
  res.status(201).json(rows[0]);
});

app.delete("/api/transactions/:id", async (req, res) => {
  const { rowCount } = await db.pool.query("DELETE FROM transactions WHERE id = $1", [
    Number(req.params.id) || 0,
  ]);
  if (rowCount === 0) return res.status(404).json({ error: "not found" });

  res.status(204).end();
});

app.use((err, req, res, next) => {
  // error จากฝั่ง client เช่น JSON ผิดรูปแบบ (body-parser ใส่ status 4xx มาให้)
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "internal server error" });
});

const PORT = process.env.PORT || 3000;

db.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to database:", err.message);
    process.exit(1);
  });
