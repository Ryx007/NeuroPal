// Fixed page background: accent glow (Classic), engineering grid, grain and
// scanlines (Signal). Every layer reads skin variables, so it follows the
// visitor's look without re-rendering. Static: nothing here moves.
export function Backdrop() {
  return (
    <div className="np-backdrop" aria-hidden="true">
      <div className="np-backdrop__glow" />
      <div className="np-backdrop__grid" />
      <svg className="np-backdrop__grain" width="100%" height="100%" focusable="false">
        <filter id="np-grain-fx">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#np-grain-fx)" />
      </svg>
      <div className="np-backdrop__scan" />
    </div>
  );
}
