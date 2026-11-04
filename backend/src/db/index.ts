import Database from 'better-sqlite3';
import { Pull } from '../types/index.js';

const db: Database.Database = new Database(process.env.DATABASE_PATH || 'claw-machine.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS pulls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pullId TEXT NOT NULL UNIQUE,
    player TEXT NOT NULL,
    sequenceNumber TEXT NOT NULL,
    feePaid TEXT DEFAULT NULL,
    txHash TEXT NOT NULL,
    blockNumber TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    resolved INTEGER DEFAULT 0,
    legendary INTEGER DEFAULT NULL,
    stocks TEXT DEFAULT NULL,
    amounts TEXT DEFAULT NULL,
    valueUsd6 TEXT DEFAULT NULL,
    randomNumber TEXT DEFAULT NULL,
    resolvedTxHash TEXT DEFAULT NULL,
    resolvedBlockNumber TEXT DEFAULT NULL,
    resolvedTimestamp INTEGER DEFAULT NULL,
    refunded INTEGER DEFAULT 0,
    refundAmount TEXT DEFAULT NULL,
    refundTxHash TEXT DEFAULT NULL,
    refundBlockNumber TEXT DEFAULT NULL,
    refundTimestamp INTEGER DEFAULT NULL
  );
`);

// Additive migrations for databases created by older versions of the backend.
const existingColumns = new Set(
  (db.prepare(`PRAGMA table_info(pulls)`).all() as Array<{ name: string }>).map((row) => row.name),
);

const addedColumns: Array<[string, string]> = [
  ['feePaid', 'TEXT DEFAULT NULL'],
  ['valueUsd6', 'TEXT DEFAULT NULL'],
  ['randomNumber', 'TEXT DEFAULT NULL'],
  ['refunded', 'INTEGER DEFAULT 0'],
  ['refundAmount', 'TEXT DEFAULT NULL'],
  ['refundTxHash', 'TEXT DEFAULT NULL'],
  ['refundBlockNumber', 'TEXT DEFAULT NULL'],
  ['refundTimestamp', 'INTEGER DEFAULT NULL'],
];

for (const [name, definition] of addedColumns) {
  if (!existingColumns.has(name)) {
    db.exec(`ALTER TABLE pulls ADD COLUMN ${name} ${definition}`);
  }
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_player ON pulls(player);
  CREATE INDEX IF NOT EXISTS idx_pullId ON pulls(pullId);
  CREATE INDEX IF NOT EXISTS idx_resolved ON pulls(resolved);
  CREATE INDEX IF NOT EXISTS idx_refunded ON pulls(refunded);
  CREATE INDEX IF NOT EXISTS idx_timestamp ON pulls(timestamp DESC);

  CREATE TABLE IF NOT EXISTS indexer_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    lastBlock TEXT NOT NULL
  );
`);

const insertPullStmt = db.prepare(`
  INSERT OR IGNORE INTO pulls (pullId, player, sequenceNumber, feePaid, txHash, blockNumber, timestamp)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const updatePullResolvedStmt = db.prepare(`
  UPDATE pulls
  SET resolved = 1,
      legendary = ?,
      stocks = ?,
      amounts = ?,
      valueUsd6 = ?,
      randomNumber = ?,
      resolvedTxHash = ?,
      resolvedBlockNumber = ?,
      resolvedTimestamp = ?
  WHERE pullId = ?
`);

const markPullRefundedStmt = db.prepare(`
  UPDATE pulls
  SET resolved = 1,
      valueUsd6 = COALESCE(valueUsd6, '0'),
      refunded = 1,
      refundAmount = ?,
      refundTxHash = ?,
      refundBlockNumber = ?,
      refundTimestamp = ?
  WHERE pullId = ?
`);

const getPullByIdStmt = db.prepare(`
  SELECT * FROM pulls WHERE pullId = ?
`);

const getPullsByPlayerStmt = db.prepare(`
  SELECT * FROM pulls WHERE LOWER(player) = LOWER(?) ORDER BY CAST(blockNumber AS INTEGER) DESC, id DESC
`);

const getRecentPullsStmt = db.prepare(`
  SELECT * FROM pulls ORDER BY CAST(blockNumber AS INTEGER) DESC, id DESC LIMIT ?
`);

const getLeaderboardStmt = db.prepare(`
  SELECT
    player,
    COUNT(*) as totalPulls,
    SUM(CASE WHEN resolved = 1 AND refunded = 0 AND legendary = 1 THEN 1 ELSE 0 END) as legendaryCount,
    SUM(
      CASE WHEN resolved = 1 AND refunded = 0 THEN
        CAST(
          COALESCE(valueUsd6, CASE WHEN legendary = 1 THEN '10000000' ELSE '730000' END)
          AS INTEGER
        )
      ELSE 0 END
    ) as totalValueUsd6
  FROM pulls
  GROUP BY player
  ORDER BY totalValueUsd6 DESC, totalPulls DESC
  LIMIT ?
`);

const getLastBlockStmt = db.prepare(`
  SELECT lastBlock FROM indexer_state WHERE id = 1
`);

const setLastBlockStmt = db.prepare(`
  INSERT OR REPLACE INTO indexer_state (id, lastBlock) VALUES (1, ?)
`);

function rowToPull(row: any): Pull {
  return {
    id: row.id,
    pullId: BigInt(row.pullId),
    player: row.player,
    sequenceNumber: BigInt(row.sequenceNumber),
    feePaid: row.feePaid || undefined,
    txHash: row.txHash,
    blockNumber: BigInt(row.blockNumber),
    timestamp: row.timestamp,
    resolved: Boolean(row.resolved),
    legendary: row.legendary !== null ? Boolean(row.legendary) : undefined,
    stocks: row.stocks ? JSON.parse(row.stocks) : undefined,
    amounts: row.amounts ? JSON.parse(row.amounts) : undefined,
    valueUsd6: row.valueUsd6 || undefined,
    randomNumber: row.randomNumber || undefined,
    resolvedTxHash: row.resolvedTxHash || undefined,
    resolvedBlockNumber: row.resolvedBlockNumber ? BigInt(row.resolvedBlockNumber) : undefined,
    resolvedTimestamp: row.resolvedTimestamp || undefined,
    refunded: Boolean(row.refunded),
    refundAmount: row.refundAmount || undefined,
    refundTxHash: row.refundTxHash || undefined,
    refundBlockNumber: row.refundBlockNumber ? BigInt(row.refundBlockNumber) : undefined,
    refundTimestamp: row.refundTimestamp || undefined,
  };
}

export function insertPull(pull: {
  pullId: string;
  player: string;
  sequenceNumber: string;
  feePaid?: string;
  txHash: string;
  blockNumber: string;
  timestamp: number;
}) {
  return insertPullStmt.run(
    pull.pullId,
    pull.player,
    pull.sequenceNumber,
    pull.feePaid ?? null,
    pull.txHash,
    pull.blockNumber,
    pull.timestamp,
  );
}

export function updatePullResolved(data: {
  pullId: string;
  legendary: boolean;
  stocks: string[];
  amounts: string[];
  valueUsd6: string;
  randomNumber: string;
  txHash: string;
  blockNumber: string;
  timestamp: number;
}) {
  return updatePullResolvedStmt.run(
    data.legendary ? 1 : 0,
    JSON.stringify(data.stocks),
    JSON.stringify(data.amounts),
    data.valueUsd6,
    data.randomNumber,
    data.txHash,
    data.blockNumber,
    data.timestamp,
    data.pullId,
  );
}

export function markPullRefunded(data: {
  pullId: string;
  amount: string;
  txHash: string;
  blockNumber: string;
  timestamp: number;
}) {
  return markPullRefundedStmt.run(
    data.amount,
    data.txHash,
    data.blockNumber,
    data.timestamp,
    data.pullId,
  );
}

export function getPullById(pullId: string): Pull | undefined {
  const row = getPullByIdStmt.get(pullId) as any;
  return row ? rowToPull(row) : undefined;
}

export function getPullsByPlayer(player: string): Pull[] {
  const rows = getPullsByPlayerStmt.all(player) as any[];
  return rows.map(rowToPull);
}

export function getRecentPulls(limit: number): Pull[] {
  const rows = getRecentPullsStmt.all(limit) as any[];
  return rows.map(rowToPull);
}

export function getLeaderboard(limit: number = 100) {
  return getLeaderboardStmt.all(limit) as Array<{
    player: string;
    totalPulls: number;
    legendaryCount: number | null;
    totalValueUsd6: number | null;
  }>;
}

export function getLastBlock(): bigint | null {
  const row = getLastBlockStmt.get() as any;
  return row ? BigInt(row.lastBlock) : null;
}

export function setLastBlock(block: bigint) {
  return setLastBlockStmt.run(block.toString());
}

export { db };
