import { randomUUID } from 'node:crypto';
import { MongoClient, type Collection, type Db } from 'mongodb';
import type { LeaderboardEntry } from '../../shared/types';
import { ROUND_VALID_MS } from '../../shared/constants';

interface StoredRound {
  _id: string;
  createdAt: Date;
  used: boolean;
  usedAt?: Date;
}

export interface StoredScore {
  _id: string;
  roundId: string;
  name: string;
  score: number;
  stillnessPct: number;
  betrayals: number;
  longestFreeze: number;
  verdict: string;
  createdAt: Date;
}

export interface Store {
  readonly kind: 'mongodb' | 'memory';
  createRound(): Promise<StoredRound>;
  consumeRound(id: string): Promise<boolean>;
  addScore(input: Omit<StoredScore, '_id' | 'createdAt'>): Promise<StoredScore>;
  leaderboard(limit: number): Promise<{ scores: StoredScore[]; total: number }>;
  rank(score: number, longestFreeze: number): Promise<{ rank: number; total: number }>;
  close(): Promise<void>;
}

export function toLeaderboardEntry(score: StoredScore): LeaderboardEntry {
  return {
    id: score._id,
    name: score.name,
    score: Number(score.score.toFixed(1)),
    stillnessPct: Number(score.stillnessPct.toFixed(1)),
    betrayals: score.betrayals,
    longestFreeze: Number(score.longestFreeze.toFixed(1)),
    verdict: score.verdict,
    createdAt: score.createdAt.toISOString(),
  };
}

class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private rounds = new Map<string, StoredRound>();
  private scores: StoredScore[] = [];

  async createRound(): Promise<StoredRound> {
    const now = new Date();
    for (const [id, round] of this.rounds) {
      if (now.getTime() - round.createdAt.getTime() > 24 * 60 * 60 * 1000) {
        this.rounds.delete(id);
      }
    }
    const round: StoredRound = { _id: randomUUID(), createdAt: now, used: false };
    this.rounds.set(round._id, round);
    return round;
  }

  async consumeRound(id: string): Promise<boolean> {
    const round = this.rounds.get(id);
    if (!round || round.used) return false;
    if (Date.now() - round.createdAt.getTime() > ROUND_VALID_MS) return false;
    round.used = true;
    round.usedAt = new Date();
    return true;
  }

  async addScore(input: Omit<StoredScore, '_id' | 'createdAt'>): Promise<StoredScore> {
    const score: StoredScore = { ...input, _id: randomUUID(), createdAt: new Date() };
    this.scores.push(score);
    return score;
  }

  async leaderboard(limit: number): Promise<{ scores: StoredScore[]; total: number }> {
    const sorted = [...this.scores].sort(
      (a, b) =>
        b.score - a.score ||
        b.longestFreeze - a.longestFreeze ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
    return { scores: sorted.slice(0, limit), total: this.scores.length };
  }

  async rank(score: number, longestFreeze: number): Promise<{ rank: number; total: number }> {
    const better = this.scores.filter(
      (entry) =>
        entry.score > score ||
        (entry.score === score && entry.longestFreeze > longestFreeze),
    ).length;
    return { rank: better + 1, total: this.scores.length };
  }

  async close(): Promise<void> {
    this.rounds.clear();
    this.scores = [];
  }
}

class MongoStore implements Store {
  readonly kind = 'mongodb' as const;
  private rounds: Collection<StoredRound>;
  private scores: Collection<StoredScore>;

  constructor(
    private readonly client: MongoClient,
    db: Db,
  ) {
    this.rounds = db.collection<StoredRound>('rounds');
    this.scores = db.collection<StoredScore>('scores');
  }

  async createRound(): Promise<StoredRound> {
    const round: StoredRound = { _id: randomUUID(), createdAt: new Date(), used: false };
    await this.rounds.insertOne(round);
    return round;
  }

  async consumeRound(id: string): Promise<boolean> {
    const result = await this.rounds.findOneAndUpdate(
      {
        _id: id,
        used: false,
        createdAt: { $gt: new Date(Date.now() - ROUND_VALID_MS) },
      },
      { $set: { used: true, usedAt: new Date() } },
      { returnDocument: 'after' },
    );
    return result !== null;
  }

  async addScore(input: Omit<StoredScore, '_id' | 'createdAt'>): Promise<StoredScore> {
    const score: StoredScore = { ...input, _id: randomUUID(), createdAt: new Date() };
    await this.scores.insertOne(score);
    return score;
  }

  async leaderboard(limit: number): Promise<{ scores: StoredScore[]; total: number }> {
    const [scores, total] = await Promise.all([
      this.scores
        .find({})
        .sort({ score: -1, longestFreeze: -1, createdAt: 1 })
        .limit(limit)
        .toArray(),
      this.scores.countDocuments(),
    ]);
    return { scores, total };
  }

  async rank(score: number, longestFreeze: number): Promise<{ rank: number; total: number }> {
    const [better, total] = await Promise.all([
      this.scores.countDocuments({
        $or: [
          { score: { $gt: score } },
          { score, longestFreeze: { $gt: longestFreeze } },
        ],
      }),
      this.scores.countDocuments(),
    ]);
    return { rank: better + 1, total };
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

export async function createStore(): Promise<Store> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.warn('[db] MONGODB_URI is not set; using in-memory leaderboard');
    return new MemoryStore();
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || 'still');
    await db.command({ ping: 1 });
    await db
      .collection<StoredScore>('scores')
      .createIndex({ score: -1, longestFreeze: -1, createdAt: 1 });
    await db
      .collection<StoredRound>('rounds')
      .createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 });

    console.log('[db] MongoDB Atlas connected');
    return new MongoStore(client, db);
  } catch (error) {
    console.error(
      '[db] MongoDB connection failed; using in-memory leaderboard:',
      error instanceof Error ? error.message : error,
    );
    await client.close().catch(() => undefined);
    return new MemoryStore();
  }
}
