export interface Rank {
  title: string;
  blurb: string;
  min: number;
}

export const RANKS: Rank[] = [
  {
    title: 'Certified Statue',
    blurb: 'The pigeons have accepted you as one of their own.',
    min: 92,
  },
  {
    title: 'Human Boulder',
    blurb: 'Geologically significant stillness.',
    min: 80,
  },
  {
    title: 'Sloth Intern',
    blurb: 'Promising. Still thinking about lunch.',
    min: 65,
  },
  {
    title: 'Restless Meat Sack',
    blurb: 'Your joints are filing a formal complaint.',
    min: 45,
  },
  {
    title: 'Crypto-Fidgeter',
    blurb: 'You moved so much the referee got dizzy.',
    min: 0,
  },
];

export function rankFor(score: number): Rank {
  return RANKS.find((rank) => score >= rank.min) ?? RANKS[RANKS.length - 1];
}
