import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

// 仅服务端使用（Next.js serverExternalPackages 需包含 better-sqlite3）
const dbPath = process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'music-agent.db');
mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma('busy_timeout = 5000'); // 多连接/未来多进程写入冲突时等待，而非直接 SQLITE_BUSY
sqlite.pragma('journal_mode = WAL');

function tableExists(name: string): boolean {
  const row = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { name: string } | undefined;
  return row?.name === name;
}

// R0 PRD 状态机迁移：旧库中的简化状态一次性映射为显式生命周期状态。
if (tableExists('songs')) {
  sqlite.exec(`
    UPDATE songs SET status = CASE
      WHEN status IN ('pending', 'submitted') THEN 'submitted'
      WHEN status IN ('processing', 'generating') THEN 'generating'
      WHEN status IN ('success', 'done', 'completed') THEN 'completed'
      WHEN status = 'cancelled' THEN 'cancelled'
      ELSE 'failed'
    END
    WHERE status NOT IN ('draft', 'submitted', 'generating', 'completed', 'failed', 'cancelled');
  `);
}
if (tableExists('generation_jobs')) {
  sqlite.exec(`
    UPDATE generation_jobs SET status = CASE
      WHEN status IN ('pending', 'submitted') THEN 'submitted'
      WHEN status IN ('processing', 'generating') THEN 'generating'
      WHEN status IN ('success', 'completed') THEN 'completed'
      WHEN status = 'cancelled' THEN 'cancelled'
      ELSE 'failed'
    END
    WHERE status NOT IN ('submitted', 'generating', 'completed', 'failed', 'cancelled');
  `);
}

export const db = drizzle(sqlite, { schema });
export { schema };
