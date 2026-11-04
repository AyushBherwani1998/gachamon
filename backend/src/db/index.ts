import Database from 'better-sqlite3';
import { Pull } from '../types/index.js';

const db: Database.Database = new Database('claw-machine.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS pulls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pullId TEXT NOT NULL UNIQUE,
    player TEXT NOT NULL,
    sequenceNumber TEXT NOT NULL,
    txHash TEXT NOT NULL,
    blockNumber TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    resolved INTEGER DEFAULT 0,
    legendary INTEGER DEFAULT NULL,
    stocks TEXT DEFAULT NULL,
    amounts TEXT DEFAULT NULL,
    resolvedTxHash TEXT DEFAULT NULL,
    resolvedBlockNumber TEXT DEFAULT NULL,
    resolvedTimestamp INTEGER DEFAULT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_player ON pulls(player);
  CREATE INDEX IF NOT EXISTS idx_pullId ON pulls(pullId);
  CREATE INDEX IF NOT EXISTS idx_resolved ON pulls(resolved);
  CREATE INDEX IF NOT EXISTS idx_timestamp ON pulls(timestamp DESC);
  
  CREATE TABLE IF NOT EXISTS indexer_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    lastBlock TEXT NOT NULL
  );
`);

const insertPullStmt = db.prepare(`
  INSERT INTO pulls (pullId, player, sequenceNumber, txHash, blockNumber, timestamp)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const updatePullResolvedStmt = db.prepare(`
  UPDATE pulls
  SET resolved = 1,
      legendary = ?,
      stocks = ?,
      amounts = ?,
      resolvedTxHash = ?,
      resolvedBlockNumber = ?,
      resolvedTimestamp = ?
  WHERE pullId = ?
`);

const getPullByIdStmt = db.prepare(`
  SELECT * FROM pulls WHERE pullId = ?
`);

const getPullsByPlayerStmt = db.prepare(`
  SELECT * FROM pulls WHERE player = ? ORDER BY timestamp DESC
`);

const getLeaderboardStmt = db.prepare(`
  SELECT 
    player,
    COUNT(*) as totalPulls,
    SUM(legendary) as legendaryCount,
    SUM(CASE WHEN resolved = 1 THEN 
      CASE WHEN legendary = 1 THEN 10.0 ELSE 0.73 END
    ELSE 0 END) as totalValue
  FROM pulls
  GROUP BY player
  ORDER BY totalValue DESC
  LIMIT ?
`);

const getLastBlockStmt = db.prepare(`
  SELECT lastBlock FROM indexer_state WHERE id = 1
`);

const setLastBlockStmt = db.prepare(`
  INSERT OR REPLACE INTO indexer_state (id, lastBlock) VALUES (1, ?)
`);

export function insertPull(pull: {
  pullId: string;
  player: string;
  sequenceNumber: string;
  txHash: string;
  blockNumber: string;
  timestamp: number;
}) {
  return insertPullStmt.run(
    pull.pullId,
    pull.player,
    pull.sequenceNumber,
    pull.txHash,
    pull.blockNumber,
    pull.timestamp
  );
}

export function updatePullResolved(data: {
  pullId: string;
  legendary: boolean;
  stocks: string[];
  amounts: string[];
  txHash: string;
  blockNumber: string;
  timestamp: number;
}) {
  return updatePullResolvedStmt.run(
    data.legendary ? 1 : 0,
    JSON.stringify(data.stocks),
    JSON.stringify(data.amounts),
    data.txHash,
    data.blockNumber,
    data.timestamp,
    data.pullId
  );
}

export function getPullById(pullId: string): Pull | undefined {
  const row = getPullByIdStmt.get(pullId) as any;
  if (!row) return undefined;
  
  return {
    id: row.id,
    pullId: BigInt(row.pullId),
    player: row.player,
    sequenceNumber: BigInt(row.sequenceNumber),
    txHash: row.txHash,
    blockNumber: BigInt(row.blockNumber),
    timestamp: row.timestamp,
    resolved: Boolean(row.resolved),
    legendary: row.legendary !== null ? Boolean(row.legendary) : undefined,
    stocks: row.stocks ? JSON.parse(row.stocks) : undefined,
    amounts: row.amounts ? JSON.parse(row.amounts) : undefined,
    resolvedTxHash: row.resolvedTxHash || undefined,
    resolvedBlockNumber: row.resolvedBlockNumber ? BigInt(row.resolvedBlockNumber) : undefined,
    resolvedTimestamp: row.resolvedTimestamp || undefined,
  };
}

export function getPullsByPlayer(player: string): Pull[] {
  const rows = getPullsByPlayerStmt.all(player) as any[];
  
  return rows.map(row => ({
    id: row.id,
    pullId: BigInt(row.pullId),
    player: row.player,
    sequenceNumber: BigInt(row.sequenceNumber),
    txHash: row.txHash,
    blockNumber: BigInt(row.blockNumber),
    timestamp: row.timestamp,
    resolved: Boolean(row.resolved),
    legendary: row.legendary !== null ? Boolean(row.legendary) : undefined,
    stocks: row.stocks ? JSON.parse(row.stocks) : undefined,
    amounts: row.amounts ? JSON.parse(row.amounts) : undefined,
    resolvedTxHash: row.resolvedTxHash || undefined,
    resolvedBlockNumber: row.resolvedBlockNumber ? BigInt(row.resolvedBlockNumber) : undefined,
    resolvedTimestamp: row.resolvedTimestamp || undefined,
  }));
}

export function getLeaderboard(limit: number = 100) {
  return getLeaderboardStmt.all(limit);
}

export function getLastBlock(): bigint | null {
  const row = getLastBlockStmt.get() as any;
  return row ? BigInt(row.lastBlock) : null;
}

export function setLastBlock(block: bigint) {
  return setLastBlockStmt.run(block.toString());
}

export { db };
