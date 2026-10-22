import { JOINT_LABELS, type JointName } from '@shared/types';
import type { PosePoint } from './scoring';

export interface OverlayState {
  targetJoint?: JointName;
  eventJoint?: JointName;
  eventAt?: number;
  eventNonce?: number;
}

const BONES: Array<[JointName, JointName]> = [
  ['nose', 'left_eye'],
  ['nose', 'right_eye'],
  ['left_eye', 'left_ear'],
  ['right_eye', 'right_ear'],
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
];

const MIN_SCORE = 0.24;
const LIME = '201, 242, 111';
const CREAM = '242, 236, 217';
const AMBER = '244, 184, 96';
const RED = '255, 107, 94';

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  points: PosePoint[],
  width: number,
  height: number,
  overlay: OverlayState,
  now: number,
): void {
  ctx.clearRect(0, 0, width, height);
  if (width <= 0 || height <= 0) return;

  const visible = new Map<JointName, PosePoint>();
  for (const point of points) {
    if (point.score >= MIN_SCORE) visible.set(point.name, point);
  }

  if (visible.size === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // A soft lime aura first, then a crisp bone on top.
  for (const [from, to] of BONES) {
    const a = visible.get(from);
    const b = visible.get(to);
    if (!a || !b) continue;

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = `rgba(${LIME}, 0.16)`;
    ctx.lineWidth = Math.max(7, width / 120);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = `rgba(${LIME}, 0.88)`;
    ctx.lineWidth = Math.max(2, width / 420);
    ctx.stroke();
  }

  for (const point of visible.values()) {
    const radius = Math.max(3, width / 260);
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius + 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${CREAM}, 0.12)`;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${CREAM}, 0.92)`;
    ctx.fill();
  }

  if (overlay.targetJoint) {
    const target = visible.get(overlay.targetJoint);
    if (target) {
      const pulse = (Math.sin(now / 150) + 1) / 2;
      const radius = Math.max(22, width / 34) + pulse * 6;

      ctx.beginPath();
      ctx.arc(target.x, target.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${AMBER}, ${0.55 + pulse * 0.4})`;
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(target.x, target.y, radius * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${AMBER}, 0.14)`;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(target.x - radius - 9, target.y);
      ctx.lineTo(target.x - radius + 1, target.y);
      ctx.moveTo(target.x + radius - 1, target.y);
      ctx.lineTo(target.x + radius + 9, target.y);
      ctx.moveTo(target.x, target.y - radius - 9);
      ctx.lineTo(target.x, target.y - radius + 1);
      ctx.moveTo(target.x, target.y + radius - 1);
      ctx.lineTo(target.x, target.y + radius + 9);
      ctx.strokeStyle = `rgba(${AMBER}, 0.95)`;
      ctx.lineWidth = 2;
      ctx.stroke();

      drawTag(ctx, JOINT_LABELS[overlay.targetJoint].toUpperCase(), target.x, target.y + radius + 14, AMBER);
    }
  }

  if (overlay.eventJoint && overlay.eventAt !== undefined) {
    const age = (now - overlay.eventAt) / 900;
    if (age >= 0 && age < 1) {
      const joint = visible.get(overlay.eventJoint);
      if (joint) {
        const radius = 20 + age * Math.max(40, width / 12);
        ctx.beginPath();
        ctx.arc(joint.x, joint.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${RED}, ${(1 - age) * 0.9})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

function drawTag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  ctx.save();
  ctx.font = `700 12px "Space Mono", monospace`;
  const width = ctx.measureText(text).width + 16;
  const height = 24;
  const left = Math.max(6, Math.min(x - width / 2, ctx.canvas.width - width - 6));
  const top = y + 6;

  ctx.fillStyle = 'rgba(11, 15, 12, 0.82)';
  ctx.fillRect(left, top, width, height);
  ctx.strokeStyle = `rgba(${color}, 0.75)`;
  ctx.lineWidth = 1;
  ctx.strokeRect(left, top, width, height);
  ctx.fillStyle = `rgba(${color}, 1)`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + 8, top + height / 2 + 1);
  ctx.restore();
}
