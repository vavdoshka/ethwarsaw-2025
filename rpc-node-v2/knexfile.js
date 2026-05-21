const path = require("node:path");
const fs = require("node:fs");

const sqliteDbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "rpc-node-v2-data", "state.sqlite3");
fs.mkdirSync(path.dirname(sqliteDbPath), { recursive: true });

module.exports = {
  sqlite: {
    client: "better-sqlite3",
    connection: {
      filename: sqliteDbPath
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, "migrations")
    }
  },
  postgres: {
    client: "pg",
    connection: process.env.DATABASE_URL || {
      host: process.env.PGHOST || "127.0.0.1",
      port: Number.parseInt(process.env.PGPORT || "5432", 10),
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD || "",
      database: process.env.PGDATABASE || "rpc_node_v2"
    },
    migrations: {
      directory: path.join(__dirname, "migrations")
    }
  }
};
