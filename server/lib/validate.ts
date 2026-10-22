import type {
  JointName,
  RefereeRequest,
  RoundTelemetry,
  ScoreSubmission,
} from '../../shared/types';
import { isJointName } from '../../shared/types';
import {
  MAX_BETRAYALS,
  MAX_NAME_LENGTH,
  MAX_VERDICT_LENGTH,
} from '../../shared/constants';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function sanitizeName(value: unknown): string {
  return cleanText(value, MAX_NAME_LENGTH) || 'Anonymous Sloth';
}

export function sanitizeVerdict(value: unknown): string {
  return cleanText(value, MAX_VERDICT_LENGTH) || 'The referee declined to comment.';
}

export function numberInRange(value: unknown, min: number, max: number): number | null {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

function integerInRange(value: unknown, min: number, max: number): number | null {
  const number = numberInRange(value, min, max);
  return number === null || !Number.isInteger(number) ? null : number;
}

export function sanitizeTelemetry(value: unknown): RoundTelemetry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;

  const elapsed = numberInRange(raw.elapsed, 0, 60);
  const rating = numberInRange(raw.rating, 0, 100);
  const betrayals = integerInRange(raw.betrayals, 0, MAX_BETRAYALS);
  const stillnessPct = numberInRange(raw.stillnessPct, 0, 100);
  const longestFreeze = numberInRange(raw.longestFreeze, 0, 60);

  if (
    elapsed === null ||
    rating === null ||
    betrayals === null ||
    stillnessPct === null ||
    longestFreeze === null
  ) {
    return null;
  }

  const topJointsRaw = Array.isArray(raw.topJoints) ? raw.topJoints.slice(0, 8) : [];
  const topJoints = topJointsRaw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const jointRaw = (item as Record<string, unknown>).joint;
    const movement = numberInRange(
      (item as Record<string, unknown>).movement,
      0,
      1000,
    );
    if (!isJointName(jointRaw) || movement === null) return [];
    return [{ joint: jointRaw as JointName, movement: Number(movement.toFixed(4)) }];
  });

  let lastEvent: RoundTelemetry['lastEvent'] = null;
  if (raw.lastEvent && typeof raw.lastEvent === 'object') {
    const eventRaw = raw.lastEvent as Record<string, unknown>;
    const joint = eventRaw.joint;
    const magnitude = numberInRange(eventRaw.magnitude, 0, 1000);
    const at = numberInRange(eventRaw.at, 0, 60);
    if (isJointName(joint) && magnitude !== null && at !== null) {
      lastEvent = {
        joint,
        magnitude: Number(magnitude.toFixed(4)),
        at: Number(at.toFixed(1)),
        targeted: Boolean(eventRaw.targeted),
      };
    }
  }

  return {
    elapsed: Number(elapsed.toFixed(1)),
    rating: Number(rating.toFixed(1)),
    betrayals,
    stillnessPct: Number(stillnessPct.toFixed(1)),
    longestFreeze: Number(longestFreeze.toFixed(1)),
    topJoints,
    lastEvent,
  };
}

export function sanitizeRefereeRequest(value: unknown): RefereeRequest | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const mode = raw.mode;
  if (mode !== 'taunt' && mode !== 'temptation' && mode !== 'verdict') return null;

  const stats = sanitizeTelemetry(raw.stats);
  if (!stats) return null;

  const roundId =
    typeof raw.roundId === 'string' && raw.roundId.length <= 64
      ? raw.roundId
      : undefined;

  return { mode, stats, roundId };
}

export function sanitizeScoreSubmission(value: unknown): ScoreSubmission | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;

  const roundId = typeof raw.roundId === 'string' ? raw.roundId.trim() : '';
  if (!UUID_PATTERN.test(roundId)) return null;

  const score = numberInRange(raw.score, 0, 100);
  const stillnessPct = numberInRange(raw.stillnessPct, 0, 100);
  const betrayals = integerInRange(raw.betrayals, 0, MAX_BETRAYALS);
  const longestFreeze = numberInRange(raw.longestFreeze, 0, 60);

  if (
    score === null ||
    stillnessPct === null ||
    betrayals === null ||
    longestFreeze === null
  ) {
    return null;
  }

  return {
    roundId,
    name: sanitizeName(raw.name),
    score: Number(score.toFixed(1)),
    stillnessPct: Number(stillnessPct.toFixed(1)),
    betrayals,
    longestFreeze: Number(longestFreeze.toFixed(1)),
    verdict: sanitizeVerdict(raw.verdict),
  };
}
