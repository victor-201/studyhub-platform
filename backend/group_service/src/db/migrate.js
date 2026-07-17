import { pool } from "../config/db.js";

const migrations = [
  `ALTER TABLE groups ADD COLUMN IF NOT EXISTS access VARCHAR(20) DEFAULT 'PUBLIC' NOT NULL`,
  `ALTER TABLE groups ADD COLUMN IF NOT EXISTS auto_approve_docs SMALLINT DEFAULT 0 NOT NULL`,
];

export async function runMigrations() {
  for (const sql of migrations) {
    try {
      await pool.query(sql);
      console.log(`[migrate] OK: ${sql.substring(0, 80)}...`);
    } catch (err) {
      console.error(`[migrate] FAIL: ${sql.substring(0, 80)}...`, err.message);
    }
  }
}
