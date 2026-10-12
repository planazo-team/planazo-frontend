/**
 * Efectos de un solo disparo, dibujados directo en el DOM (sin estado de
 * React): confeti, onomatopeyas, telarañas y la araña que baja del techo.
 * Todos respetan `prefers-reduced-motion` desde el CSS y se limpian solos.
 *
 * Easter eggs del equipo Spidiverse. Si los encontraste: con un gran poder
 * viene una gran responsabilidad. 🕷️
 */

const reducido = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function capa(clase: string, ms: number): HTMLElement {
  const el = document.createElement('div');
  el.className = clase;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
  return el;
}

const PALETA = ['#ffd84a', '#ff3b5c', '#2f6bff', '#3fcf9e', '#ffffff', '#ff2e88'];

/** Lluvia de confeti desde un punto de la pantalla. */
export function confeti(x = window.innerWidth / 2, y = window.innerHeight / 2, n = 36, colores = PALETA) {
  if (typeof document === 'undefined' || reducido()) return;
  const layer = capa('burst-layer', 1500);
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.className = 'p';
    const ang = Math.random() * Math.PI * 2;
    const dist = 90 + Math.random() * 180;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.background = colores[i % colores.length];
    p.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(ang) * dist + 120}px`);
    p.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    if (i % 3 === 0) p.style.borderRadius = '50%';
    layer.appendChild(p);
  }
}

/** Onomatopeya de cómic ("¡THWIP!", "¡ZAS!") que estalla en un punto. */
export function boom(texto: string, x = window.innerWidth / 2, y = window.innerHeight / 2, azul = false) {
  if (typeof document === 'undefined') return;
  const layer = capa('burst-layer', 1400);
  const b = document.createElement('span');
  b.className = `boom anim${azul ? ' blue' : ''}`;
  b.textContent = texto;
  b.style.position = 'absolute';
  b.style.left = `${Math.max(10, Math.min(window.innerWidth - 150, x - 70))}px`;
  b.style.top = `${Math.max(10, y - 60)}px`;
  layer.appendChild(b);
  setTimeout(() => {
    b.style.transition = 'opacity .35s, transform .35s';
    b.style.opacity = '0';
    b.style.transform = 'rotate(-8deg) scale(1.3)';
  }, 950);
}

/** ¡Thwip! Telarañas que salen disparadas desde un punto hacia las esquinas. */
export function lanzarTelaraña(x = window.innerWidth / 2, y = window.innerHeight / 2) {
  if (typeof document === 'undefined' || reducido()) return;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'web-shot');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  const w = window.innerWidth;
  const h = window.innerHeight;
  const destinos = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
    [w / 2, 0],
    [0, h / 2],
    [w, h / 2],
  ];
  for (const [tx, ty] of destinos) {
    const l = document.createElementNS(ns, 'line');
    l.setAttribute('x1', String(x));
    l.setAttribute('y1', String(y));
    l.setAttribute('x2', String(tx));
    l.setAttribute('y2', String(ty));
    svg.appendChild(l);
  }
  // anillos de la telaraña alrededor del punto
  for (const r of [40, 80, 130]) {
    const pts: string[] = [];
    for (let i = 0; i <= destinos.length; i++) {
      const [tx, ty] = destinos[i % destinos.length];
      const ang = Math.atan2(ty - y, tx - x);
      pts.push(`${x + Math.cos(ang) * r},${y + Math.sin(ang) * r}`);
    }
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', `M ${pts.join(' Q ' + x + ',' + y + ' ')}`);
    p.setAttribute('opacity', '0.7');
    svg.appendChild(p);
  }
  document.body.appendChild(svg);
  setTimeout(() => svg.remove(), 2800);
}

const ARAÑA_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><g stroke="#0b0f0e" stroke-width="3.2" stroke-linecap="round" fill="none"><path d="M24 30 L10 20 L4 26"/><path d="M24 34 L8 34 L2 42"/><path d="M25 38 L12 46 L10 56"/><path d="M27 41 L20 54 L22 62"/><path d="M40 30 L54 20 L60 26"/><path d="M40 34 L56 34 L62 42"/><path d="M39 38 L52 46 L54 56"/><path d="M37 41 L44 54 L42 62"/></g><ellipse cx="32" cy="38" rx="10" ry="12" fill="#0b0f0e"/><circle cx="32" cy="24" r="8" fill="#0b0f0e"/><path d="M27.5 23 q2.5 -3 4 1 q-2 2 -4 -1z" fill="#f4f7f6"/><path d="M36.5 23 q-2.5 -3 -4 1 q2 2 4 -1z" fill="#f4f7f6"/><path d="M32 31 v14 M27 36 h10 M28 41 h8" stroke="#ff3b5c" stroke-width="1.6"/></svg>`;

let arañaActiva = false;

/** Una araña baja del techo colgada de su hilo. Al tocarla, sube y deja un mensaje. */
export function soltarAraña(mensaje = 'Tu amigable vecino de Chapinero 🕸️') {
  if (typeof document === 'undefined' || arañaActiva) return;
  arañaActiva = true;
  const el = document.createElement('div');
  el.className = 'spider-drop';
  el.style.left = `${Math.round(window.innerWidth * (0.2 + Math.random() * 0.6))}px`;
  el.style.setProperty('--len', `${Math.round(window.innerHeight * (0.22 + Math.random() * 0.18))}px`);
  el.title = 'Hola 👋';
  el.innerHTML = `<div class="thread"></div>${ARAÑA_SVG}`;
  const subir = () => {
    const r = el.getBoundingClientRect();
    boom('¡THWIP!', r.left + r.width / 2, r.bottom - 10, true);
    toastSuelto(mensaje);
    el.classList.add('up');
    setTimeout(() => {
      el.remove();
      arañaActiva = false;
    }, 800);
  };
  el.addEventListener('click', subir, { once: true });
  document.body.appendChild(el);
  setTimeout(() => el.isConnected && subir(), 9000);
}

/** Aviso flotante que no depende de React (para los easter eggs). */
export function toastSuelto(texto: string) {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.className = 'caption';
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    top: '18%',
    transform: 'translateX(-50%) rotate(-2deg)',
    zIndex: '95',
    animation: 'pop-in .45s var(--ease-pop) both',
    maxWidth: '86vw',
    textAlign: 'center',
  } as CSSStyleDeclaration);
  el.textContent = texto;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .4s';
    el.style.opacity = '0';
  }, 2600);
  setTimeout(() => el.remove(), 3100);
}

/** Nombres del multiverso que reciben un saludo especial al entrar. */
const MULTIVERSO: Array<[RegExp, string]> = [
  [/^peter( parker)?$/i, 'Un gran poder conlleva una gran reserva, Peter.'],
  [/^miles( morales)?$/i, '¿Qué más, Miles? Brooklyn queda lejos: aquí es Chapinero.'],
  [/^gwen( stacy)?$/i, 'Gwen, la Tierra-65 no tiene Zona T. Bienvenida.'],
  [/^miguel( o'?hara)?$/i, "Miguel, esto no es un evento canónico… pero pásala bien."],
  [/^(spider-?man|spiderman|spidey|hombre araña)$/i, 'Tu amigable vecino de Chapinero ha llegado.'],
  [/^spidiverse$/i, 'Equipo Spidiverse: gracias por construir esto. 🕸️'],
  [/^(mary jane|mj)$/i, 'MJ, Peter dijo que te veía en la Terraza 85.'],
];

export function saludoMultiverso(nombre: string): string | null {
  const n = nombre.trim();
  for (const [re, msg] of MULTIVERSO) if (re.test(n)) return msg;
  return null;
}
