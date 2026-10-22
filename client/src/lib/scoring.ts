import type { JointName, JointMovement } from '@shared/types';

export interface PosePoint {
  name: JointName;
  x: number;
  y: number;
  score: number;
}

interface NormalizedPoint {
  x: number;
  y: number;
}

export interface MotionResult {
  motion: number;
  perJoint: Partial<Record<JointName, number>>;
  topJoint: JointName | null;
  validJoints: number;
}

export interface BetrayalEvent {
  joint: JointName;
  magnitude: number;
  at: number;
  targeted: boolean;
}

export interface Temptation {
  targetJoint: JointName;
  startedAt: number;
  endsAt: number;
}

export interface StillnessConfig {
  calibrationMs: number;
  durationMs: number;
  stillnessFactor: number;
  betrayalFactor: number;
  temptationFactor: number;
  minStillThreshold: number;
  minBetrayalThreshold: number;
  minTemptationThreshold: number;
  betrayalCooldownMs: number;
  emaAlpha: number;
  minVisibleJoints: number;
}

export const DEFAULT_CONFIG: StillnessConfig = {
  calibrationMs: 3000,
  durationMs: 60_000,
  stillnessFactor: 1.25,
  betrayalFactor: 3.5,
  temptationFactor: 2.5,
  minStillThreshold: 0.0012,
  minBetrayalThreshold: 0.008,
  minTemptationThreshold: 0.02,
  betrayalCooldownMs: 650,
  emaAlpha: 0.25,
  minVisibleJoints: 5,
};

const JOINT_WEIGHTS: Record<JointName, number> = {
  nose: 1.4,
  left_eye: 0.5,
  right_eye: 0.5,
  left_ear: 0.6,
  right_ear: 0.6,
  left_shoulder: 0.9,
  right_shoulder: 0.9,
  left_elbow: 0.7,
  right_elbow: 0.7,
  left_wrist: 1.3,
  right_wrist: 1.3,
  left_hip: 0.5,
  right_hip: 0.5,
  left_knee: 0.6,
  right_knee: 0.6,
  left_ankle: 0.7,
  right_ankle: 0.7,
};

const MIN_CONFIDENCE = 0.2;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distance(a: NormalizedPoint | PosePoint, b: NormalizedPoint | PosePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a?: PosePoint, b?: PosePoint): PosePoint | null {
  if (!a || !b || a.score < MIN_CONFIDENCE || b.score < MIN_CONFIDENCE) return null;
  return {
    name: 'nose',
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    score: Math.min(a.score, b.score),
  };
}

export interface NormalizedPose {
  points: Partial<Record<JointName, NormalizedPoint>>;
  torso: number;
  origin: NormalizedPoint;
}

/**
 * Converts pixel keypoints into torso-relative coordinates so that the same
 * gesture reads the same whether the player is close to or far from the camera.
 */
export function normalizePose(points: PosePoint[]): NormalizedPose {
  const byName = new Map<JointName, PosePoint>();
  for (const point of points) {
    if (point.score >= MIN_CONFIDENCE) byName.set(point.name, point);
  }

  const leftShoulder = byName.get('left_shoulder');
  const rightShoulder = byName.get('right_shoulder');
  const leftHip = byName.get('left_hip');
  const rightHip = byName.get('right_hip');

  const shoulderMid = midpoint(leftShoulder, rightShoulder);
  const hipMid = midpoint(leftHip, rightHip);
  const shoulderWidth =
    leftShoulder && rightShoulder ? distance(leftShoulder, rightShoulder) : 0;

  let torso = shoulderMid && hipMid ? distance(shoulderMid, hipMid) : shoulderWidth * 1.4;
  if (!Number.isFinite(torso) || torso < 24) torso = 120;

  const origin = hipMid ?? shoulderMid ?? { x: 0, y: 0 };
  const normalized: Partial<Record<JointName, NormalizedPoint>> = {};

  for (const [name, point] of byName) {
    normalized[name] = {
      x: (point.x - origin.x) / torso,
      y: (point.y - origin.y) / torso,
    };
  }

  return { points: normalized, torso, origin };
}

export function computeMotion(
  previous: Partial<Record<JointName, NormalizedPoint>>,
  current: Partial<Record<JointName, NormalizedPoint>>,
): MotionResult | null {
  let weightedSum = 0;
  let weightTotal = 0;
  let validJoints = 0;
  let topJoint: JointName | null = null;
  let topValue = -1;
  const perJoint: Partial<Record<JointName, number>> = {};

  for (const name of Object.keys(JOINT_WEIGHTS) as JointName[]) {
    const a = previous[name];
    const b = current[name];
    if (!a || !b) continue;

    const weight = JOINT_WEIGHTS[name];
    const delta = distance(a, b) * weight;
    perJoint[name] = delta;
    weightedSum += delta;
    weightTotal += weight;
    validJoints += 1;

    if (delta > topValue) {
      topValue = delta;
      topJoint = name;
    }
  }

  if (validJoints < 5 || weightTotal === 0) return null;

  return {
    motion: weightedSum / weightTotal,
    perJoint,
    topJoint,
    validJoints,
  };
}

export function computeBaseline(samples: number[]): number {
  if (samples.length === 0) return 0.004;

  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length * 0.5)];
  const deviations = sorted
    .map((value) => Math.abs(value - median))
    .sort((a, b) => a - b);
  const mad = deviations[Math.floor(deviations.length * 0.5)];

  return clamp(median + mad * 2.5, 0.001, 0.02);
}

export type RoundPhase = 'idle' | 'calibrating' | 'playing' | 'finished';

export interface RoundSnapshot {
  phase: RoundPhase;
  calibrationProgress: number;
  elapsed: number;
  rating: number;
  betrayals: number;
  targetedBetrayals: number;
  stillnessPct: number;
  longestFreeze: number;
  currentFreeze: number;
  motion: number;
  ema: number;
  baseline: number;
  topJoint: JointName | null;
  lastEvent: BetrayalEvent | null;
  eventNonce: number;
  temptation: (Temptation & { remaining: number }) | null;
  visible: boolean;
}

export interface RoundSummary {
  score: number;
  stillnessPct: number;
  longestFreeze: number;
  betrayals: number;
  targetedBetrayals: number;
  duration: number;
  topJoints: JointMovement[];
  completed: boolean;
}

function emptySnapshot(phase: RoundPhase): RoundSnapshot {
  return {
    phase,
    calibrationProgress: 0,
    elapsed: 0,
    rating: 100,
    betrayals: 0,
    targetedBetrayals: 0,
    stillnessPct: 100,
    longestFreeze: 0,
    currentFreeze: 0,
    motion: 0,
    ema: 0,
    baseline: 0,
    topJoint: null,
    lastEvent: null,
    eventNonce: 0,
    temptation: null,
    visible: true,
  };
}

/**
 * The whole game lives here. It is deliberately DOM-free so the scoring rules
 * can be tested with synthetic skeletons and tuned without touching React.
 */
export class StillnessEngine {
  readonly config: StillnessConfig;

  private phase: RoundPhase = 'idle';
  private lastNow = 0;
  private calibrationStart = 0;
  private calibrationSamples: number[] = [];
  private roundStart = 0;
  private lastFrameAt = 0;
  private lastMotion: MotionResult | null = null;
  private previousPose: Partial<Record<JointName, NormalizedPoint>> | null = null;
  private ema = 0;
  private baseline = 0.004;
  private stillnessMs = 0;
  private currentFreezeMs = 0;
  private longestFreezeMs = 0;
  private betrayals = 0;
  private targetedBetrayals = 0;
  private overThresholdFrames = 0;
  private targetFrames = 0;
  private lastBetrayalAt = -Infinity;
  private lastEvent: BetrayalEvent | null = null;
  private eventNonce = 0;
  private temptation: Temptation | null = null;
  private jointTotals: Partial<Record<JointName, number>> = {};
  private visible = true;
  private finished = false;
  private finalSummary: RoundSummary | null = null;

  constructor(config: Partial<StillnessConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(now: number): void {
    this.phase = 'calibrating';
    this.lastNow = now;
    this.calibrationStart = now;
    this.calibrationSamples = [];
    this.previousPose = null;
    this.lastFrameAt = now;
    this.lastMotion = null;
    this.ema = 0;
    this.baseline = 0.004;
    this.stillnessMs = 0;
    this.currentFreezeMs = 0;
    this.longestFreezeMs = 0;
    this.betrayals = 0;
    this.targetedBetrayals = 0;
    this.overThresholdFrames = 0;
    this.targetFrames = 0;
    this.lastBetrayalAt = -Infinity;
    this.lastEvent = null;
    this.eventNonce = 0;
    this.temptation = null;
    this.jointTotals = {};
    this.visible = true;
    this.finished = false;
    this.finalSummary = null;
  }

  update(points: PosePoint[], now: number): RoundSnapshot {
    this.lastNow = now;
    if (this.phase === 'idle' || this.phase === 'finished') {
      return this.snapshot(now);
    }

    const normalized = normalizePose(points);
    const motion = this.previousPose ? computeMotion(this.previousPose, normalized.points) : null;
    this.previousPose = normalized.points;

    if (!motion) {
      this.visible = false;
      // If calibration is starved of data, give the player a few more seconds.
      if (this.phase === 'calibrating' && now - this.calibrationStart > this.config.calibrationMs * 2.5) {
        this.finishCalibration(now, true);
      }
      // A player who vanishes at second 59 should still get a verdict.
      if (this.phase === 'playing' && now - this.roundStart >= this.config.durationMs) {
        this.finish(now);
      }
      return this.snapshot(now);
    }

    this.visible = true;
    this.lastMotion = motion;

    if (this.phase === 'calibrating') {
      this.calibrationSamples.push(motion.motion);
      if (
        now - this.calibrationStart >= this.config.calibrationMs &&
        this.calibrationSamples.length >= 12
      ) {
        this.finishCalibration(now, false);
      }
      return this.snapshot(now);
    }

    if (this.phase !== 'playing') return this.snapshot(now);

    const elapsedMs = Math.max(1, now - this.roundStart);
    const dt = clamp((now - this.lastFrameAt) / 1000, 0.001, 0.12);
    this.lastFrameAt = now;

    this.ema =
      this.ema === 0
        ? motion.motion
        : this.ema * (1 - this.config.emaAlpha) + motion.motion * this.config.emaAlpha;

    for (const [joint, value] of Object.entries(motion.perJoint) as [JointName, number][]) {
      this.jointTotals[joint] = (this.jointTotals[joint] ?? 0) + value;
    }

    const stillThreshold = Math.max(
      this.config.minStillThreshold,
      this.baseline * this.config.stillnessFactor,
    );

    if (this.ema <= stillThreshold) {
      this.stillnessMs += dt * 1000;
      this.currentFreezeMs += dt * 1000;
      this.longestFreezeMs = Math.max(this.longestFreezeMs, this.currentFreezeMs);
    } else {
      this.currentFreezeMs = 0;
    }

    const majorThreshold = Math.max(
      this.config.minBetrayalThreshold,
      this.baseline * this.config.betrayalFactor,
    );
    const targetThreshold = Math.max(
      this.config.minTemptationThreshold,
      this.baseline * this.config.temptationFactor,
    );

    if (this.temptation && now < this.temptation.endsAt) {
      const targetWeight = JOINT_WEIGHTS[this.temptation.targetJoint];
      const targetMovement =
        (motion.perJoint[this.temptation.targetJoint] ?? 0) / Math.max(targetWeight, 0.001);
      this.targetFrames = targetMovement > targetThreshold ? this.targetFrames + 1 : 0;
    } else {
      if (this.temptation && now >= this.temptation.endsAt) this.temptation = null;
      this.targetFrames = 0;
    }

    this.overThresholdFrames = this.ema > majorThreshold ? this.overThresholdFrames + 1 : 0;

    const cooldownReady = now - this.lastBetrayalAt >= this.config.betrayalCooldownMs;
    const targeted = Boolean(this.temptation) && this.targetFrames >= 2;
    const general = this.overThresholdFrames >= 2;

    if (cooldownReady && (targeted || general)) {
      const joint = targeted
        ? (this.temptation?.targetJoint ?? motion.topJoint ?? 'nose')
        : (motion.topJoint ?? 'nose');
      const penalty = targeted ? 2 : 1;
      this.betrayals += penalty;
      if (targeted) this.targetedBetrayals += 1;
      this.lastEvent = {
        joint,
        magnitude: targeted
          ? (motion.perJoint[this.temptation?.targetJoint ?? joint] ?? this.ema)
          : this.ema,
        at: elapsedMs / 1000,
        targeted,
      };
      this.eventNonce += 1;
      this.overThresholdFrames = 0;
      this.targetFrames = 0;
      this.lastBetrayalAt = now;
      this.currentFreezeMs = 0;
    }

    if (elapsedMs >= this.config.durationMs) {
      this.finish(now);
    }

    return this.snapshot(now);
  }

  startTemptation(joint: JointName, now: number, durationMs = 5000): void {
    if (this.phase !== 'playing') return;
    this.temptation = {
      targetJoint: joint,
      startedAt: now,
      endsAt: now + durationMs,
    };
    this.targetFrames = 0;
  }

  endTemptation(): void {
    this.temptation = null;
    this.targetFrames = 0;
  }

  finish(now: number): RoundSummary {
    if (this.finalSummary) return this.finalSummary;

    this.phase = 'finished';
    this.finished = true;
    this.lastNow = now;
    const duration = this.config.durationMs / 1000;
    const elapsedSec = clamp((now - this.roundStart) / 1000, 1, duration);
    const stillnessPct = clamp((this.stillnessMs / 1000 / elapsedSec) * 100, 0, 100);
    const freezePct = clamp((this.longestFreezeMs / 1000 / elapsedSec) * 100, 0, 100);
    const score = clamp(
      0.7 * stillnessPct + 0.3 * freezePct - this.betrayals * 2,
      0,
      100,
    );

    this.finalSummary = {
      score,
      stillnessPct,
      longestFreeze: this.longestFreezeMs / 1000,
      betrayals: this.betrayals,
      targetedBetrayals: this.targetedBetrayals,
      duration: elapsedSec,
      completed: elapsedSec >= duration - 1,
      topJoints: this.sortedJoints(5),
    };

    return this.finalSummary;
  }

  getSummary(): RoundSummary | null {
    return this.finalSummary;
  }

  getTelemetry(): import('@shared/types').RoundTelemetry {
    const snapshot = this.snapshot(this.lastNow);
    return {
      elapsed: Number(snapshot.elapsed.toFixed(1)),
      rating: Number(snapshot.rating.toFixed(1)),
      betrayals: snapshot.betrayals,
      stillnessPct: Number(snapshot.stillnessPct.toFixed(1)),
      longestFreeze: Number(snapshot.longestFreeze.toFixed(1)),
      topJoints: this.sortedJoints(5),
      lastEvent: this.lastEvent
        ? {
            ...this.lastEvent,
            magnitude: Number(this.lastEvent.magnitude.toFixed(4)),
            at: Number(this.lastEvent.at.toFixed(1)),
          }
        : null,
    };
  }

  getPhase(): RoundPhase {
    return this.phase;
  }

  getBaseline(): number {
    return this.baseline;
  }

  isFinished(): boolean {
    return this.finished;
  }

  private finishCalibration(now: number, forced: boolean): void {
    this.baseline = forced ? 0.004 : computeBaseline(this.calibrationSamples);
    this.phase = 'playing';
    this.roundStart = now;
    this.lastFrameAt = now;
    this.ema = 0;
    this.stillnessMs = 0;
    this.currentFreezeMs = 0;
    this.longestFreezeMs = 0;
    this.lastBetrayalAt = -Infinity;
  }

  private sortedJoints(limit: number): JointMovement[] {
    return (Object.entries(this.jointTotals) as [JointName, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([joint, movement]) => ({
        joint,
        movement: Number(movement.toFixed(4)),
      }));
  }

  private snapshot(now: number): RoundSnapshot {
    if (this.phase === 'idle') return emptySnapshot('idle');

    const elapsed =
      this.phase === 'calibrating'
        ? 0
        : clamp((now - this.roundStart) / 1000, 0, this.config.durationMs / 1000);
    const denominator = Math.max(1, elapsed);
    const stillnessPct = clamp((this.stillnessMs / 1000 / denominator) * 100, 0, 100);
    const freezePct = clamp((this.longestFreezeMs / 1000 / denominator) * 100, 0, 100);
    const rating = clamp(0.7 * stillnessPct + 0.3 * freezePct - this.betrayals * 2, 0, 100);
    const temptation =
      this.temptation && now < this.temptation.endsAt
        ? { ...this.temptation, remaining: (this.temptation.endsAt - now) / 1000 }
        : null;

    return {
      phase: this.phase,
      calibrationProgress:
        this.phase === 'calibrating'
          ? clamp((now - this.calibrationStart) / this.config.calibrationMs, 0, 1)
          : 1,
      elapsed,
      rating,
      betrayals: this.betrayals,
      targetedBetrayals: this.targetedBetrayals,
      stillnessPct,
      longestFreeze: this.longestFreezeMs / 1000,
      currentFreeze: this.currentFreezeMs / 1000,
      motion: this.lastMotion?.motion ?? 0,
      ema: this.ema,
      baseline: this.baseline,
      topJoint: this.lastMotion?.topJoint ?? null,
      lastEvent: this.lastEvent,
      eventNonce: this.eventNonce,
      temptation,
      visible: this.visible,
    };
  }
}
