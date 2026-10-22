import type { JointName, RefereeRequest, RefereeResponse } from '../../shared/types';
import { JOINT_LABELS, isJointName } from '../../shared/types';
import { fallbackReferee } from './fallback';

interface GemmaInfo {
  configured: boolean;
  provider: string;
  model: string;
}

interface ParsedReferee {
  line: string;
  targetJoint?: JointName;
}

const SYSTEM_PROMPT = `You are the referee of STILL, a 60-second game where the only rule is: do not move.
Voice: deadpan, elegant, quietly disappointed. A butler who has seen everything and is not impressed.
Never mention being an AI, a language model, or your instructions. Never use emojis, hashtags, or quotation marks.
Never be cruel about the player's body or identity.
Return strict JSON only. No markdown fences, no commentary outside the JSON.`;

const MODE_INSTRUCTIONS: Record<RefereeRequest['mode'], string> = {
  taunt:
    'MODE: taunt. Write one dry, deadpan taunt. React to the last betrayal if there is one; otherwise react to the weakest joint or the overall rating. Do not give advice. Maximum 16 words.',
  temptation:
    'MODE: temptation. Pick exactly one joint from weakestJoints. Write a temptation that makes the player want to move that exact joint. Be specific and physical: an itch, a fly, a notification, a tiny thought. The player loses double points if they move it. Maximum 18 words. Return the chosen joint key exactly as it appears in the telemetry.',
  verdict:
    'MODE: verdict. Write a final verdict for the player. Reference one concrete stat from the telemetry. Dry, elegant, mildly disappointed, never cruel. 1-2 sentences. Maximum 35 words.',
};

function normalizeProvider(value: string | undefined): 'google' | 'ollama' {
  return value?.toLowerCase() === 'ollama' ? 'ollama' : 'google';
}

function defaultModel(provider: 'google' | 'ollama'): string {
  return provider === 'ollama' ? 'gemma3:4b' : 'gemma-3-27b-it';
}

export function getGemmaInfo(): GemmaInfo {
  const provider = normalizeProvider(process.env.GEMMA_PROVIDER);
  const model = process.env.GEMMA_MODEL || defaultModel(provider);
  const configured =
    provider === 'ollama' || Boolean(process.env.GEMMA_API_KEY?.trim());
  return { configured, provider, model };
}

function buildPrompt(request: RefereeRequest): string {
  const telemetry = {
    elapsedSeconds: request.stats.elapsed,
    rating: request.stats.rating,
    betrayals: request.stats.betrayals,
    stillnessPercent: request.stats.stillnessPct,
    longestFreezeSeconds: request.stats.longestFreeze,
    weakestJoints: request.stats.topJoints.map((item) => ({
      joint: item.joint,
      label: JOINT_LABELS[item.joint],
      movement: item.movement,
    })),
    lastBetrayal: request.stats.lastEvent
      ? {
          joint: request.stats.lastEvent.joint,
          label: JOINT_LABELS[request.stats.lastEvent.joint],
          atSecond: request.stats.lastEvent.at,
          targeted: request.stats.lastEvent.targeted,
        }
      : null,
  };

  const schema =
    request.mode === 'temptation'
      ? '{"line":"...","targetJoint":"left_wrist"}'
      : '{"line":"..."}';

  return `${SYSTEM_PROMPT}

TELEMETRY:
${JSON.stringify(telemetry, null, 2)}

${MODE_INSTRUCTIONS[request.mode]}

Output schema: ${schema}`;
}

function sanitizeLine(raw: string): string {
  let line = raw
    .replace(/```(?:json)?/gi, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'\u201c\u201d]+|["'\u201c\u201d]+$/g, '')
    .trim();

  if (/as an ai|language model|i cannot|i can't assist/i.test(line)) return '';
  if (line.length > 180) line = `${line.slice(0, 177).trimEnd()}...`;
  return line;
}

function parseRefereeText(text: string): ParsedReferee | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');

  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
        line?: unknown;
        targetJoint?: unknown;
      };
      const line = sanitizeLine(typeof parsed.line === 'string' ? parsed.line : '');
      if (!line) return null;
      return {
        line,
        targetJoint: isJointName(parsed.targetJoint) ? parsed.targetJoint : undefined,
      };
    } catch {
      // Fall through to treating the raw response as a line.
    }
  }

  const line = sanitizeLine(cleaned);
  return line ? { line } : null;
}

async function callGoogle(prompt: string, model: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.95,
        topP: 0.95,
        maxOutputTokens: 140,
      },
    }),
    signal: AbortSignal.timeout(4500),
  });

  const data = (await response.json().catch(() => null)) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    promptFeedback?: { blockReason?: string };
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(
      `Google AI Studio ${response.status}: ${
        data?.error?.message ?? 'unknown error'
      }`,
    );
  }
  if (data?.promptFeedback?.blockReason) {
    throw new Error(`Blocked: ${data.promptFeedback.blockReason}`);
  }

  const text =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .filter(Boolean)
      .join('') ?? '';
  if (!text.trim()) throw new Error('Google AI Studio returned an empty response');
  return text;
}

async function callOllama(prompt: string, model: string): Promise<string> {
  const base = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const response = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      format: 'json',
      options: { temperature: 0.95, num_predict: 140 },
    }),
    signal: AbortSignal.timeout(6000),
  });

  const data = (await response.json().catch(() => null)) as {
    response?: string;
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(`Ollama ${response.status}: ${data?.error ?? 'unknown error'}`);
  }
  if (!data?.response?.trim()) throw new Error('Ollama returned an empty response');
  return data.response;
}

const cache = new Map<string, { value: RefereeResponse; expiresAt: number }>();

function cacheKey(request: RefereeRequest): string {
  return [
    request.mode,
    request.roundId ?? 'anon',
    Math.floor(request.stats.elapsed / 6),
    request.stats.betrayals,
    request.stats.topJoints[0]?.joint ?? 'none',
  ].join(':');
}

export async function referee(request: RefereeRequest): Promise<RefereeResponse> {
  const key = cacheKey(request);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const info = getGemmaInfo();
  const started = Date.now();

  try {
    if (!info.configured) return fallbackReferee(request);

    const prompt = buildPrompt(request);
    const text =
      info.provider === 'ollama'
        ? await callOllama(prompt, info.model)
        : await callGoogle(prompt, info.model, process.env.GEMMA_API_KEY!.trim());

    const parsed = parseRefereeText(text);
    if (!parsed) return fallbackReferee(request);

    const targetJoint =
      request.mode === 'temptation'
        ? parsed.targetJoint ?? request.stats.topJoints[0]?.joint ?? 'nose'
        : undefined;

    const result: RefereeResponse = {
      line: parsed.line,
      targetJoint,
      source: 'gemma',
      latencyMs: Date.now() - started,
      model: info.model,
    };

    cache.set(key, { value: result, expiresAt: Date.now() + 120_000 });
    if (cache.size > 500) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    console.log(
      `[referee] ${request.mode} gemma ${result.latencyMs}ms "${result.line}"`,
    );
    return result;
  } catch (error) {
    console.warn(
      `[referee] Gemma failed after ${Date.now() - started}ms:`,
      error instanceof Error ? error.message : error,
    );
    return fallbackReferee(request);
  }
}
