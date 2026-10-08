/** Logotipo: marca con glow y nombre. `sub` agrega un contexto (p. ej. "Panel"). */
export function Brand({ sub, size = 19 }: { sub?: string; size?: number }) {
  return (
    <div className="brand" style={{ fontSize: size }}>
      <span className="mark" style={{ width: size + 3, height: size + 3 }} />
      <span style={{ color: 'inherit' }}>
        Plan<span>azo</span>
      </span>
      {sub && <span className="sub">· {sub}</span>}
    </div>
  );
}
