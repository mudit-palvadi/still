import { useCallback, useEffect, useState } from 'react';
import type { HealthResponse } from '@shared/types';
import { api } from './lib/api';
import type { AppPhase, BoardState, GameResult } from './lib/game';
import { StartScreen } from './components/StartScreen';
import { GameScreen } from './components/GameScreen';
import { SummaryScreen } from './components/SummaryScreen';

const NAME_KEY = 'still.name';

const EMPTY_BOARD: BoardState = {
  scores: [],
  total: 0,
  source: null,
};

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('landing');
  const [round, setRound] = useState(0);
  const [name, setName] = useState(readName);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [board, setBoard] = useState<BoardState>(EMPTY_BOARD);
  const [result, setResult] = useState<GameResult | null>(null);

  const displayName = name.trim() || 'Anonymous Sloth';

  const refreshBoard = useCallback(async (): Promise<void> => {
    try {
      const response = await api.leaderboard(20);
      setBoard(response);
    } catch (cause) {
      console.warn('[board] could not load the leaderboard', cause);
      setBoard((current) => ({
        ...current,
        source: null,
      }));
    }
  }, []);

  useEffect(() => {
    let alive = true;

    void Promise.allSettled([api.health(), api.leaderboard(20)]).then(([healthResult, boardResult]) => {
      if (!alive) return;

      if (healthResult.status === 'fulfilled') {
        setHealth(healthResult.value);
      } else {
        console.warn('[health] the referee is not picking up', healthResult.reason);
      }

      if (boardResult.status === 'fulfilled') {
        setBoard(boardResult.value);
      } else {
        console.warn('[board] could not load the leaderboard', boardResult.reason);
      }
    });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      // Storage can be blocked; the round still works.
    }
  }, [name]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [phase]);

  const beginRound = (): void => {
    setResult(null);
    setRound((current) => current + 1);
    setPhase('game');
  };

  const finishRound = (gameResult: GameResult): void => {
    setResult(gameResult);
    setPhase('summary');
    void refreshBoard();
  };

  const goHome = (): void => {
    setResult(null);
    setPhase('landing');
    void refreshBoard();
  };

  return (
    <div className="app">
      {phase === 'game' ? (
        <GameScreen
          key={round}
          playerName={displayName}
          onFinish={finishRound}
          onQuit={goHome}
        />
      ) : phase === 'summary' && result ? (
        <SummaryScreen
          result={result}
          name={displayName}
          board={board}
          onReplay={beginRound}
          onHome={goHome}
        />
      ) : (
        <StartScreen
          name={name}
          onNameChange={setName}
          onStart={beginRound}
          health={health}
          board={board}
        />
      )}
    </div>
  );
}
