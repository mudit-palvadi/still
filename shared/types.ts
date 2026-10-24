export const JOINT_NAMES = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
] as const;

export type JointName = (typeof JOINT_NAMES)[number];

export const JOINT_LABELS: Record<JointName, string> = {
  nose: 'nose',
  left_eye: 'left eye',
  right_eye: 'right eye',
  left_ear: 'left ear',
  right_ear: 'right ear',
  left_shoulder: 'left shoulder',
  right_shoulder: 'right shoulder',
  left_elbow: 'left elbow',
  right_elbow: 'right elbow',
  left_wrist: 'left wrist',
  right_wrist: 'right wrist',
  left_hip: 'left hip',
  right_hip: 'right hip',
  left_knee: 'left knee',
  right_knee: 'right knee',
  left_ankle: 'left ankle',
  right_ankle: 'right ankle',
};

export function isJointName(value: unknown): value is JointName {
  return typeof value === 'string' && (JOINT_NAMES as readonly string[]).includes(value);
}

export type RefereeMode = 'taunt' | 'temptation' | 'verdict';

export interface JointMovement {
  joint: JointName;
  movement: number;
}

export interface BetrayalEvent {
  joint: JointName;
  magnitude: number;
  at: number;
  targeted: boolean;
}

export interface RoundTelemetry {
  elapsed: number;
  rating: number;
  betrayals: number;
  stillnessPct: number;
  longestFreeze: number;
  topJoints: JointMovement[];
  lastEvent?: BetrayalEvent | null;
}

export interface RefereeRequest {
  roundId?: string;
  mode: RefereeMode;
  stats: RoundTelemetry;
}

export interface RefereeResponse {
  line: string;
  targetJoint?: JointName;
  source: 'gemma' | 'fallback';
  latencyMs?: number;
  model?: string;
}

export interface RoundResponse {
  roundId: string;
  expiresAt: string;
}

export interface ScoreSubmission {
  roundId: string;
  name: string;
  score: number;
  stillnessPct: number;
  betrayals: number;
  longestFreeze: number;
  verdict: string;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  stillnessPct: number;
  betrayals: number;
  longestFreeze: number;
  verdict: string;
  createdAt: string;
}

export interface ScoreResponse {
  entry: LeaderboardEntry;
  rank: number;
  total: number;
  /** Top X percent. A value of 12 means the player is in the top 12%. */
  percentile: number;
}

export interface LeaderboardResponse {
  scores: LeaderboardEntry[];
  total: number;
  source: 'mongodb' | 'memory';
}

export interface RefereeDiagnostics {
  mode: 'taunt' | 'temptation' | 'verdict';
  source: 'gemma' | 'fallback';
  model: string;
  latencyMs: number;
  at: string;
  error?: string;
}

export interface HealthResponse {
  ok: boolean;
  gemma: {
    configured: boolean;
    provider: string;
    model: string;
  };
  db: 'mongodb' | 'memory';
  uptime: number;
  /** Result of the most recent referee call, useful for verifying the live model. */
  lastReferee?: RefereeDiagnostics | null;
}
