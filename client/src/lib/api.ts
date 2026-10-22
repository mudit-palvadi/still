import type {
  HealthResponse,
  LeaderboardResponse,
  RefereeRequest,
  RefereeResponse,
  RoundResponse,
  ScoreResponse,
  ScoreSubmission,
} from '@shared/types';

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = 8000 } = options;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(path, {
      method,
      signal: controller.signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const raw = await response.text();
    let payload: unknown = null;
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = { error: raw };
      }
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : `The referee answered with ${response.status}.`;
      throw new Error(message);
    }

    return payload as T;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('The referee took too long to answer.');
    }
    if (error instanceof TypeError) {
      throw new Error('Could not reach the referee. The round can still be played offline.');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export const api = {
  health(): Promise<HealthResponse> {
    return request<HealthResponse>('/api/health', { timeoutMs: 4500 });
  },

  createRound(): Promise<RoundResponse> {
    return request<RoundResponse>('/api/rounds', { method: 'POST', timeoutMs: 6000 });
  },

  referee(payload: RefereeRequest): Promise<RefereeResponse> {
    return request<RefereeResponse>('/api/referee', {
      method: 'POST',
      body: payload,
      timeoutMs: 8500,
    });
  },

  submitScore(payload: ScoreSubmission): Promise<ScoreResponse> {
    return request<ScoreResponse>('/api/scores', {
      method: 'POST',
      body: payload,
      timeoutMs: 7500,
    });
  },

  leaderboard(limit = 20): Promise<LeaderboardResponse> {
    return request<LeaderboardResponse>(`/api/leaderboard?limit=${limit}`, {
      timeoutMs: 5000,
    });
  },
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something moved that should not have.';
}
