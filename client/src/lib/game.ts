import type { LeaderboardEntry } from '@shared/types';
import type { RoundSummary } from './scoring';

export type AppPhase = 'landing' | 'game' | 'summary';

export interface GameResult {
  summary: RoundSummary;
  verdict: string;
  verdictSource: 'gemma' | 'fallback';
  roundId: string | null;
  submitted: boolean;
  submitError: string | null;
  entryId: string | null;
  rank: number | null;
  total: number | null;
  percentile: number | null;
}

export interface BoardState {
  scores: LeaderboardEntry[];
  total: number;
  source: 'mongodb' | 'memory' | null;
}
