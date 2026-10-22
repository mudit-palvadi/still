import type { FormEvent } from 'react';
import type { HealthResponse } from '@shared/types';
import { MAX_NAME_LENGTH } from '@shared/constants';
import { ArenaPreview } from './ArenaPreview';
import { Leaderboard } from './Leaderboard';
import type { BoardState } from '../lib/game';

interface StartScreenProps {
  name: string;
  onNameChange: (name: string) => void;
  onStart: () => void;
  health: HealthResponse | null;
  board: BoardState;
}

export function StartScreen({ name, onNameChange, onStart, health, board }: StartScreenProps) {
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onStart();
  };

  const gemmaOnline = health?.gemma.configured === true;
  const dbLabel =
    health?.db === 'mongodb'
      ? 'MONGODB ATLAS'
      : health?.db === 'memory'
        ? 'LOCAL BOARD'
        : 'BOARD UNKNOWN';

  return (
    <main className="landing">
      <header className="topbar">
        <a className="brand" href="/" aria-label="STILL home">
          <span className="brand-mark" aria-hidden="true">
            <i />
          </span>
          <span className="brand-word">STILL</span>
        </a>

        <a
          className="challenge-pill"
          href="https://dev.to/challenges/hacktoberfest-week3-2026-10-19"
          target="_blank"
          rel="noreferrer"
        >
          <span className="status-dot" />
          HACKTOBERFEST 2026 // WEEK 3
        </a>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow hero-kicker">SLOTH DISCIPLINE // SEASON 01</p>
          <h1 className="hero-title">
            <span>THE FIRST</span>
            <span className="hero-title-accent">ESPORT FOR</span>
            <span>LYING DOWN.</span>
          </h1>
          <p className="hero-sub">
            60 seconds. One rule: <strong>don&rsquo;t move.</strong> A Gemma-powered referee
            watches your skeleton, finds your weakest joint, and tries very hard to make you
            twitch.
          </p>

          <form className="start-form" onSubmit={submit}>
            <label htmlFor="player-name">ENTER THE ARENA AS</label>
            <div className="start-row">
              <input
                id="player-name"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                maxLength={MAX_NAME_LENGTH}
                placeholder="Anonymous Sloth"
                autoComplete="nickname"
                spellCheck={false}
              />
              <button className="btn btn-primary" type="submit">
                ENTER THE ARENA <span aria-hidden="true">→</span>
              </button>
            </div>
          </form>

          <p className="microcopy">
            No signup. No camera upload. Just a name and a dangerous amount of confidence.
          </p>

          <div className="status-strip">
            <span className={`status-dot ${gemmaOnline ? 'is-on' : ''}`} />
            <span>{gemmaOnline ? 'GEMMA REFEREE ONLINE' : 'FALLBACK REFEREE READY'}</span>
            <span className="sep">/</span>
            <span>{health?.gemma.model ?? 'MODEL UNKNOWN'}</span>
            <span className="sep">/</span>
            <span>{dbLabel}</span>
          </div>
        </div>

        <div className="hero-preview">
          <ArenaPreview />
          <div className="preview-caption">
            <span>FIG. 01</span>
            <p>
              Your skeleton is processed on-device with MoveNet. The referee only receives the
              ugly little summary of your fidgeting.
            </p>
          </div>
        </div>
      </section>

      <section className="how-section">
        <div className="section-heading">
          <p className="eyebrow">THE DISCIPLINE</p>
          <h2>HOW TO DO ABSOLUTELY NOTHING</h2>
        </div>

        <div className="how-grid">
          <article className="how-card panel">
            <span className="how-number">01</span>
            <h3>CALIBRATE</h3>
            <p>
              Stand still for three seconds. The referee measures your personal baseline fidget
              frequency. Yes, you have one. It is embarrassing.
            </p>
            <span className="how-tag">3.0 SEC</span>
          </article>

          <article className="how-card panel">
            <span className="how-number">02</span>
            <h3>FREEZE</h3>
            <p>
              Stay inside your stillness threshold for sixty seconds. Wrists and noses are
              weighted heavily. Breathing is allowed. Barely.
            </p>
            <span className="how-tag">60.0 SEC</span>
          </article>

          <article className="how-card panel">
            <span className="how-number">03</span>
            <h3>SURVIVE THE REFEREE</h3>
            <p>
              Gemma reads your weakest joints and sends a targeted temptation. Move the
              highlighted joint during the window and pay double.
            </p>
            <span className="how-tag">2x PENALTY</span>
          </article>
        </div>
      </section>

      <section className="board-grid">
        <Leaderboard
          scores={board.scores}
          total={board.total}
          source={board.source}
          limit={6}
        />

        <aside className="rules panel">
          <p className="eyebrow">THE FINE PRINT</p>
          <h3>HOUSE RULES</h3>
          <ul>
            <li>
              <span>01</span>
              The camera never leaves this tab. Pose estimation runs locally in your browser.
            </li>
            <li>
              <span>02</span>
              Only a skeleton summary is sent to the referee: rating, weakest joints, betrayal
              count.
            </li>
            <li>
              <span>03</span>
              One round, one score. No retries on the leaderboard. The board remembers.
            </li>
            <li>
              <span>04</span>
              The referee is an open-weight Gemma model. It has opinions. They are not medical
              advice.
            </li>
          </ul>
          <p className="rules-quote">
            &ldquo;The winner is the person who does the least.&rdquo;
            <span>— THE REFEREE</span>
          </p>
        </aside>
      </section>

      <footer className="landing-footer">
        <span>STILL // A HACKTOBERFEST WEEK 3 BUILD</span>
        <span>GEMMA · RENDER · MONGODB ATLAS</span>
        <span>MADE BY MUDIT PALVADI</span>
      </footer>
    </main>
  );
}
