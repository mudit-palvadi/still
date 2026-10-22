import { describe, expect, it } from 'vitest';
import {
  StillnessEngine,
  computeBaseline,
  computeMotion,
  normalizePose,
  type PosePoint,
} from '../client/src/lib/scoring';
import { JOINT_NAMES, type JointName } from '../shared/types';

type Point = [number, number];

const BASE: Record<JointName, Point> = {
  nose: [320, 100],
  left_eye: [310, 95],
  right_eye: [330, 95],
  left_ear: [300, 100],
  right_ear: [340, 100],
  left_shoulder: [280, 160],
  right_shoulder: [360, 160],
  left_elbow: [260, 230],
  right_elbow: [380, 230],
  left_wrist: [250, 300],
  right_wrist: [390, 300],
  left_hip: [295, 300],
  right_hip: [345, 300],
  left_knee: [290, 390],
  right_knee: [350, 390],
  left_ankle: [285, 480],
  right_ankle: [355, 480],
};

function makePose(scale = 1, overrides: Partial<Record<JointName, Point>> = {}): PosePoint[] {
  return JOINT_NAMES.map((name) => {
    const [x, y] = overrides[name] ?? BASE[name];
    return { name, x: x * scale, y: y * scale, score: 0.92 };
  });
}

function calibrate(engine: StillnessEngine, start = 0): number {
  engine.start(start);
  let now = start;
  for (; now <= start + 1400; now += 33) {
    engine.update(makePose(), now);
  }
  return now - 33;
}

describe('pose normalization', () => {
  it('measures the same gesture regardless of camera distance', () => {
    const nearBase = normalizePose(makePose(1));
    const nearMove = normalizePose(makePose(1, { right_wrist: [415, 300] }));
    const farBase = normalizePose(makePose(2));
    const farMove = normalizePose(makePose(2, { right_wrist: [415, 300] }));

    const near = computeMotion(nearBase.points, nearMove.points);
    const far = computeMotion(farBase.points, farMove.points);

    expect(near).not.toBeNull();
    expect(far).not.toBeNull();
    expect(near!.motion).toBeCloseTo(far!.motion, 6);
    expect(near!.topJoint).toBe('right_wrist');
  });

  it('ignores low-confidence points', () => {
    const pose = makePose();
    pose.forEach((point) => {
      if (point.name === 'right_wrist') point.score = 0.05;
    });
    const normalized = normalizePose(pose);
    expect(normalized.points.right_wrist).toBeUndefined();
  });
});

describe('computeBaseline', () => {
  it('is robust to a single calibration spike', () => {
    const baseline = computeBaseline([0.001, 0.001, 0.001, 0.05]);
    expect(baseline).toBeLessThan(0.002);
  });

  it('never returns a dangerous zero', () => {
    expect(computeBaseline([0, 0, 0])).toBeGreaterThanOrEqual(0.001);
  });
});

describe('StillnessEngine', () => {
  it('finishes calibration and starts the round', () => {
    const engine = new StillnessEngine({ calibrationMs: 1000, durationMs: 5000 });
    calibrate(engine);
    expect(engine.getPhase()).toBe('playing');
    expect(engine.getBaseline()).toBeGreaterThan(0);
  });

  it('gives a perfect score to a perfectly still player', () => {
    const engine = new StillnessEngine({ calibrationMs: 1000, durationMs: 5000 });
    let now = calibrate(engine);
    for (let i = 0; i < 220; i += 1) {
      now += 33;
      engine.update(makePose(), now);
    }

    const summary = engine.getSummary();
    expect(summary).not.toBeNull();
    expect(summary!.score).toBe(100);
    expect(summary!.betrayals).toBe(0);
    expect(summary!.stillnessPct).toBe(100);
    expect(summary!.longestFreeze).toBeLessThanOrEqual(5);
    expect(summary!.completed).toBe(true);
  });

  it('scores fairly when pose frames arrive slowly', () => {
    const engine = new StillnessEngine({ calibrationMs: 1000, durationMs: 5000 });
    let now = calibrate(engine);
    for (let i = 0; i < 10; i += 1) {
      now += 500;
      engine.update(makePose(), now);
    }

    const summary = engine.getSummary();
    expect(summary).not.toBeNull();
    expect(summary!.stillnessPct).toBe(100);
    expect(summary!.score).toBe(100);
  });

  it('records a betrayal when a joint keeps moving', () => {
    const engine = new StillnessEngine({ calibrationMs: 1000, durationMs: 10000 });
    let now = calibrate(engine);

    engine.update(makePose(), now);
    for (let offset = 20; offset <= 100; offset += 20) {
      now += 33;
      engine.update(makePose(1, { right_wrist: [390 + offset, 300] }), now);
    }
    // A short pause, then a second wave so the cooldown is exercised.
    for (let i = 0; i < 30; i += 1) {
      now += 33;
      engine.update(makePose(), now);
    }
    for (let offset = 20; offset <= 100; offset += 20) {
      now += 33;
      engine.update(makePose(1, { right_wrist: [390 + offset, 300] }), now);
    }

    const snapshot = engine.getTelemetry();
    expect(snapshot.betrayals).toBeGreaterThanOrEqual(2);
    expect(snapshot.lastEvent?.joint).toBe('right_wrist');
    expect(snapshot.lastEvent?.targeted).toBe(false);
  });

  it('doubles the penalty for a targeted temptation', () => {
    const engine = new StillnessEngine({ calibrationMs: 1000, durationMs: 10000 });
    let now = calibrate(engine);

    engine.update(makePose(), now);
    now += 500;
    engine.startTemptation('right_wrist', now, 5000);

    for (let offset = 10; offset <= 40; offset += 10) {
      now += 33;
      engine.update(makePose(1, { right_wrist: [390 + offset, 300] }), now);
    }

    const telemetry = engine.getTelemetry();
    expect(telemetry.betrayals).toBe(2);
    expect(telemetry.lastEvent?.targeted).toBe(true);
    expect(telemetry.lastEvent?.joint).toBe('right_wrist');
  });

  it('stops accumulating stillness once the round is over', () => {
    const engine = new StillnessEngine({ calibrationMs: 1000, durationMs: 3000 });
    let now = calibrate(engine);
    for (let i = 0; i < 150; i += 1) {
      now += 33;
      engine.update(makePose(), now);
    }
    const summary = engine.getSummary();
    const before = now;
    now += 5000;
    engine.update(makePose(), now);
    expect(engine.getSummary()).toEqual(summary);
    expect(engine.getPhase()).toBe('finished');
    expect(now).toBeGreaterThan(before);
  });
});
