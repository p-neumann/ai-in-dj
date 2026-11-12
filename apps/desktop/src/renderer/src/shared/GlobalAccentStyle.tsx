// Phase 5, step 5 piece 12 (Stage 2a). Ported verbatim from reference/
// CheatCodeDJ_v_1_0_22016.sanitized.jsx's getGlobalStyle (source line
// 435) - the raw CSS his app injects for the native range-slider thumb
// (hidden/replaced so DualSliders can draw its own track underneath)
// and his two keyframe animations (the "Building (N Batches)" dots,
// and the glow-sweep text used while a fetch is in flight).

export default function GlobalAccentStyle({ accent }: { accent: string }): React.JSX.Element {
  const css = `
    input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:${accent};box-shadow:0 0 8px ${accent};cursor:pointer;border:none;}
    input[type=range]::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:${accent};box-shadow:0 0 8px ${accent};cursor:pointer;border:none;}
    @keyframes dotPulse{0%,100%{opacity:0.2}50%{opacity:1}}
    .dot1{animation:dotPulse 1.2s ease-in-out infinite 0s}
    .dot2{animation:dotPulse 1.2s ease-in-out infinite 0.4s}
    .dot3{animation:dotPulse 1.2s ease-in-out infinite 0.8s}
    @keyframes glowSweep{0%{background-position:-200% center}100%{background-position:200% center}}
    .glow-sweep{background-size:200% auto;animation:glowSweep 2s linear infinite;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
  `;
  return <style>{css}</style>;
}
