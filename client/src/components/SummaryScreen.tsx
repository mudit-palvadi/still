import { useState } from 'react';
import { ROUND_DURATION_SEC } from '@shared/constants';
import { RANKS, rankFor } from '../lib/ranks';
import { copyResult, downloadShareCard, type ShareCardData } from '../lib/share';
import type { BoardState, GameResult } from '../lib/game';
import { Leaderboard } from './Leaderboard';

interface SummaryScreenProps {
  result: GameResult;
  name: string;
  board: BoardState;
  onReplay: () => void;
  onHome: () => void;
}

export function SummaryScreen({ result, name, board, onReplay, onHome }: SummaryScreenProps) {
  const [shareBusy, setShareBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const { summary } = result;
  const rank = rankFor(summary.score);
  const nextRank = [...RANKS].reverse().find((candidate) => candidate.min > summary.score);
  const rankFloor = nextRank ? rank.min : 0;
  const rankSpan = nextRank ? Math.max(1, nextRank.min - rankFloor) : 100;
  const rankProgress = nextRank
    ? Math.max(0, Math.min(100, ((summary.score - rankFloor) / rankSpan) * 100))
    : 100;

  const shareData: ShareCardData = {
    name,
    score: summary.score,
    rankTitle: rank.title,
    rankBlurb: rank.blurb,
    verdict: result.verdict,
    stillnessPct: summary.stillnessPct,
    longestFreeze: summary.longestFreeze,
    betrayals: summary.betrayals,
    percentile: result.percentile,
  };

  const saveCard = async (): Promise<void> => {
    setShareBusy(true);
    setShareError(null);
    try {
      await downloadShareCard(shareData);
    } catch (cause) {
      setShareError(cause instanceof Error ? cause.message : 'The share card failed to render.');
    } finally {
      setShareBusy(false);
    }
  };

  const copy = async (): Promise<void> => {
    setShareError(null);
    try {
      await copyResult(shareData);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setShareError('Your browser refused to copy the result. Rude.');
    }
  };

  const rankLine = result.rank !== null ? `#${result.rank}` : 'UNRANKED';
  const percentileLine =
    result.percentile !== null ? `TOP ${Math.max(1, Math.round(result.percentile))}%` : '—';

  return (
    <main className="summary">
      <header className="summary-top">
        <button className="brand brand-button" type="button" onClick={onHome} aria-label="STILL home">
          <span className="brand-mark" aria-hidden="true">
            <i />
          </span>
          <span className="brand-word">STILL</span>
        </button>

        <span className="summary-badge">
          <span className="status-dot is-on" /> OFFICIAL RESULT // WEEK 03
        </span>
      </header>

      <section className="summary-hero">
        <div className="summary-copy">
          <p className="eyebrow">ROUND COMPLETE // {ROUND_DURATION_SEC}.0 SECONDS OF RESISTANCE</p>
          <h1 className="summary-title">
            YOU HAVE
            <span>STOPPED MOVING.</span>
          </h1>
          <p className="summary-sub">
            The referee watched you do almost nothing, and it has notes. Your skeleton has been
            ranked against every other statue in the building.
          </p>

          <div className="summary-actions">
            <button className="btn btn-primary" type="button" onClick={onReplay}>
              RUN IT BACK <span aria-hidden="true">→</span>
            </button>
            <button className="btn btn-ghost" type="button" onClick={saveCard} disabled={shareBusy}>
              {shareBusy ? 'DRAWING CARD…' : 'DOWNLOAD SHARE CARD'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={copy}>
              {copied ? 'COPIED.' : 'COPY RESULT'}
            </button>
          </div>

          {shareError ? <p className="summary-error">{shareError}</p> : null}
          {result.submitError ? <p className="summary-note">{result.submitError}</p> : null}
        </div>

        <div className="summary-score-card panel">
          <div className="summary-score-head">
            <span>FINAL STILLNESS RATING</span>
            <span className={`source-pill ${result.verdictSource === 'gemma' ? 'gemma' : 'fallback'}`}>
              {result.verdictSource === 'gemma' ? 'GEMMA VERDICT' : 'LOCAL VERDICT'}
            </span>
          </div>

          <div className="summary-score">
            <strong>{summary.score.toFixed(1)}</strong>
            <span>/ 100</span>
          </div>

          <div className="summary-rank">
            <p>{rank.title.toUpperCase()}</p>
            <span>{rank.blurb}</span>
          </div>

          <div className="rank-progress">
            <div className="rank-progress-labels">
              <span>{rank.title.toUpperCase()}</span>
              <span>{nextRank ? `${nextRank.title.toUpperCase()} // ${nextRank.min}` : 'MAXIMUM SLOTH'}</span>
            </div>
            <div className="rank-track">
              <i style={{ width: `${rankProgress}%` }} />
            </div>
          </div>

          <div className="summary-score-foot">
            <span>{summary.completed ? 'VALID RANKED ROUND' : 'INCOMPLETE ROUND'}</span>
            <span>{new Date().toLocaleDateString(undefined, { month: 'short', day: '2-digit' })}</span>
          </div>
        </div>
      </section>

      <section className="summary-verdict panel">
        <div className="summary-verdict-head">
          <span className="referee-avatar" aria-hidden="true">
            <span>R</span>
          </span>
          <div>
            <p className="eyebrow">THE REFEREE&rsquo;S VERDICT</p>
            <span>POSE ANALYST // UNIT 01</span>
          </div>
        </div>
        <blockquote>&ldquo;{result.verdict}&rdquo;</blockquote>
        <div className="summary-verdict-foot">
          <span>
            {result.rank !== null
              ? `RANK ${rankLine} OF ${result.total ?? '—'}`
              : 'THE BOARD NEVER SAW THIS ONE'}
          </span>
          <span>{result.submitted ? 'SCORE SUBMITTED' : 'OFFLINE ROUND'}</span>
        </div>
      </section>

      <section className="summary-grid">
        <div className="summary-stats panel">
          <div className="summary-stats-head">
            <p className="eyebrow">THE DAMAGE REPORT</p>
            <h2>YOUR LAZY NUMBERS</h2>
          </div>

          <div className="stat-grid">
            <div className="stat">
              <span>STILLNESS</span>
              <strong>{summary.stillnessPct.toFixed(1)}%</strong>
              <small>of the round inside your threshold</small>
            </div>
            <div className="stat">
              <span>LONGEST FREEZE</span>
              <strong>{summary.longestFreeze.toFixed(1)}s</strong>
              <small>your personal statue era</small>
            </div>
            <div className="stat">
              <span>BETRAYALS</span>
              <strong>{summary.betrayals}</strong>
              <small>
                {summary.targetedBetrayals > 0
                  ? `${summary.targetedBetrayals} were targeted. Embarrassing.`
                  : 'none of them were targeted'}
              </small>
            </div>
            <div className="stat stat-highlight">
              <span>GLOBAL STANDING</span>
              <strong>{rankLine}</strong>
              <small>
                {result.percentile !== null
                  ? `${percentileLine} of all statues`
                  : 'play a ranked round to join the board'}
              </small>
            </div>
          </div>

          <p className="summary-lazy">
            <span>THE LAZY PAYOFF</span>
            You spent {ROUND_DURATION_SEC} seconds actively doing nothing and earned a permanent
            place on the internet. Somewhere, a productivity app just felt a disturbance.
          </p>

          <div className="summary-stats-actions">
            <button className="btn btn-primary" type="button" onClick={onReplay}>
              TRY TO BE STILLER
            </button>
            <button className="btn btn-ghost" type="button" onClick={onHome}>
              BACK TO THE LAIR
            </button>
          </div>
        </div>

        <Leaderboard
          scores={board.scores}
          total={board.total}
          source={board.source}
          limit={10}
          highlightId={result.entryId}
        />
      </section>

      <footer className="landing-footer summary-footer">
        <span>STILL // A HACKTOBERFEST WEEK 3 BUILD</span>
        <span>GEMMA · RENDER · MONGODB ATLAS</span>
        <span>NO CAMERA FOOTAGE LEFT THIS TAB</span>
      </footer>
    </main>
  );
}
