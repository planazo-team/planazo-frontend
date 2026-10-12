/** Cada pantalla del cliente entra como una viñeta nueva (ver .page en globals.css). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page">{children}</div>;
}
