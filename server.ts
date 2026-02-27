import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("med_inventory.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    usage TEXT,
    expiry_date TEXT,
    recommended_shelf_life TEXT,
    simple_instructions TEXT,
    interaction_warning TEXT,
    disposal_tip TEXT,
    category TEXT,
    is_taken INTEGER DEFAULT 0,
    scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS medicine_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    purpose TEXT,
    ai_schedule TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS group_items (
    group_id INTEGER,
    medicine_id INTEGER,
    FOREIGN KEY(group_id) REFERENCES medicine_groups(id) ON DELETE CASCADE,
    FOREIGN KEY(medicine_id) REFERENCES inventory(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS adherence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER,
    type TEXT, -- 'medicine' or 'group'
    time_slot TEXT, -- 'Sáng', 'Trưa', 'Chiều', 'Tối'
    date TEXT,
    status INTEGER DEFAULT 0,
    UNIQUE(item_id, type, time_slot, date)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- Inventory API ---
  app.get("/api/inventory", (req, res) => {
    const rows = db.prepare("SELECT * FROM inventory ORDER BY scanned_at DESC").all();
    res.json(rows);
  });

  app.post("/api/inventory", (req, res) => {
    const { 
      name, usage, expiry_date, recommended_shelf_life,
      simple_instructions, interaction_warning, disposal_tip, category 
    } = req.body;
    const info = db.prepare(
      `INSERT INTO inventory (name, usage, expiry_date, recommended_shelf_life, simple_instructions, interaction_warning, disposal_tip, category) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(name, usage, expiry_date, recommended_shelf_life, simple_instructions, interaction_warning, disposal_tip, category);
    res.json({ id: info.lastInsertRowid });
  });

  app.patch("/api/inventory/:id", (req, res) => {
    const { is_taken } = req.body;
    db.prepare("UPDATE inventory SET is_taken = ? WHERE id = ?").run(is_taken ? 1 : 0, req.params.id);
    res.json({ success: true });
  });

  app.delete("/api/inventory/:id", (req, res) => {
    db.prepare("DELETE FROM inventory WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // --- Groups API ---
  app.get("/api/groups", (req, res) => {
    const groups = db.prepare("SELECT * FROM medicine_groups ORDER BY created_at DESC").all();
    const result = groups.map((g: any) => {
      const items = db.prepare(`
        SELECT i.* FROM inventory i 
        JOIN group_items gi ON i.id = gi.medicine_id 
        WHERE gi.group_id = ?
      `).all(g.id);
      return { ...g, items };
    });
    res.json(result);
  });

  app.post("/api/groups", (req, res) => {
    const { name, purpose, itemIds, ai_schedule } = req.body;
    const transaction = db.transaction(() => {
      const info = db.prepare("INSERT INTO medicine_groups (name, purpose, ai_schedule) VALUES (?, ?, ?)").run(name, purpose, ai_schedule);
      const groupId = info.lastInsertRowid;
      const insertItem = db.prepare("INSERT INTO group_items (group_id, medicine_id) VALUES (?, ?)");
      for (const id of itemIds) {
        insertItem.run(groupId, id);
      }
      return groupId;
    });
    const id = transaction();
    res.json({ id });
  });

  app.delete("/api/groups/:id", (req, res) => {
    db.prepare("DELETE FROM medicine_groups WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  });

  // --- Adherence API ---
  app.get("/api/adherence", (req, res) => {
    const date = req.query.date as string;
    const rows = db.prepare("SELECT * FROM adherence WHERE date = ?").all(date);
    res.json(rows);
  });

  app.post("/api/adherence", (req, res) => {
    const { item_id, type, time_slot, date, status } = req.body;
    db.prepare(`
      INSERT INTO adherence (item_id, type, time_slot, date, status) 
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(item_id, type, time_slot, date) DO UPDATE SET status = excluded.status
    `).run(item_id, type, time_slot, date, status);
    res.json({ success: true });
  });

  // --- Chat API ---
  app.get("/api/chat", (req, res) => {
    const history = db.prepare("SELECT * FROM chat_history ORDER BY timestamp ASC").all();
    res.json(history);
  });

  app.post("/api/chat", (req, res) => {
    const { role, content } = req.body;
    db.prepare("INSERT INTO chat_history (role, content) VALUES (?, ?)").run(role, content);
    res.json({ success: true });
  });

  app.delete("/api/chat", (req, res) => {
    db.prepare("DELETE FROM chat_history").run();
    res.json({ success: true });
  });

  // --- Settings API ---
  app.get("/api/settings", (req, res) => {
    const rows = db.prepare("SELECT * FROM settings").all();
    const settings = rows.reduce((acc: any, row: any) => {
      acc[row.key] = row.value;
      return acc;
    }, {});
    res.json(settings);
  });

  app.post("/api/settings", (req, res) => {
    const { emergency_name, emergency_phone } = req.body;
    const upsert = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    upsert.run("emergency_name", emergency_name || "");
    upsert.run("emergency_phone", emergency_phone || "");
    res.json({ success: true });
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
