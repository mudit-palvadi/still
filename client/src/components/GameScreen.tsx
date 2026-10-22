import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { JointMovement, RefereeMode, RefereeResponse } from '@shared/types';
import { JOINT_LABELS } from '@shared/types';
import { ROUND_DURATION_MS, ROUND_DURATION_SEC, TEMPTATION_MS } from '@shared/constants';
import { useCamera } from '../hooks/useCamera';
import { usePose } from '../hooks/usePose';
import { StillnessEngine, type RoundSnapshot } from '../lib/scoring';
import { api, errorMessage } from '../lib/api';
import { clientFallback } from '../lib/fallback';
import { GameAudio } from '../lib/sound';
import type { OverlayState } from '../lib/draw';
import type { GameResult } from '../lib/game';
import { RefereeBubble } from './RefereeBubble';

interface GameScreenProps {
  playerName: string;
  onFinish: (result: GameResult) => void;
  onQuit: () => void;
}

type Stage = 'booting' | 'calibrating' | 'playing' | 'ending' | 'error';

interface RefereeView {
  line: string;
  source: 'gemma' | 'fallback';
  mode: RefereeMode | null;
  pending: boolean;
  model?: string;
  latencyMs?: number;
}

interface Toast {
  joint: keyof typeof JOINT_LABELS;
  targeted: boolean;
  nonce: number;
}

const INITIAL_REFEREE: RefereeView = {
  line: 'Stand still. I will know if you don\u2019t.',
  source: 'fallback',
  mode: null,
  pending: false,
};

const CUES: Array<{ at: number; mode: RefereeMode; key: string }> = [
  { at: 8, mode: 'taunt', key: 'taunt-8' },
  { at: 18, mode: 'temptation', key: 'temptation-18' },
  { at: 32, mode: 'taunt', key: 'taunt-32' },
  { at: 44, mode: 'temptation', key: 'temptation-44' },
];

const MUTE_KEY = 'still.muted';

export function GameScreen({ playerName, onFinish, onQuit }: GameScreenProps) {
  const camera = useCamera();
  const pose = usePose();

  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<Stage>('booting');
  const [snapshot, setSnapshot] = useState<RoundSnapshot | null>(null);
  const [weakJoints, setWeakJoints] = useState<JointMovement[]>([]);
  const [referee, setReferee] = useState<RefereeView>(INITIAL_REFEREE);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<OverlayState>({});
  const engineRef = useRef<StillnessEngine | null>(null);
  const audioRef = useRef<GameAudio | null>(null);
  const onFinishRef = useRef(onFinish);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  // Runtime detector failures should land on the friendly error screen.
  useEffect(() => {
    if (!pose.error) return;
    camera.stop();
    setFatalError(pose.error);
    setStage((current) => (current === 'ending' ? current : 'error'));
  }, [pose.error, camera.stop]);

  useEffect(() => {
    let disposed = false;
    let finishStarted = false;
    let refereePending = false;
    let lastPush = 0;
    let lastTick = 0;
    let lastBetrayalNonce = 0;
    let pushedEventNonce = 0;
    let currentStage: Stage = 'booting';
    let roundId: string | null = null;
    let finishTimer: number | null = null;
    const firedCues = new Set<string>();
    const overlay: OverlayState = {};
    const engine = new StillnessEngine();
    const audio = new GameAudio(muted);

    engineRef.current = engine;
    audioRef.current = audio;
    overlayRef.current = overlay;

    const goStage = (next: Stage): void => {
      currentStage = next;
      setStage(next);
    };

    const showToast = (joint: keyof typeof JOINT_LABELS, targeted: boolean): void => {
      setToast({ joint, targeted, nonce: Date.now() });
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = window.setTimeout(() => setToast(null), 1500);
    };

    const applyReferee = (response: RefereeResponse, mode: RefereeMode): void => {
      if (disposed) return;
      setReferee({
        line: response.line,
        source: response.source,
        mode,
        pending: false,
        model: response.model,
        latencyMs: response.latencyMs,
      });

      if (mode === 'temptation' && response.targetJoint && engine.getPhase() === 'playing') {
        engine.startTemptation(response.targetJoint, performance.now(), TEMPTATION_MS);
        overlay.targetJoint = response.targetJoint;
        audio.temptation();
      }
    };

    const requestReferee = async (mode: RefereeMode): Promise<void> => {
      if (refereePending || disposed || finishStarted) return;
      refereePending = true;
      setReferee((current) => ({ ...current, mode, pending: true }));

      const telemetry = engine.getTelemetry();
      try {
        const response = await api.referee({
          roundId: roundId ?? undefined,
          mode,
          stats: telemetry,
        });
        if (disposed || finishStarted) return;
        applyReferee(response, mode);
      } catch (cause) {
        console.warn('[referee] falling back locally', cause);
        if (disposed || finishStarted) return;
        const fallback = clientFallback(mode, telemetry);
        applyReferee({ ...fallback, latencyMs: undefined }, mode);
      } finally {
        refereePending = false;
      }
    };

    const evaluateCues = (snap: RoundSnapshot): void => {
      if (currentStage !== 'playing') return;
      for (const cue of CUES) {
        if (snap.elapsed < cue.at || firedCues.has(cue.key)) continue;
        if (refereePending) return;
        firedCues.add(cue.key);
        void requestReferee(cue.mode);
        return;
      }
    };

    const finishRound = async (snap: RoundSnapshot): Promise<void> => {
      if (finishStarted) return;
      finishStarted = true;
      if (finishTimer !== null) {
        window.clearTimeout(finishTimer);
        finishTimer = null;
      }
      goStage('ending');
      pose.stop();
      camera.stop();

      const summary = engine.finish(performance.now());
      audio.finish();
      setSnapshot({
        ...snap,
        phase: 'finished',
        elapsed: summary.duration,
        rating: summary.score,
        stillnessPct: summary.stillnessPct,
        betrayals: summary.betrayals,
        longestFreeze: summary.longestFreeze,
        temptation: null,
        visible: true,
      });
      setReferee((current) => ({ ...current, mode: 'verdict', pending: true }));

      const telemetry = engine.getTelemetry();
      let verdict = clientFallback('verdict', telemetry).line;
      let verdictSource: 'gemma' | 'fallback' = 'fallback';

      try {
        const response = await api.referee({
          roundId: roundId ?? undefined,
          mode: 'verdict',
          stats: telemetry,
        });
        verdict = response.line;
        verdictSource = response.source;
        if (!disposed) {
          setReferee({
            line: response.line,
            source: response.source,
            mode: 'verdict',
            pending: false,
            model: response.model,
            latencyMs: response.latencyMs,
          });
        }
      } catch (cause) {
        console.warn('[referee] verdict fell back locally', cause);
        if (!disposed) {
          setReferee({
            line: verdict,
            source: 'fallback',
            mode: 'verdict',
            pending: false,
          });
        }
      }

      if (disposed) return;

      let submission: Awaited<ReturnType<typeof api.submitScore>> | null = null;
      let submitError: string | null = null;

      if (roundId) {
        try {
          submission = await api.submitScore({
            roundId,
            name: playerName,
            score: Number(summary.score.toFixed(1)),
            stillnessPct: Number(summary.stillnessPct.toFixed(1)),
            betrayals: summary.betrayals,
            longestFreeze: Number(summary.longestFreeze.toFixed(1)),
            verdict,
          });
        } catch (cause) {
          submitError = errorMessage(cause);
        }
      } else {
        submitError = 'This round was played offline, so the board never saw it.';
      }

      if (disposed) return;

      onFinishRef.current({
        summary,
        verdict,
        verdictSource,
        roundId,
        submitted: submission !== null,
        submitError,
        entryId: submission?.entry.id ?? null,
        rank: submission?.rank ?? null,
        total: submission?.total ?? null,
        percentile: submission?.percentile ?? null,
      });
    };

    const handlePose = (points: Parameters<StillnessEngine['update']>[0], now: number): void => {
      if (disposed || finishStarted) return;
      const snap = engine.update(points, now);

      if (snap.phase === 'calibrating' && currentStage !== 'calibrating') {
        goStage('calibrating');
      }

      if (snap.phase === 'playing' && currentStage !== 'playing') {
        goStage('playing');
        lastTick = 0;
        audio.calibration();

        // If the tab sleeps or the skeleton disappears, the clock still wins.
        if (finishTimer !== null) window.clearTimeout(finishTimer);
        finishTimer = window.setTimeout(() => {
          if (disposed || finishStarted) return;
          const finalSnap = engine.update([], performance.now());
          if (finalSnap.phase === 'finished') void finishRound(finalSnap);
        }, ROUND_DURATION_MS + 1200);
      }

      if (snap.eventNonce > lastBetrayalNonce && snap.lastEvent) {
        lastBetrayalNonce = snap.eventNonce;
        overlay.eventJoint = snap.lastEvent.joint;
        overlay.eventAt = now;
        overlay.eventNonce = snap.eventNonce;
        audio.betrayal(snap.lastEvent.targeted);
        showToast(snap.lastEvent.joint, snap.lastEvent.targeted);
      }

      if (snap.temptation) {
        overlay.targetJoint = snap.temptation.targetJoint;
      } else if (overlay.targetJoint) {
        overlay.targetJoint = undefined;
      }

      if (snap.phase === 'playing') {
        const second = Math.floor(snap.elapsed);
        if (second > lastTick) {
          lastTick = second;
          audio.tick();
        }
        evaluateCues(snap);
      }

      const shouldPush = now - lastPush >= 85 || snap.eventNonce !== pushedEventNonce;
      if (shouldPush) {
        lastPush = now;
        pushedEventNonce = snap.eventNonce;
        setSnapshot(snap);
        setWeakJoints(engine.getTelemetry().topJoints.slice(0, 4));
      }

      if (snap.phase === 'finished') {
        void finishRound(snap);
      }
    };

    const boot = async (): Promise<void> => {
      try {
        setFatalError(null);
        goStage('booting');
        setSnapshot(null);
        setWeakJoints([]);
        setReferee(INITIAL_REFEREE);

        const video = camera.videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) {
          throw new Error('The arena did not finish rendering. Try again.');
        }

        void audio.unlock();
        await Promise.all([camera.start(), pose.load()]);
        if (disposed) {
          camera.stop();
          pose.stop();
          return;
        }

        engine.start(performance.now());
        goStage('calibrating');
        audio.calibration();
        pose.start(video, canvas, handlePose, () => overlayRef.current);

        void api
          .createRound()
          .then((round) => {
            if (!disposed) roundId = round.roundId;
          })
          .catch((cause) => {
            console.warn('[round] could not create a ranked round', cause);
          });
      } catch (cause) {
        if (disposed) return;
        pose.stop();
        camera.stop();
        setFatalError(errorMessage(cause));
        goStage('error');
      }
    };

    void boot();

    return () => {
      disposed = true;
      if (finishTimer !== null) window.clearTimeout(finishTimer);
      pose.stop();
      camera.stop();
      audio.close();
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, [attempt]);

  const toggleMute = (): void => {
    const next = !muted;
    setMuted(next);
    try {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0');
    } catch {
      // Storage can be blocked; mute still works for this round.
    }
    audioRef.current?.setMuted(next);
    void audioRef.current?.unlock();
  };

  const requestQuit = (): void => {
    const confirmed = window.confirm(
      'Abandon this round? The leaderboard will not remember you.',
    );
    if (confirmed) onQuit();
  };

  const retryCamera = (): void => {
    setFatalError(null);
    setToast(null);
    setAttempt((current) => current + 1);
  };

  const rating = snapshot?.rating ?? 100;
  const stillness = snapshot?.stillnessPct ?? 100;
  const longestFreeze = snapshot?.longestFreeze ?? 0;
  const betrayals = snapshot?.betrayals ?? 0;
  const clock = formatClock(snapshot?.elapsed ?? 0);
  const calibrationProgress = snapshot?.calibrationProgress ?? 0;
  const temptation = snapshot?.temptation ?? null;
  const maxWeakness = Math.max(0.0001, weakJoints[0]?.movement ?? 0.0001);
  const frameStyle = { '--arena-ratio': aspect } as CSSProperties;
  const calibrationDegrees = Math.round(calibrationProgress * 360);
  const remainingTemptation = temptation ? temptation.remaining : 0;

  return (
    <div className="game">
      <header className="game-top">
        <div className="brand brand-compact">
          <span className="brand-mark" aria-hidden="true">
            <i />
          </span>
          <span className="brand-word">STILL</span>
        </div>

        <div className="game-mode">
          <span className="status-dot is-on" />
          SOLO RANKED // SLOW &amp; STEADY
        </div>

        <div className="game-actions">
          <button className="icon-btn" type="button" onClick={toggleMute} aria-pressed={muted}>
            {muted ? 'SOUND OFF' : 'SOUND ON'}
          </button>
          <button className="icon-btn icon-btn-danger" type="button" onClick={requestQuit}>
            ABANDON
          </button>
        </div>
      </header>

      <main className="game-grid">
        <section className="arena-shell">
          <div className="arena-frame" style={frameStyle}>
            <div className="arena-media mirror">
              <video
                ref={camera.videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={(event) => {
                  const video = event.currentTarget;
                  if (video.videoWidth > 0 && video.videoHeight > 0) {
                    setAspect(video.videoWidth / video.videoHeight);
                  }
                }}
              />
              <canvas ref={canvasRef} />
            </div>

            <div className="arena-vignette" aria-hidden="true" />

            <div className="hud hud-top">
              <div className="hud-block">
                <span>RATING</span>
                <strong>{Math.round(rating)}</strong>
              </div>
              <div className="hud-live">
                <i />
                LIVE
              </div>
              <div className="hud-block hud-right">
                <span>TIME</span>
                <strong>{clock}</strong>
              </div>
            </div>

            <div className="hud hud-bottom">
              <div className="hud-metric">
                <span>STILLNESS</span>
                <strong>{stillness.toFixed(1)}%</strong>
                <div className="meter">
                  <i style={{ width: `${Math.max(0, Math.min(100, stillness))}%` }} />
                </div>
              </div>
              <div className="hud-metric hud-right">
                <span>BETRAYALS</span>
                <strong>{betrayals}</strong>
              </div>
            </div>

            {stage === 'booting' ? (
              <div className="arena-overlay booting">
                <div className="loader-ring" aria-hidden="true" />
                <p className="eyebrow">WAKING THE REFEREE</p>
                <h2>LOADING MOVENET</h2>
                <p>
                  The pose model downloads once and runs entirely in your browser. The camera
                  feed never leaves this tab.
                </p>
              </div>
            ) : null}

            {stage === 'calibrating' ? (
              <div className="arena-overlay calibration">
                <div
                  className="calibration-ring"
                  style={{ '--calibration': `${calibrationDegrees}deg` } as CSSProperties}
                >
                  <div className="calibration-inner">
                    <strong>{Math.max(1, Math.ceil(3 - calibrationProgress * 3))}</strong>
                    <span>STAND STILL</span>
                  </div>
                </div>
                <p className="eyebrow">CALIBRATION IN PROGRESS</p>
                <p className="calibration-copy">Measuring your baseline fidget frequency.</p>
                {snapshot && !snapshot.visible ? (
                  <p className="frame-hint">STEP INTO FRAME</p>
                ) : null}
              </div>
            ) : null}

            {stage === 'playing' && snapshot && !snapshot.visible ? (
              <div className="tracking-lost">STEP BACK INTO FRAME</div>
            ) : null}

            {stage === 'playing' && temptation ? (
              <div className="temptation-banner">
                <span className="temptation-pulse" />
                <div className="temptation-copy">
                  <span>DO NOT MOVE</span>
                  <strong>YOUR {JOINT_LABELS[temptation.targetJoint].toUpperCase()}</strong>
                </div>
                <div className="temptation-track">
                  <i
                    style={{
                      width: `${Math.max(0, Math.min(100, (remainingTemptation * 1000 / TEMPTATION_MS) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}

            {toast ? (
              <div
                key={toast.nonce}
                className={`betrayal-toast ${toast.targeted ? 'is-targeted' : ''}`}
              >
                <span>
                  {toast.targeted ? 'TARGETED BETRAYAL' : 'BETRAYAL'}
                </span>
                <strong>{JOINT_LABELS[toast.joint].toUpperCase()}</strong>
                <em>{toast.targeted ? '-2' : '-1'}</em>
              </div>
            ) : null}

            {stage === 'ending' ? (
              <div className="arena-overlay ending">
                <p className="eyebrow">ROUND COMPLETE</p>
                <h2>THE REFEREE IS DELIBERATING.</h2>
                <div className="ending-score">
                  <span>PROVISIONAL</span>
                  <strong>{rating.toFixed(1)}</strong>
                </div>
                <p className="ending-quote">
                  {referee.pending ? 'Reading your joints one last time.' : `\u201c${referee.line}\u201d`}
                </p>
                <div className="indeterminate">
                  <i />
                </div>
              </div>
            ) : null}

            {stage === 'error' ? (
              <div className="arena-overlay error-overlay">
                <p className="eyebrow">SIGNAL LOST</p>
                <h2>THE REFEREE CAN&rsquo;T SEE YOU.</h2>
                <p>{fatalError ?? pose.error ?? camera.error ?? 'Something went wrong.'}</p>
                <div className="error-actions">
                  <button className="btn btn-primary" type="button" onClick={retryCamera}>
                    RETRY CAMERA
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={onQuit}>
                    BACK TO SAFETY
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="arena-footline">
            <span>
              <i className="status-dot is-on" /> CAMERA LOCAL
            </span>
            <span>MOVENET // {pose.backend?.toUpperCase() ?? 'LOADING'}</span>
            <span>REFEREE // {referee.source === 'gemma' ? 'GEMMA' : 'FALLBACK'}</span>
          </div>
        </section>

        <aside className="game-side">
          <RefereeBubble
            line={referee.line}
            source={referee.source}
            mode={referee.mode}
            pending={referee.pending}
            model={referee.model}
            latencyMs={referee.latencyMs}
          />

          <div className="telemetry panel">
            <div className="telemetry-head">
              <p className="eyebrow">ROUND TELEMETRY</p>
              <span>{stage.toUpperCase()}</span>
            </div>

            <div className="gauge-row">
              <div className="gauge">
                <svg viewBox="0 0 140 140" aria-hidden="true">
                  <circle
                    cx="70"
                    cy="70"
                    r="54"
                    fill="none"
                    stroke="rgba(242,236,217,0.12)"
                    strokeWidth="8"
                  />
                  <circle
                    cx="70"
                    cy="70"
                    r="54"
                    fill="none"
                    stroke="var(--lime)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(Math.max(0, Math.min(100, rating)) / 100) * 339.29} 339.29`}
                    transform="rotate(-90 70 70)"
                  />
                </svg>
                <div className="gauge-value">
                  <strong>{Math.round(rating)}</strong>
                  <span>/ 100</span>
                </div>
              </div>
              <div className="gauge-copy">
                <span>STILLNESS RATING</span>
                <strong>{rating.toFixed(1)}</strong>
                <small>LIVE SCORE</small>
              </div>
            </div>

            <div className="telemetry-rows">
              <div>
                <span>STILLNESS</span>
                <strong>{stillness.toFixed(1)}%</strong>
              </div>
              <div>
                <span>LONGEST FREEZE</span>
                <strong>{longestFreeze.toFixed(1)}s</strong>
              </div>
              <div>
                <span>BETRAYALS</span>
                <strong>{betrayals}</strong>
              </div>
            </div>

            <p className="telemetry-note">
              The referee sees numbers, not your face. Move the highlighted joint and pay double.
            </p>
          </div>

          <div className="weak panel">
            <div className="weak-head">
              <p className="eyebrow">WEAKEST JOINTS</p>
              <span>LIVE</span>
            </div>
            {weakJoints.length === 0 ? (
              <p className="weak-empty">No movement yet. Suspicious.</p>
            ) : (
              weakJoints.map((joint) => (
                <div className="weak-row" key={joint.joint}>
                  <span>{JOINT_LABELS[joint.joint]}</span>
                  <div className="weak-track">
                    <i
                      style={{
                        width: `${Math.max(6, (joint.movement / maxWeakness) * 100)}%`,
                      }}
                    />
                  </div>
                  <em>{Math.round((joint.movement / maxWeakness) * 100)}</em>
                </div>
              ))
            )}
            <p className="weak-note">Gemma picks temptation targets from this list.</p>
          </div>
        </aside>
      </main>
    </div>
  );
}

function formatClock(elapsed: number): string {
  const remaining = Math.max(0, Math.ceil(ROUND_DURATION_SEC - elapsed));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
