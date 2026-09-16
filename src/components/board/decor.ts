import { mulberry32, type Pt } from "./geometry";
import {
  BOARD,
  PKG,
  ROWS,
  SW1_Y,
  chipReach,
  mountingHoles,
  partByRef,
  parts,
  passives,
  railAbove,
  railBelow,
  type Part,
  type PkgGeom,
} from "./layout";

export interface Trace {
  pts: Pt[];
  w: number;
}

export interface Via {
  x: number;
  y: number;
  d: number;
}

export interface Decor {
  top: Trace[];
  bottom: Trace[];
  vias: Via[];
  /** small 0603 land patterns, top side only */
  smallPads: { x: number; y: number; w: number; h: number }[];
}

const SIG = 0.25;
const PWR = 0.8;

function leadOffsets(g: PkgGeom) {
  const n = g.kind === "soic" ? g.pins / 2 : g.pins / 4;
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * g.pitch);
}

/** vertical then 45° into (xt, yt); works up or down */
function drop(xr: number, yr: number, xt: number, yt: number): Pt[] {
  const dx = Math.abs(xt - xr);
  const sy = Math.sign(yt - yr) || 1;
  return [
    [xr, yr],
    [xr, yt - sy * dx],
    [xt, yt],
  ];
}

export function buildDecor(): Decor {
  const rnd = mulberry32(20260916);
  const top: Trace[] = [];
  const bottom: Trace[] = [];
  const vias: Via[] = [];
  const smallPads: Decor["smallPads"] = [];
  const via = (x: number, y: number, d = 0.6) => vias.push({ x, y, d });

  const chips = parts.filter((p) => p.kind === "chip");
  const rowIndex = (p: Part) => ROWS.chips.indexOf(p.row!);

  /* ---- fanout on the sides that face away from the net: north and south */
  for (const c of chips) {
    const g = PKG[c.pkg!];
    if (g.kind === "soic") continue;
    const offs = leadOffsets(g);
    for (const side of [-1, 1]) {
      if (g.kind === "bga") {
        offs.forEach((o, i) => {
          const x = c.x + o;
          const yBall = c.y + side * ((g.by / 2) - 0.9);
          const yVia = c.y + side * (g.by / 2 + 1.3 + (i % 2) * 1.1);
          top.push({ pts: [[x, yBall], [x, yVia]], w: 0.2 });
          via(x, yVia, 0.5);
          if (i % 3 === 0) {
            const len = 3 + (i / offs.length) * 5;
            const dir = o < 0 ? -1 : 1;
            const y2 = yVia + side * len;
            bottom.push({ pts: [[x, yVia], [x, y2], [x + dir * 4, y2 + side * 4], [x + dir * 12, y2 + side * 4]], w: 0.2 });
            via(x + dir * 12, y2 + side * 4, 0.5);
          }
        });
        continue;
      }
      const reach = chipReach(g);
      offs.forEach((o, i) => {
        if (i % 2 === 1) return;
        const x = c.x + o;
        const y0 = c.y + side * reach;
        const len = (i / 2) % 2 === 0 ? 1.4 : 2.7;
        const y1 = y0 + side * len;
        top.push({ pts: [[x, y0], [x, y1]], w: SIG });
        via(x, y1);
        if ((i / 2) % 3 === 0) {
          const k = i / offs.length;
          const dir = o < 0 ? -1 : 1;
          const y2 = y1 + side * (3 + Math.abs(k - 0.5) * 14);
          const run = 6 + rnd() * 10;
          bottom.push({ pts: [[x, y1], [x, y2], [x + dir * 3, y2 + side * 3], [x + dir * run, y2 + side * 3]], w: SIG });
          via(x + dir * run, y2 + side * 3);
        }
      });
    }
  }

  /* ---- parallel buses between facing sides of neighbouring ICs */
  const rows = ROWS.chips.map((row) => chips.filter((c) => c.row === row).sort((a, b) => a.x - b.x));
  for (const rowChips of rows) {
    for (let k = 0; k < rowChips.length - 1; k++) {
      const a = rowChips[k];
      const b = rowChips[k + 1];
      const ga = PKG[a.pkg!];
      const gb = PKG[b.pkg!];
      if (ga.kind === "bga" || gb.kind === "bga") continue;
      const row = a.row!;
      const xa = a.x + chipReach(ga) - 0.2;
      const xb = b.x - chipReach(gb) + 0.2;
      const step = (g: PkgGeom) => (g.pitch < 1 ? 2 : 1);
      const ys = (p: Part, g: PkgGeom, sign: number) =>
        leadOffsets(g)
          .map((o) => p.y + o)
          .filter((_, i) => i % step(g) === 0)
          .filter((y) => sign * (y - row) > 1.6)
          .sort((u, v) => Math.abs(u - row) - Math.abs(v - row));
      for (const sign of [-1, 1]) {
        const ya = ys(a, ga, sign);
        const yb = ys(b, gb, sign);
        const n = Math.min(ya.length, yb.length, 7);
        const jog = xa + 3.5;
        for (let i = 0; i < n; i++) {
          const dy = Math.abs(yb[i] - ya[i]);
          if (jog + dy > xb - 1) continue;
          top.push({
            pts: [
              [xa, ya[i]],
              [jog, ya[i]],
              [jog + dy, yb[i]],
              [xb, yb[i]],
            ],
            w: SIG,
          });
        }
      }
    }
  }

  /* ---- escape the outer sides of the first and last IC in a row */
  const escapes: [Part, 1 | -1][] = rows.flatMap((r) =>
    r.length ? ([[r[0], -1], [r[r.length - 1], 1]] as [Part, 1 | -1][]) : [],
  );
  for (const [p, dir] of escapes) {
    const g = PKG[p.pkg!];
    if (g.kind === "bga") continue;
    const row = p.row!;
    const x0 = p.x + dir * (chipReach(g) - 0.2);
    leadOffsets(g).forEach((o, i) => {
      const y = p.y + o;
      if (i % 2 === 1 || Math.abs(y - row) < 1.6) return;
      const s = Math.sign(y - row);
      const x1 = x0 + dir * 1.2;
      const k = 1.6 + (Math.abs(y - row) % 2 < 1 ? 0 : 1.3);
      top.push({ pts: [[x0, y], [x1, y], [x1 + dir * k, y + s * k]], w: SIG });
      via(x1 + dir * k, y + s * k);
    });
  }

  /* ---- decoupling: 0603 land patterns, a via on one side, a rail on the other */
  const rails = new Set<number>();
  for (const ps of passives) {
    const hw = 0.8;
    const pa: Pt = ps.vertical ? [ps.x, ps.y - hw] : [ps.x - hw, ps.y];
    const pb: Pt = ps.vertical ? [ps.x, ps.y + hw] : [ps.x + hw, ps.y];
    for (const q of [pa, pb]) smallPads.push({ x: q[0], y: q[1], w: ps.vertical ? 0.9 : 0.8, h: ps.vertical ? 0.8 : 0.9 });
    const owner = partByRef.get(ps.owner)!;
    if (owner.kind === "crystal") {
      top.push({ pts: [[ps.x, owner.y + 1.2], [pa[0], pa[1] - 0.3]], w: 0.3 });
      top.push({ pts: [[pb[0], pb[1] + 0.3], [ps.x, pb[1] + 2.4]], w: 0.3 });
      via(ps.x, pb[1] + 2.4);
      continue;
    }
    const ri = rowIndex(owner);
    const north = ps.y < owner.y;
    // ground side
    if (ps.vertical) {
      top.push({ pts: [[pa[0], pa[1] - 0.2], [pa[0], pa[1] - 1.6]], w: 0.3 });
      via(pa[0], pa[1] - 1.6);
    } else {
      top.push({ pts: [[pb[0] + 0.2, pb[1]], [pb[0] + 1.6, pb[1]]], w: 0.3 });
      via(pb[0] + 1.6, pb[1]);
    }
    // supply side
    if (north) {
      const rail = railAbove(ri);
      rails.add(rail);
      top.push({ pts: drop(pa[0] - 3.5, rail, pa[0], pa[1] - 0.3), w: 0.4 });
    } else if (ps.vertical) {
      const rail = railBelow(ri);
      rails.add(rail);
      top.push({ pts: [[pb[0], pb[1] + 0.3], [pb[0], rail]], w: 0.4 });
    }
  }

  const railTop = railAbove(0);
  rails.delete(railTop);
  top.push({ pts: [[24, 64], [34, railTop], [281, railTop]], w: PWR });
  via(24, 64, 0.9);
  via(281, railTop, 0.9);
  for (const y of rails) {
    top.push({ pts: [[22, y], [272, y]], w: PWR });
    via(22, y, 0.9);
    via(272, y, 0.9);
  }

  /* ---- usb-c: shield and cc lines, power led */
  const j1 = partByRef.get("J1")!;
  top.push({ pts: [[9.2, j1.y - 2.2], [11, j1.y - 2.2], [14, j1.y - 5.2]], w: 0.3 });
  via(14, j1.y - 5.2);
  top.push({ pts: [[9.2, j1.y + 2.2], [12, j1.y + 2.2], [16.73, j1.y + 6.93], [16.73, 59]], w: 0.4 });
  top.push({ pts: [[20.2, 60], [24, 60], [24, 64]], w: 0.4 });

  /* ---- reset switch and the three spare terminal pins */
  top.push({ pts: [[17.25, SW1_Y + 2.25], [19.8, SW1_Y + 4.8], [19.8, SW1_Y + 10]], w: 0.3 });
  via(19.8, SW1_Y + 10);
  top.push({ pts: [[10.75, SW1_Y - 2.25], [10.75, SW1_Y - 7]], w: 0.3 });
  via(10.75, SW1_Y - 7);
  const j2 = partByRef.get("J2")!;
  j2.pads.slice(0, 3).forEach((pd, i) => {
    top.push({ pts: [[pd.x, pd.y - 1.3], [pd.x, pd.y - 5 - i * 1.4]], w: 0.4 });
    via(pd.x, pd.y - 5 - i * 1.4, 0.7);
  });

  /* ---- stitching vias along the routed edge */
  const keep = (x: number, y: number) =>
    mountingHoles.every(([mx, my]) => Math.hypot(mx - x, my - y) > 6) &&
    !(x < 12 && Math.abs(y - j1.y) < 9);
  for (let x = 10; x <= BOARD.w - 10; x += 5) {
    if (keep(x, 2.6)) via(x, 2.6, 0.5);
    if (keep(x, BOARD.h - 2.6)) via(x, BOARD.h - 2.6, 0.5);
  }
  for (let y = 10; y <= BOARD.h - 10; y += 5) {
    if (keep(2.6, y)) via(2.6, y, 0.5);
    if (keep(BOARD.w - 2.6, y)) via(BOARD.w - 2.6, y, 0.5);
  }

  return { top, bottom, vias, smallPads };
}

export const decor = buildDecor();
