import type { RefereeRequest, RefereeResponse } from '../../shared/types';
import { JOINT_LABELS } from '../../shared/types';

const TAUNTS = [
  'Your {joint} has been moving this whole time. I noticed.',
  'The camera is not the only thing watching you.',
  'You are breathing like a person who has somewhere to be.',
  'A statue would have finished by now.',
  'Your posture suggests you are waiting for a bus.',
  'I have seen more stillness in a screensaver.',
  'You blinked. I am choosing to ignore it. Once.',
  'The sloth sends its condolences.',
  'Your {joint} is the weakest link. It is also the loudest.',
  'Stillness is a decision. You keep reconsidering.',
  'The furniture is winning.',
  'You are doing the opposite of a rock.',
];

const TEMPTATIONS = [
  'There is an itch on your {joint}. It would be a shame to scratch it.',
  'A fly has landed on your {joint}. It is reading your messages.',
  'Your {joint} is now the most interesting joint in the room. Do not prove it.',
  'A tiny notification is hovering over your {joint}. It says we need to talk.',
  'Your {joint} has started a union. It wants one small stretch.',
  'The referee is staring at your {joint}. This is not a drill.',
  'A single hair has fallen on your {joint}. You can feel it, can you not?',
  'Your {joint} remembers what it was like to move. It misses it.',
];

const VERDICTS = [
  'A respectable attempt. The furniture remains unimpressed.',
  'You held still for {freeze} seconds. The average houseplant does better, but not by much.',
  'You betrayed yourself {betrayals} times. The referee has seen worse. Not often.',
  'Stillness is a skill. You have a hobby.',
  'The sloth has reviewed your performance and gone back to sleep.',
  'A {score}-point performance. The room feels no different.',
  'You have the stillness of a parked car. The referee will allow it.',
];

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(values[key] ?? ''));
}

export function fallbackReferee(request: RefereeRequest): RefereeResponse {
  const stats = request.stats;
  const target = stats.topJoints[0]?.joint ?? 'left_wrist';
  const values = {
    joint: JOINT_LABELS[target],
    freeze: stats.longestFreeze.toFixed(1),
    betrayals: stats.betrayals,
    score: Math.round(stats.rating),
  };

  if (request.mode === 'temptation') {
    return {
      line: fill(pick(TEMPTATIONS), values),
      targetJoint: target,
      source: 'fallback',
    };
  }

  if (request.mode === 'verdict') {
    return {
      line: fill(pick(VERDICTS), values),
      source: 'fallback',
    };
  }

  return {
    line: fill(pick(TAUNTS), values),
    source: 'fallback',
  };
}
