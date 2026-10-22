import type { LeaderboardEntry } from '@shared/types';

interface LeaderboardProps {
  scores: LeaderboardEntry[];
  total: number;
  source: 'mongodb' | 'memory' | null;
  limit?: number;
  highlightId?: string | null;
}

export function Leaderboard({
  scores,
  total,
  source,
  limit = 10,
  highlightId = null,
}: LeaderboardProps) {
  const visible = scores.slice(0, limit);

  return (
    <div className="leaderboard panel">
      <div className="leaderboard-head">
        <div>
          <p className="eyebrow">THE STILLEST HUMANS</p>
          <h3>GLOBAL STILLNESS BOARD</h3>
        </div>
        <span className={`source-pill ${source ?? 'offline'}`}>
          {source === 'mongodb' ? 'MONGODB ATLAS' : source === 'memory' ? 'LOCAL BOARD' : 'BOARD OFFLINE'}
        </span>
      </div>

      <div className="lb-table">
        <div className="lb-row lb-columns">
          <span>#</span>
          <span>HUMAN</span>
          <span>STILL</span>
          <span>FREEZE</span>
          <span>SCORE</span>
        </div>
        {visible.length === 0 ? (
          <p className="lb-empty">
            No statues yet. The board is waiting with unnatural patience.
          </p>
        ) : (
          visible.map((entry, index) => (
            <div
              className={`lb-row ${entry.id === highlightId ? 'is-you' : ''}`}
              key={entry.id}
              title={entry.verdict}
            >
              <span className="lb-rank">{String(index + 1).padStart(2, '0')}</span>
              <span className="lb-name">
                {entry.name}
                {entry.id === highlightId ? <em>YOU</em> : null}
              </span>
              <span className="lb-stat">{entry.stillnessPct.toFixed(0)}%</span>
              <span className="lb-stat">{entry.longestFreeze.toFixed(1)}s</span>
              <span className="lb-score">{entry.score.toFixed(1)}</span>
            </div>
          ))
        )}
      </div>

      <div className="leaderboard-foot">
        <span>{total} ranked {total === 1 ? 'statue' : 'statues'}</span>
        <span>ONE SCORE PER ROUND</span>
      </div>
    </div>
  );
}
