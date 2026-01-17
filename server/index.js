import express from "express";
import pg from "pg";

const { Pool } = pg;
const app = express();
const PORT = Number(process.env.PORT || 4000);
const DATABASE_URL = process.env.DATABASE_URL;
const LOGIN_USER = process.env.LOGIN_USER || "";
const LOGIN_PASS = process.env.LOGIN_PASS || "";

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
});

app.use(express.json({ limit: "2mb" }));

const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id integer PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz DEFAULT now()
    );
  `);
};

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false });
  }
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!LOGIN_USER || !LOGIN_PASS) {
    res.status(500).json({ error: "Login not configured." });
    return;
  }
  if (username === LOGIN_USER && password === LOGIN_PASS) {
    res.json({ ok: true });
    return;
  }
  res.status(401).json({ error: "Invalid credentials." });
});

app.get("/api/state", async (_req, res) => {
  try {
    const result = await pool.query("SELECT data FROM app_state WHERE id = 1");
    if (result.rowCount === 0) {
      res.json({ state: null });
      return;
    }
    res.json({ state: result.rows[0].data });
  } catch (error) {
    res.status(500).json({ error: "Failed to load state." });
  }
});

app.put("/api/state", async (req, res) => {
  const { state } = req.body || {};
  if (!state?.profile || !Array.isArray(state?.projects)) {
    res.status(400).json({ error: "Invalid state payload." });
    return;
  }
  try {
    await pool.query(
      `
        INSERT INTO app_state (id, data, updated_at)
        VALUES (1, $1, now())
        ON CONFLICT (id)
        DO UPDATE SET data = EXCLUDED.data, updated_at = now();
      `,
      [state]
    );
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to save state." });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API listening on ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database.", error);
    process.exit(1);
  });
