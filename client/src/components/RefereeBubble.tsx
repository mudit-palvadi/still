import type { RefereeMode } from '@shared/types';

interface RefereeBubbleProps {
  line: string;
  source: 'gemma' | 'fallback';
  mode: RefereeMode | null;
  pending: boolean;
  model?: string;
  latencyMs?: number;
}

export function RefereeBubble({
  line,
  source,
  mode,
  pending,
  model,
  latencyMs,
}: RefereeBubbleProps) {
  return (
    <div className="referee panel">
      <div className="referee-head">
        <div className="referee-avatar" aria-hidden="true">
          <span>R</span>
        </div>
        <div className="referee-id">
          <strong>THE REFEREE</strong>
          <span>POSE ANALYST // UNIT 01</span>
        </div>
        <span className={`source-tag ${source}`}>
          {source === 'gemma' ? 'GEMMA' : 'LOCAL'}
        </span>
      </div>

      <div className={`referee-bubble ${pending ? 'is-thinking' : ''}`}>
        {pending ? (
          <span className="typing" aria-label="The referee is thinking">
            <i />
            <i />
            <i />
          </span>
        ) : (
          <p>&ldquo;{line}&rdquo;</p>
        )}
      </div>

      <div className="referee-foot">
        <span>{mode ? mode.toUpperCase() : 'CALIBRATING'}</span>
        <span>
          {model
            ? `${model}${latencyMs !== undefined ? ` // ${latencyMs}ms` : ''}`
            : 'OPEN-WEIGHT REFEREE'}
        </span>
      </div>
    </div>
  );
}
