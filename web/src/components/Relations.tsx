import { useLook } from "@/lib/theme";
import { useEffect, useState } from "react";
import type { StackItem } from "basic-land-engine";
import { useGame } from "@/lib/store";
import { STEP_MS, stackLines } from "@/lib/relations";
import type { Line, LineKind } from "@/lib/relations";
import { getSettings } from "@/lib/session";
import { useKey } from "@/lib/shortcuts";

const COLOR: Record<LineKind, string> = {
  counter: "#a855f7",
  destroy: "#ef4444",
  discard: "#f59e0b",
  return: "#22c55e",
  copy: "#38bdf8",
  draw: "#eab308",
};

interface Geo {
  line: Line;
  a: Rect;
  b: Rect;
}
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const find = (refs: string[]): Rect | null => {
  for (const r of refs) {
    const el = document.querySelector(`[data-ref="${CSS.escape(r)}"]`);
    const b = el?.getBoundingClientRect();
    if (b && b.width > 0) return { x: b.left, y: b.top, w: b.width, h: b.height };
  }
  return null;
};
const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
/** The eight points a line may attach to: the four corners and the middle of each side, just outside the card. */
function anchors(r: Rect, pad = 3): Pt[] {
  const l = r.x - pad;
  const rt = r.x + r.w + pad;
  const t = r.y - pad;
  const bt = r.y + r.h + pad;
  const mx = r.x + r.w / 2;
  const my = r.y + r.h / 2;
  return [
    { x: l, y: t }, { x: mx, y: t }, { x: rt, y: t },
    { x: l, y: my }, { x: rt, y: my },
    { x: l, y: bt }, { x: mx, y: bt }, { x: rt, y: bt },
  ];
}
/** The closest pair of anchors, one on each card. */
function connect(a: Rect, b: Rect): [Pt, Pt] {
  let best: [Pt, Pt] = [center(a), center(b)];
  let min = Infinity;
  for (const p of anchors(a)) for (const q of anchors(b)) {
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < min) (min = d), (best = [p, q]);
  }
  return best;
}

const PX = 2; // size of one "pixel" of the lines

type Pt = { x: number; y: number };
const cell = (p: Pt): Pt => ({ x: Math.round(p.x / PX) * PX, y: Math.floor(p.y / PX) * PX });

/** The curve snapped to the pixel grid, in drawing order. */
function pixelCurve(p1: Pt, c: Pt, p2: Pt): Pt[] {
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const n = Math.max(2, Math.ceil(len / 2));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const k = cell({ x: (1 - t) ** 2 * p1.x + 2 * (1 - t) * t * c.x + t * t * p2.x, y: (1 - t) ** 2 * p1.y + 2 * (1 - t) * t * c.y + t * t * p2.y });
    const last = out[out.length - 1];
    if (!last || last.x !== k.x || last.y !== k.y) out.push(k);
  }
  return out;
}

/** A blocky arrow head at `tip`, pointing along (dx, dy). */
function pixelHead(tip: Pt, dx: number, dy: number): Pt[] {
  const l = Math.hypot(dx, dy) || 1;
  const d = { x: dx / l, y: dy / l };
  const n = { x: -d.y, y: d.x };
  const B = { x: tip.x - d.x * 14, y: tip.y - d.y * 14 };
  const A = { x: B.x + n.x * 7, y: B.y + n.y * 7 };
  const C = { x: B.x - n.x * 7, y: B.y - n.y * 7 };
  const side = (p: Pt, a: Pt, b: Pt) => (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
  const out: Pt[] = [];
  const x0 = Math.min(tip.x, A.x, C.x);
  const x1 = Math.max(tip.x, A.x, C.x);
  const y0 = Math.min(tip.y, A.y, C.y);
  const y1 = Math.max(tip.y, A.y, C.y);
  for (let x = Math.floor(x0 / PX) * PX; x <= x1; x += PX) {
    for (let y = Math.floor(y0 / PX) * PX; y <= y1; y += PX) {
      const p = { x: x + PX / 2, y: y + PX / 2 };
      const d1 = side(p, tip, A);
      const d2 = side(p, A, C);
      const d3 = side(p, C, tip);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) out.push({ x, y });
    }
  }
  return out;
}

/** SVG overlay: one blocky, labelled arrow per line on a pixel grid, re-measured every frame so it follows layout changes. The colour runs along the line in steps. */
function Lines({ lines, animate, ring }: { lines: Line[]; animate: boolean; ring: boolean }) {
  const [geo, setGeo] = useState<Geo[]>([]);
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const next: Geo[] = [];
      for (const line of lines) {
        const a = find(line.from);
        const b = find(line.to);
        if (a && b) next.push({ line, a, b });
      }
      setGeo((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [lines]);
  useEffect(() => {
    if (!animate) return;
    const id = setInterval(() => setPhase((p) => (p + 1) % 16), 70);
    return () => clearInterval(id);
  }, [animate]);
  const look = useLook();
  if (geo.length === 0) return null;
  const pixel = look === "pixel";

  return (
    <svg aria-hidden="true" shapeRendering={pixel ? "crispEdges" : "auto"} className="pointer-events-none fixed inset-0 z-30 h-full w-full overflow-visible">
      {geo.map(({ line, a, b }, i) => {
        const [p1, p2] = connect(a, b);
        const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
        const c = { x: (p1.x + p2.x) / 2 - (p2.y - p1.y) * 0.15, y: (p1.y + p2.y) / 2 + (p2.x - p1.x) * 0.15 };
        const body = pixelCurve(p1, c, p2);
        const prev = body[Math.max(0, body.length - 8)]!;
        const head = pixelHead({ x: p2.x, y: p2.y }, p2.x - prev.x, p2.y - prev.y);
        const col = COLOR[line.kind];
        const mid = cell({ x: 0.25 * p1.x + 0.5 * c.x + 0.25 * p2.x, y: 0.25 * p1.y + 0.5 * c.y + 0.25 * p2.y });
        const w = line.label.length * 8 + 10;
        if (!pixel) {
          const end = body[body.length - 1] ?? p2;
          const dx = p2.x - prev.x;
          const dy = p2.y - prev.y;
          const l = Math.hypot(dx, dy) || 1;
          const d = { x: dx / l, y: dy / l };
          const base = { x: end.x - d.x * 14, y: end.y - d.y * 14 };
          const pts = `${end.x},${end.y} ${base.x - d.y * 7},${base.y + d.x * 7} ${base.x + d.y * 7},${base.y - d.x * 7}`;
          const path = `M${p1.x},${p1.y} Q${c.x},${c.y} ${base.x},${base.y}`;
          return (
            <g key={i} className="rel-in">
              {ring && <rect x={b.x - 5} y={b.y - 5} width={b.w + 10} height={b.h + 10} rx={8} fill="none" stroke={col} strokeWidth={2} strokeDasharray="6 4" className="rel-ring" />}
              <path d={path} fill="none" stroke="#000" strokeOpacity={0.5} strokeWidth={6} strokeLinecap="round" />
              <path d={path} fill="none" stroke={col} strokeWidth={3} strokeLinecap="round" strokeDasharray={animate ? "10 6" : undefined} strokeDashoffset={animate ? -phase * 2 : undefined} />
              <polygon points={pts} fill={col} stroke="#000" strokeOpacity={0.5} strokeWidth={1.5} strokeLinejoin="round" />
              <rect x={mid.x - w / 2} y={mid.y - 20} width={w} height={18} rx={9} fill="#000" fillOpacity={0.8} stroke={col} strokeWidth={1.5} />
              <text x={mid.x} y={mid.y - 7} textAnchor="middle" fontSize={13} fill="#fff" style={{ fontFamily: "var(--font-sans)" }}>
                {line.label}
              </text>
            </g>
          );
        }
        return (
          <g key={i} className="rel-in">
            {ring && <rect x={b.x - 5} y={b.y - 5} width={b.w + 10} height={b.h + 10} fill="none" stroke={col} strokeWidth={PX} strokeDasharray={`${PX * 3} ${PX * 2}`} className="rel-ring" />}
            {[...body, ...head].map((k, n) => <rect key={`o${n}`} x={k.x - 1} y={k.y - 1} width={PX + 2} height={PX + 2} fill="#000" />)}
            {body.map((k, n) => <rect key={n} x={k.x} y={k.y} width={PX} height={PX} fill={col} opacity={animate && (n + phase) % 16 < 5 ? 0.5 : 1} />)}
            {head.map((k, n) => <rect key={`h${n}`} x={k.x} y={k.y} width={PX} height={PX} fill={col} />)}
            <rect x={mid.x - w / 2} y={mid.y - 20} width={w} height={18} fill="#000" stroke={col} strokeWidth={2} />
            <text x={mid.x} y={mid.y - 7} textAnchor="middle" fontSize={13} fill="#fff" style={{ fontFamily: "var(--font-sans)" }} shapeRendering="auto">
              {line.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Connects interacting cards with animated lines: while items sit on the stack their relations stay drawn; while a stack resolves the board is held and each step's line is shown in turn. Space/Enter/Esc skips. */
export function Relations({ stack }: { stack: StackItem[] }) {
  const hold = useGame((s) => s.hold);
  const [i, setI] = useState(0);
  const total = hold?.steps.length ?? 0;
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    window.addEventListener("blg:settings", f);
    return () => window.removeEventListener("blg:settings", f);
  }, []);
  const anim = getSettings().anim;
  const skip = () => useGame.setState({ hold: null });

  useEffect(() => {
    if (!hold) return setI(0);
    if (i >= total) return skip();
    const id = setTimeout(() => setI(i + 1), STEP_MS[anim === "off" ? "normal" : anim]);
    return () => clearTimeout(id);
  }, [hold, i, total]);
  useKey((e) => (hold && (e.key === " " || e.key === "Escape" || e.key === "Enter") ? (skip(), true) : false));

  if (hold) {
    const step = hold.steps[Math.min(i, total - 1)]!;
    return (
      <>
        <Lines key={i} lines={step.lines} animate ring />
        <p role="status" className="sr-only">{step.lines.map((l) => l.label).join(", ")}</p>
      </>
    );
  }
  return <Lines lines={stackLines(stack)} animate={anim !== "off"} ring={false} />;
}
