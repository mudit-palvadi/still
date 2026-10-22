export function ArenaPreview() {
  return (
    <div className="preview panel">
      <div className="preview-top">
        <span>ARENA FEED // PREVIEW</span>
        <span className="live-tag">
          <i /> LIVE
        </span>
      </div>

      <div className="preview-stage">
        <svg viewBox="0 0 560 560" role="img" aria-label="A skeleton with a target on its right wrist">
          <defs>
            <pattern id="preview-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(242,236,217,0.05)" strokeWidth="1" />
            </pattern>
            <radialGradient id="preview-glow" cx="50%" cy="45%" r="55%">
              <stop offset="0%" stopColor="rgba(201,242,111,0.12)" />
              <stop offset="100%" stopColor="rgba(201,242,111,0)" />
            </radialGradient>
          </defs>

          <rect width="560" height="560" fill="url(#preview-grid)" />
          <rect width="560" height="560" fill="url(#preview-glow)" />

          <g className="preview-skeleton" fill="none" stroke="#c9f26f" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="280" cy="98" r="33" strokeWidth="3" />
            <path d="M280 131 L280 300" strokeWidth="3" />
            <path d="M200 178 L360 178" strokeWidth="3" />
            <path d="M200 178 L155 270 L130 365" strokeWidth="3" />
            <path d="M360 178 L405 270 L430 355" strokeWidth="3" />
            <path d="M225 300 L335 300" strokeWidth="3" />
            <path d="M225 300 L210 420 L200 520" strokeWidth="3" />
            <path d="M335 300 L350 420 L365 520" strokeWidth="3" />
          </g>

          <g fill="#f2ecd9">
            <circle cx="280" cy="98" r="5" />
            <circle cx="200" cy="178" r="5" />
            <circle cx="360" cy="178" r="5" />
            <circle cx="155" cy="270" r="5" />
            <circle cx="405" cy="270" r="5" />
            <circle cx="130" cy="365" r="5" />
            <circle cx="430" cy="355" r="5" />
            <circle cx="225" cy="300" r="5" />
            <circle cx="335" cy="300" r="5" />
            <circle cx="210" cy="420" r="5" />
            <circle cx="350" cy="420" r="5" />
            <circle cx="200" cy="520" r="5" />
            <circle cx="365" cy="520" r="5" />
          </g>

          <g className="preview-target">
            <circle cx="430" cy="355" r="34" fill="none" stroke="#f4b860" strokeWidth="2" />
            <circle cx="430" cy="355" r="21" fill="rgba(244,184,96,0.12)" stroke="#f4b860" strokeWidth="1" />
            <path d="M430 309 L430 321 M430 389 L430 401 M384 355 L396 355 M464 355 L476 355" stroke="#f4b860" strokeWidth="2" />
          </g>
        </svg>

        <div className="preview-target-label">TARGET // RIGHT WRIST</div>

        <div className="preview-score">
          <span>STILLNESS</span>
          <strong>94.2</strong>
          <small>RATING</small>
        </div>

        <div className="preview-betrayal">
          <span>2</span> BETRAYALS
        </div>
      </div>

      <div className="preview-foot">
        <span>60.0s ROUND</span>
        <span>17 JOINTS</span>
        <span>0 MERCY</span>
      </div>
    </div>
  );
}
