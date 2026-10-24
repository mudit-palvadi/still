import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import type {
  HealthResponse,
  LeaderboardResponse,
  RoundResponse,
  ScoreResponse,
} from '../shared/types';
import { LEADERBOARD_LIMIT, ROUND_VALID_MS } from '../shared/constants';
import { createStore, toLeaderboardEntry, type Store } from './lib/db';
import { getGemmaInfo, getRefereeDiagnostics, referee } from './lib/gemma';
import {
  sanitizeRefereeRequest,
  sanitizeScoreSubmission,
} from './lib/validate';

function rateLimit(max: number, windowMs: number) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.status(429).json({ error: 'Slow down. Ironically.' });
      return;
    }
    next();
  };
}

async function main(): Promise<void> {
  const store: Store = await createStore();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '32kb' }));
  app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => {
      if (req.path !== '/api/health') {
        console.log(
          `[http] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`,
        );
      }
    });
    next();
  });

  app.get('/api/health', (_req, res) => {
    const info = getGemmaInfo();
    const body: HealthResponse = {
      ok: true,
      gemma: info,
      db: store.kind,
      uptime: Math.round(process.uptime()),
      lastReferee: getRefereeDiagnostics(),
    };
    res.json(body);
  });

  app.post('/api/rounds', async (_req, res) => {
    const round = await store.createRound();
    const body: RoundResponse = {
      roundId: round._id,
      expiresAt: new Date(round.createdAt.getTime() + ROUND_VALID_MS).toISOString(),
    };
    res.status(201).json(body);
  });

  app.post(
    '/api/referee',
    rateLimit(60, 60_000),
    async (req: Request, res: Response) => {
      const parsed = sanitizeRefereeRequest(req.body);
      if (!parsed) {
        res.status(400).json({ error: 'That telemetry does not look like a body.' });
        return;
      }
      const result = await referee(parsed);
      res.json(result);
    },
  );

  app.post(
    '/api/scores',
    rateLimit(20, 60_000),
    async (req: Request, res: Response) => {
      const submission = sanitizeScoreSubmission(req.body);
      if (!submission) {
        res.status(400).json({ error: 'That score does not look like a score.' });
        return;
      }

      const consumed = await store.consumeRound(submission.roundId);
      if (!consumed) {
        res.status(409).json({
          error: 'That round is already on the board, or it expired.',
        });
        return;
      }

      const entry = await store.addScore({
        roundId: submission.roundId,
        name: submission.name,
        score: submission.score,
        stillnessPct: submission.stillnessPct,
        betrayals: submission.betrayals,
        longestFreeze: submission.longestFreeze,
        verdict: submission.verdict,
      });
      const { rank, total } = await store.rank(entry.score, entry.longestFreeze);
      const percentile = Math.max(1, Math.round((rank / Math.max(1, total)) * 100));

      const body: ScoreResponse = {
        entry: toLeaderboardEntry(entry),
        rank,
        total,
        percentile,
      };
      res.status(201).json(body);
    },
  );

  app.get('/api/leaderboard', async (req, res) => {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(50, Math.max(1, Math.floor(rawLimit)))
      : LEADERBOARD_LIMIT;
    const { scores, total } = await store.leaderboard(limit);
    const body: LeaderboardResponse = {
      scores: scores.map(toLeaderboardEntry),
      total,
      source: store.kind,
    };
    res.json(body);
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  const clientDir = path.resolve(__dirname, '../client');
  if (fs.existsSync(path.join(clientDir, 'index.html'))) {
    app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET') {
        next();
        return;
      }
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'type' in error &&
      (error as { type?: string }).type === 'entity.parse.failed'
    ) {
      res.status(400).json({ error: 'Malformed JSON.' });
      return;
    }
    console.error('[server] unhandled error:', error);
    res.status(500).json({ error: 'The referee has left the building.' });
  });

  const port = Number(process.env.PORT) || 3001;
  const server = app.listen(port, () => {
    const info = getGemmaInfo();
    console.log(`[still] listening on http://localhost:${port}`);
    console.log(
      `[still] referee=${info.provider}/${info.model} configured=${info.configured}`,
    );
    console.log(`[still] db=${store.kind}`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[still] ${signal} received, shutting down`);
    server.close(async () => {
      await store.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[still] failed to start:', error);
  process.exit(1);
});
