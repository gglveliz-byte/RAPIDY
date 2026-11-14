import fs from "node:fs";
import bcrypt from "bcryptjs";
import pg from "pg";

const envFile = process.env.ENV_FILE || ".env";
if (fs.existsSync(envFile)) {
  const parsed = Object.fromEntries(
    fs
      .readFileSync(envFile, "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2].replace(/^["']|["']$/g, "")]),
  );
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";

if (!email) throw new Error("ADMIN_EMAIL es obligatorio");
if (password.length < 12) throw new Error("ADMIN_PASSWORD debe tener al menos 12 caracteres");
if (/admin|password|rapidy|quickgo|123456|test/i.test(password)) {
  throw new Error("ADMIN_PASSWORD es demasiado predecible");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL es obligatorio");

const hash = await bcrypt.hash(password, 12);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await pool.query(
    `UPDATE users
     SET password_hash = $1,
         session_version = COALESCE(session_version, 0) + 1,
         "updatedAt" = NOW()
     WHERE lower(email) = $2 AND role = 'admin'`,
    [hash, email],
  );
  if (result.rowCount === 0) {
    throw new Error("No existe un admin con ese email");
  }
  console.log(`Admin password updated: ${email} (sessions revoked)`);
} finally {
  await pool.end();
}