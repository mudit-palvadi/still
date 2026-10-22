export interface ShareCardData {
  name: string;
  score: number;
  rankTitle: string;
  rankBlurb: string;
  verdict: string;
  stillnessPct: number;
  longestFreeze: number;
  betrayals: number;
  percentile: number | null;
}

const WIDTH = 1200;
const HEIGHT = 630;
const BG = '#0b0f0c';
const PANEL = '#11160f';
const CREAM = '#f2ecd9';
const LIME = '#c9f26f';
const MUTED = '#8d978a';
const AMBER = '#f4b860';
const LINE = 'rgba(242, 236, 217, 0.14)';

export function shareText(data: ShareCardData): string {
  const lines = [
    `STILL — ${data.score.toFixed(1)}/100`,
    `${data.rankTitle} — "${data.verdict}"`,
    `${data.stillnessPct.toFixed(0)}% still · ${data.longestFreeze.toFixed(1)}s longest freeze · ${data.betrayals} betrayals`,
  ];
  if (data.percentile !== null) {
    lines.push(`Top ${Math.max(1, Math.round(data.percentile))}% of all statues.`);
  }
  lines.push('The first esport for lying down.');
  return lines.join('\n');
}

export async function downloadShareCard(data: ShareCardData): Promise<void> {
  const canvas = await createShareCard(data);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The share card refused to materialize.');

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = data.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'statue';
  link.href = url;
  link.download = `still-${safeName}-${Math.round(data.score)}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyResult(data: ShareCardData): Promise<void> {
  const text = shareText(data);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

export async function createShareCard(data: ShareCardData): Promise<HTMLCanvasElement> {
  try {
    await document.fonts.ready;
  } catch {
    // Fonts are best-effort; the card still renders with fallbacks.
  }

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(180, 80, 10, 180, 80, 620);
  glow.addColorStop(0, 'rgba(201, 242, 111, 0.13)');
  glow.addColorStop(1, 'rgba(201, 242, 111, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = 'rgba(242, 236, 217, 0.035)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= WIDTH; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= HEIGHT; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }

  ctx.fillStyle = PANEL;
  ctx.fillRect(650, 148, 500, 318);
  ctx.strokeStyle = LINE;
  ctx.strokeRect(650, 148, 500, 318);
  ctx.fillStyle = AMBER;
  ctx.fillRect(650, 148, 5, 318);

  ctx.fillStyle = LIME;
  ctx.fillRect(64, 54, 12, 12);
  ctx.font = '400 54px "Bebas Neue", Impact, sans-serif';
  ctx.fillStyle = CREAM;
  ctx.fillText('STILL', 90, 74);

  ctx.font = '700 13px "Space Mono", monospace';
  ctx.fillStyle = MUTED;
  ctx.fillText('THE FIRST ESPORT FOR LYING DOWN', 224, 70);

  ctx.textAlign = 'right';
  ctx.fillStyle = LIME;
  ctx.fillText('HACKTOBERFEST 2026 // WEEK 03', WIDTH - 64, 70);
  ctx.fillStyle = MUTED;
  ctx.font = '400 13px "Space Mono", monospace';
  ctx.fillText(`PLAYER // ${data.name.toUpperCase().slice(0, 24)}`, WIDTH - 64, 96);
  ctx.textAlign = 'left';

  ctx.strokeStyle = LINE;
  ctx.beginPath();
  ctx.moveTo(64, 118);
  ctx.lineTo(WIDTH - 64, 118);
  ctx.stroke();

  ctx.font = '700 14px "Space Mono", monospace';
  ctx.fillStyle = MUTED;
  ctx.fillText('FINAL STILLNESS RATING', 64, 166);

  ctx.font = '400 218px "Bebas Neue", Impact, sans-serif';
  ctx.fillStyle = LIME;
  const scoreText = data.score.toFixed(1);
  ctx.fillText(scoreText, 58, 354);
  ctx.font = '400 26px "Space Mono", monospace';
  ctx.fillStyle = MUTED;
  ctx.fillText('/ 100', 64, 390);

  ctx.font = '400 58px "Bebas Neue", Impact, sans-serif';
  ctx.fillStyle = CREAM;
  ctx.fillText(data.rankTitle.toUpperCase(), 64, 454);

  ctx.font = '400 20px Inter, sans-serif';
  ctx.fillStyle = MUTED;
  ctx.fillText(data.rankBlurb, 64, 486);

  ctx.font = '700 13px "Space Mono", monospace';
  ctx.fillStyle = AMBER;
  ctx.fillText('REFEREE VERDICT', 686, 184);

  ctx.font = '400 25px Inter, sans-serif';
  ctx.fillStyle = CREAM;
  const verdictLines = wrapText(ctx, `“${data.verdict}”`, 424);
  verdictLines.slice(0, 6).forEach((line, index) => {
    ctx.fillText(line, 686, 226 + index * 35);
  });

  const stats: Array<[string, string]> = [
    ['STILLNESS', `${data.stillnessPct.toFixed(0)}%`],
    ['LONGEST FREEZE', `${data.longestFreeze.toFixed(1)}s`],
    ['BETRAYALS', `${data.betrayals}`],
    [
      'RANKING',
      data.percentile !== null ? `TOP ${Math.max(1, Math.round(data.percentile))}%` : 'UNRANKED',
    ],
  ];
  const columnWidth = 268;
  stats.forEach(([label, value], index) => {
    const x = 64 + index * (columnWidth + 8);
    ctx.font = '700 11px "Space Mono", monospace';
    ctx.fillStyle = MUTED;
    ctx.fillText(label, x, 536);
    ctx.font = '400 38px "Bebas Neue", Impact, sans-serif';
    ctx.fillStyle = index === 3 && data.percentile !== null ? LIME : CREAM;
    ctx.fillText(value, x, 574);
  });

  ctx.strokeStyle = LINE;
  ctx.beginPath();
  ctx.moveTo(64, 596);
  ctx.lineTo(WIDTH - 64, 596);
  ctx.stroke();

  ctx.font = '400 12px "Space Mono", monospace';
  ctx.fillStyle = MUTED;
  ctx.fillText('60 SECONDS. ONE RULE. DO NOT MOVE.', 64, 622);
  ctx.textAlign = 'right';
  ctx.fillStyle = LIME;
  ctx.fillText('GEMMA · RENDER · MONGODB ATLAS', WIDTH - 64, 622);
  ctx.textAlign = 'left';

  return canvas;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
