import { decor, type Trace } from "./decor";
import type { Pt } from "./geometry";
import {
  BOARD,
  NET_CLEARANCE,
  NET_W,
  PKG,
  fiducials,
  mountingHoles,
  parts,
  runs,
  type Part,
} from "./layout";

/*
 * One painter, many palettes. The same copper, pads and legend are drawn into
 * several canvases: the lit colour map, a roughness/metalness map, a bump map,
 * the KiCad-style editor view and the unmasked laminate.
 */

export type PaletteId = "mask" | "orm" | "height" | "editor" | "bare";

interface Palette {
  outside: string;
  base: string;
  pour: string | null;
  clearance: string;
  copper: string;
  via: string;
  viaHole: string;
  pad: string;
  thtPad: string;
  hole: string;
  maskRing: string | null;
  silk: string;
  groove: string | null;
  fiducialRing: string;
  courtyard: string | null;
  fab: string | null;
  edge: string | null;
  grid: string | null;
}

const orm = (rough: number, metal: number) =>
  `rgb(255,${Math.round(rough * 255)},${Math.round(metal * 255)})`;
const gray = (v: number) => {
  const c = Math.round(v * 255);
  return `rgb(${c},${c},${c})`;
};

export const PALETTES: Record<PaletteId, Palette> = {
  mask: {
    outside: "rgba(0,0,0,0)",
    base: "#03450a",
    pour: "#075a10",
    clearance: "#023a07",
    copper: "#075a10",
    via: "#0a6515",
    viaHole: "#023807",
    pad: "#d9ad4c",
    thtPad: "#d9ad4c",
    hole: "#141810",
    maskRing: "#3d6b24",
    silk: "#e9f1e4",
    groove: "#022e06",
    fiducialRing: "#8c8a4a",
    courtyard: null,
    fab: null,
    edge: null,
    grid: null,
  },
  orm: {
    outside: orm(1, 0),
    base: orm(0.46, 0),
    pour: orm(0.4, 0),
    clearance: orm(0.5, 0),
    copper: orm(0.4, 0),
    via: orm(0.36, 0),
    viaHole: orm(0.6, 0),
    pad: orm(0.24, 1),
    thtPad: orm(0.24, 1),
    hole: orm(1, 0),
    maskRing: orm(0.7, 0),
    silk: orm(0.82, 0),
    groove: orm(0.55, 0),
    fiducialRing: orm(0.8, 0),
    courtyard: null,
    fab: null,
    edge: null,
    grid: null,
  },
  height: {
    outside: gray(0),
    base: gray(0.35),
    pour: gray(0.55),
    clearance: gray(0.35),
    copper: gray(0.55),
    via: gray(0.62),
    viaHole: gray(0.42),
    pad: gray(0.5),
    thtPad: gray(0.5),
    hole: gray(0.1),
    maskRing: gray(0.3),
    silk: gray(0.7),
    groove: gray(0.3),
    fiducialRing: gray(0.3),
    courtyard: null,
    fab: null,
    edge: null,
    grid: null,
  },
  editor: {
    outside: "#001023",
    base: "#001023",
    pour: "#3a1a26",
    clearance: "#001023",
    copper: "#c83434",
    via: "#c9c9c9",
    viaHole: "#3b3f45",
    pad: "#c83434",
    thtPad: "#d9ad2c",
    hole: "#2a2e33",
    maskRing: null,
    silk: "#f2eda1",
    groove: null,
    fiducialRing: "#001023",
    courtyard: "#ff26e2",
    fab: "#afafaf",
    edge: "#d0d2cd",
    grid: "rgba(132,146,160,0.45)",
  },
  bare: {
    outside: "rgba(0,0,0,0)",
    base: "#b89f63",
    pour: "#c47b3c",
    clearance: "#b89f63",
    copper: "#c47b3c",
    via: "#c98a4b",
    viaHole: "#2a2014",
    pad: "#d9ad4c",
    thtPad: "#d9ad4c",
    hole: "#141810",
    maskRing: null,
    silk: "#eef3ea",
    groove: "#b89f63",
    fiducialRing: "#b89f63",
    courtyard: null,
    fab: null,
    edge: null,
    grid: null,
  },
};

type Side = "top" | "bottom";

interface Ctx {
  g: CanvasRenderingContext2D;
  s: number;
  side: Side;
}

/* bottom canvases are drawn in "flipped view" coordinates: y' = H - y */
function Y(c: Ctx, y: number) {
  return (c.side === "top" ? y : BOARD.h - y) * c.s;
}
function X(c: Ctx, x: number) {
  return x * c.s;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function strokePath(c: Ctx, pts: Pt[], w: number, color: string) {
  const { g } = c;
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(X(c, p[0]), Y(c, p[1])) : g.moveTo(X(c, p[0]), Y(c, p[1]))));
  g.strokeStyle = color;
  g.lineWidth = w * c.s;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.stroke();
}

function disc(c: Ctx, x: number, y: number, d: number, color: string) {
  const { g } = c;
  g.beginPath();
  g.arc(X(c, x), Y(c, y), (d / 2) * c.s, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
}

function padShape(c: Ctx, x: number, y: number, w: number, h: number, shape: string, grow: number, color: string) {
  const { g } = c;
  const ww = (w + grow * 2) * c.s;
  const hh = (h + grow * 2) * c.s;
  const cx = X(c, x);
  const cy = Y(c, y);
  g.fillStyle = color;
  if (shape === "round") {
    g.beginPath();
    g.ellipse(cx, cy, ww / 2, hh / 2, 0, 0, Math.PI * 2);
    g.fill();
  } else if (shape === "oval") {
    roundRect(g, cx - ww / 2, cy - hh / 2, ww, hh, Math.min(ww, hh) / 2);
    g.fill();
  } else {
    roundRect(g, cx - ww / 2, cy - hh / 2, ww, hh, Math.min(ww, hh) * 0.18);
    g.fill();
  }
}

function silkLine(c: Ctx, pts: Pt[], color: string, w = 0.15) {
  strokePath(c, pts, w, color);
}

function silkRect(c: Ctx, cx: number, cy: number, w: number, h: number, color: string, lw = 0.15) {
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  silkLine(
    c,
    [
      [x0, y0],
      [x0 + w, y0],
      [x0 + w, y0 + h],
      [x0, y0 + h],
      [x0, y0],
    ],
    color,
    lw,
  );
}

function silkCircle(c: Ctx, cx: number, cy: number, r: number, color: string, lw = 0.15) {
  const { g } = c;
  g.beginPath();
  g.arc(X(c, cx), Y(c, cy), r * c.s, 0, Math.PI * 2);
  g.strokeStyle = color;
  g.lineWidth = lw * c.s;
  g.stroke();
}

/** component outlines on the legend layer */
function drawOutline(c: Ctx, p: Part, color: string) {
  switch (p.kind) {
    case "chip": {
      const g = PKG[p.pkg!];
      const hx = g.bx / 2 + 0.2;
      const hy = g.by / 2 + 0.2;
      const k = Math.min(2, g.bx * 0.18);
      if (g.kind === "soic") {
        silkLine(c, [[p.x - hx + 0.8, p.y - hy], [p.x + hx - 0.8, p.y - hy]], color);
        silkLine(c, [[p.x - hx + 0.8, p.y + hy], [p.x + hx - 0.8, p.y + hy]], color);
        disc(c, p.x - g.span / 2 - 0.2, p.y - hy - 0.4, 0.45, color);
        break;
      }
      const o = g.kind === "qfp" ? g.span / 2 + 0.35 : hx + 0.1;
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        silkLine(
          c,
          [
            [p.x + sx * o, p.y + sy * (o - k)],
            [p.x + sx * o, p.y + sy * o],
            [p.x + sx * (o - k), p.y + sy * o],
          ],
          color,
        );
      }
      disc(c, p.x - o - 0.2, p.y - o - 0.2, 0.5, color);
      break;
    }
    case "capacitor": {
      silkCircle(c, p.x, p.y, 4.1, color);
      const plus = p.padIn![0] + 2.9;
      silkLine(c, [[plus - 0.6, p.y - 3.4], [plus + 0.6, p.y - 3.4]], color);
      silkLine(c, [[plus, p.y - 4], [plus, p.y - 2.8]], color);
      break;
    }
    case "crystal": {
      const { g } = c;
      const w = 11.2 * c.s;
      const h = 4.6 * c.s;
      roundRect(g, X(c, p.x) - w / 2, Y(c, p.y) - h / 2, w, h, h / 2);
      g.strokeStyle = color;
      g.lineWidth = 0.15 * c.s;
      g.stroke();
      break;
    }
    case "resistor":
      silkRect(c, p.x, p.y, 6.9, 2.9, color);
      silkLine(c, [[p.x - 3.45, p.y], [p.padIn![0] + 1, p.y]], color);
      silkLine(c, [[p.x + 3.45, p.y], [p.padOut![0] - 1, p.y]], color);
      break;
    case "led": {
      const { g } = c;
      g.beginPath();
      g.arc(X(c, p.x), Y(c, p.y), 1.95 * c.s, -Math.PI * 0.35, Math.PI * 0.35, true);
      g.strokeStyle = color;
      g.lineWidth = 0.15 * c.s;
      g.stroke();
      break;
    }
    case "terminal":
      silkRect(c, p.x, p.y, 20.6, 8.4, color);
      silkLine(c, [[p.x - 10.3, p.y + 2.6], [p.x + 10.3, p.y + 2.6]], color);
      break;
    case "switch":
      silkRect(c, p.x, p.y, 6.4, 6.4, color);
      silkCircle(c, p.x, p.y, 1.9, color);
      break;
    case "usbc":
      silkLine(c, [[7.1, p.y - 5.1], [0.6, p.y - 5.1]], color);
      silkLine(c, [[7.1, p.y + 5.1], [0.6, p.y + 5.1]], color);
      break;
  }
}

function courtyard(c: Ctx, p: Part, color: string) {
  const [w, h] = p.court;
  silkRect(c, p.x, p.y, w, h, color, 0.08);
}

export interface PaintOptions {
  palette: PaletteId;
  side: Side;
  /** pixels per millimetre */
  scale: number;
  logo?: HTMLImageElement | null;
}

export function paintBoard(canvas: HTMLCanvasElement, o: PaintOptions) {
  const pal = PALETTES[o.palette];
  canvas.width = Math.round(BOARD.w * o.scale);
  canvas.height = Math.round(BOARD.h * o.scale);
  const g = canvas.getContext("2d")!;
  const c: Ctx = { g, s: o.scale, side: o.side };
  const top = o.side === "top";

  g.fillStyle = pal.outside;
  g.fillRect(0, 0, canvas.width, canvas.height);

  // laminate + copper pour, with an edge keep-out
  g.fillStyle = pal.base;
  g.fillRect(0, 0, canvas.width, canvas.height);
  if (pal.pour) {
    g.fillStyle = pal.pour;
    const k = 0.9 * c.s;
    roundRect(g, k, k, canvas.width - 2 * k, canvas.height - 2 * k, (BOARD.radius - 0.9) * c.s);
    g.fill();
  }

  if (pal.grid) {
    g.fillStyle = pal.grid;
    const step = 2.54;
    const r = Math.max(1, 0.12 * c.s);
    for (let x = step; x < BOARD.w; x += step)
      for (let y = step; y < BOARD.h; y += step) g.fillRect(x * c.s - r / 2, y * c.s - r / 2, r, r);
  }

  const traces: Trace[] = top ? decor.top : decor.bottom;
  const tht = parts.flatMap((p) => p.pads.filter((pd) => pd.drill));
  const smd = top ? parts.flatMap((p) => p.pads.filter((pd) => !pd.drill)) : [];
  const small = top ? decor.smallPads : [];

  /* 1 · clearances cut into the pour */
  if (pal.pour) {
    const cl = 0.3;
    traces.forEach((t) => strokePath(c, t.pts, t.w + cl * 2, pal.clearance));
    decor.vias.forEach((v) => disc(c, v.x, v.y, v.d + cl * 2, pal.clearance));
    tht.forEach((pd) => padShape(c, pd.x, pd.y, pd.w, pd.h, pd.shape, cl, pal.clearance));
    smd.forEach((pd) => padShape(c, pd.x, pd.y, pd.w, pd.h, pd.shape, cl, pal.clearance));
    small.forEach((pd) => padShape(c, pd.x, pd.y, pd.w, pd.h, "rect", cl, pal.clearance));
    mountingHoles.forEach(([x, y]) => disc(c, x, y, 7.4, pal.clearance));
    fiducials.forEach(([x, y]) => top && disc(c, x, y, 3.4, pal.clearance));
    if (top) runs.forEach((r) => strokePath(c, r.pts, NET_W + NET_CLEARANCE * 2, pal.groove ?? pal.clearance));
  } else if (top && pal.groove) {
    runs.forEach((r) => strokePath(c, r.pts, NET_W + NET_CLEARANCE * 2, pal.groove!));
  }

  /* 2 · copper under the mask */
  traces.forEach((t) => strokePath(c, t.pts, t.w, pal.copper));

  /* 3 · vias: tented, a ring and a dimple */
  decor.vias.forEach((v) => {
    disc(c, v.x, v.y, v.d, pal.via);
    disc(c, v.x, v.y, v.d * 0.45, pal.viaHole);
  });

  /* 4 · exposed pads */
  const ring = pal.maskRing;
  smd.forEach((pd) => {
    if (ring) padShape(c, pd.x, pd.y, pd.w, pd.h, pd.shape, 0.06, ring);
    padShape(c, pd.x, pd.y, pd.w, pd.h, pd.shape, 0, pal.pad);
  });
  small.forEach((pd) => {
    if (ring) padShape(c, pd.x, pd.y, pd.w, pd.h, "rect", 0.05, ring);
    padShape(c, pd.x, pd.y, pd.w, pd.h, "rect", 0, pal.pad);
  });
  tht.forEach((pd) => {
    if (ring) padShape(c, pd.x, pd.y, pd.w, pd.h, pd.shape, 0.06, ring);
    padShape(c, pd.x, pd.y, pd.w, pd.h, pd.shape, 0, pal.thtPad);
    disc(c, pd.x, pd.y, pd.drill!, pal.hole);
  });
  mountingHoles.forEach(([x, y]) => {
    if (ring) disc(c, x, y, 6.3, ring);
    disc(c, x, y, 6.2, pal.thtPad);
    disc(c, x, y, 3.2, pal.hole);
  });
  if (top)
    fiducials.forEach(([x, y]) => {
      disc(c, x, y, 3, pal.fiducialRing);
      disc(c, x, y, 1, pal.pad);
    });

  /* 5 · legend and fabrication layers */
  if (top) {
    parts.forEach((p) => drawOutline(c, p, pal.silk));
    if (pal.courtyard) parts.forEach((p) => courtyard(c, p, pal.courtyard!));
    if (pal.fab)
      parts
        .filter((p) => p.kind === "chip")
        .forEach((p) => {
          const g2 = PKG[p.pkg!];
          silkRect(c, p.x, p.y, g2.bx, g2.by, pal.fab!, 0.1);
        });
  }

  if (pal.edge) {
    g.strokeStyle = pal.edge;
    g.lineWidth = 0.25 * c.s;
    roundRect(g, 0.15 * c.s, 0.15 * c.s, canvas.width - 0.3 * c.s, canvas.height - 0.3 * c.s, BOARD.radius * c.s);
    g.stroke();
  }

  if (o.logo) paintLogo(c, o.logo, pal.silk);
}

/* The DKNS mark, reduced to a one-colour legend print. */
function paintLogo(c: Ctx, img: HTMLImageElement, color: string) {
  const size = c.side === "top" ? 19 : 44;
  const x = c.side === "top" ? 14 : 22;
  const y = c.side === "top" ? 11 : 96;
  const px = Math.round(size * c.s);
  const tmp = document.createElement("canvas");
  tmp.width = px;
  tmp.height = px;
  const t = tmp.getContext("2d")!;
  t.drawImage(img, 0, 0, px, px);
  t.globalCompositeOperation = "source-in";
  t.fillStyle = color;
  t.fillRect(0, 0, px, px);
  c.g.drawImage(tmp, x * c.s, y * c.s);
}
