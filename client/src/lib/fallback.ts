import type { JointName, RefereeMode, RoundTelemetry } from '@shared/types';
import { JOINT_LABELS } from '@shared/types';

const TAUNTS = [
  'Your left eyebrow has entered the chat. I saw that.',
  'A professional statue would have finished by now.',
  'You are doing wonderfully. Suspiciously wonderfully.',
  'The floor is winning. This is a historic upset.',
  'I have seen more stillness in a washing machine.',
  'Breathe. No, not like that.',
  'Your skeleton is requesting a union representative.',
  'Somewhere, a sloth just checked your score and laughed.',
];

const TEMPTATIONS = [
  'There is a fly on your {joint}. It knows what you did.',
  'Your {joint} looks tense. Give it a little stretch. Nobody is watching.',
  'I would not move that {joint} if I were you. But I am not you.',
  'A tiny itch has appeared on your {joint}. It is growing.',
  'Your {joint} is now the main character. Do not move it.',
];

const VERDICTS: Array<(stats: RoundTelemetry) => string> = [
  (stats) =>
    `${stats.stillnessPct.toFixed(0)}% still. ${stats.betrayals} betrayals. The pigeons are deciding whether to accept you.`,
  (stats) =>
    `A ${stats.longestFreeze.toFixed(1)} second freeze is nothing to be ashamed of. The rest of the round, however, is.`,
  (stats) =>
    `You held still for ${stats.longestFreeze.toFixed(1)} seconds. The furniture held still for the entire minute. It wins.`,
  (stats) =>
    `The referee has reviewed the footage. Your joints were busy. Your face was busier. Rating: ${Math.round(stats.rating)}.`,
];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function clientFallback(
  mode: RefereeMode,
  stats: RoundTelemetry,
): { line: string; targetJoint?: JointName; source: 'fallback' } {
  if (mode === 'taunt') {
    return { line: pick(TAUNTS), source: 'fallback' };
  }

  if (mode === 'temptation') {
    const joint: JointName = stats.topJoints[0]?.joint ?? 'left_wrist';
    return {
      line: pick(TEMPTATIONS).replace('{joint}', JOINT_LABELS[joint]),
      targetJoint: joint,
      source: 'fallback',
    };
  }

  return { line: pick(VERDICTS)(stats), source: 'fallback' };
}
