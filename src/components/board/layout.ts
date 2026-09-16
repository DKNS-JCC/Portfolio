import {
  certs,
  contactPins,
  jobs,
  projects,
  skillGroups,
  studies,
  type LedColor,
  type Package,
} from "@/data/portfolio";
import { chamfer, dist, lerp, polylineLength, type Pt } from "./geometry";

/*
 * Board units are millimetres, KiCad style: x to the right, y down, origin top-left.
 * Everything below is derived from the content lists, so adding a project,
 * a job or a skill re-flows parts, rows, the net and the scroll timeline.
 */

export const NET_W = 0.9;
export const NET_CLEARANCE = 0.5;
export const NOW_YEAR = 2026;

export type PartKind =
  | "usbc"
  | "led"
  | "switch"
  | "crystal"
  | "resistor"
  | "capacitor"
  | "chip"
  | "terminal";

export type SectionId = "inicio" | "formacion" | "experiencia" | "proyectos" | "stack" | "contacto";
/** inicio · formacion · experiencia · proyectos-N · stack · contacto */
export type ZoneId = string;

export interface PkgGeom {
  kind: "qfp" | "qfn" | "bga" | "soic";
  /** body along x / along y */
  bx: number;
  by: number;
  pins: number;
  pitch: number;
  /** lead tip to lead tip */
  span: number;
  h: number;
  footprint: string;
}

export const PKG: Record<Package, PkgGeom> = {
  "LQFP-144": { kind: "qfp", bx: 20, by: 20, pins: 144, pitch: 0.5, span: 22, h: 1.4, footprint: "Package_QFP:LQFP-144_20x20mm_P0.5mm" },
  "LQFP-100": { kind: "qfp", bx: 14, by: 14, pins: 100, pitch: 0.5, span: 16, h: 1.4, footprint: "Package_QFP:LQFP-100_14x14mm_P0.5mm" },
  "LQFP-64": { kind: "qfp", bx: 10, by: 10, pins: 64, pitch: 0.5, span: 12, h: 1.4, footprint: "Package_QFP:LQFP-64_10x10mm_P0.5mm" },
  "LQFP-48": { kind: "qfp", bx: 7, by: 7, pins: 48, pitch: 0.5, span: 9, h: 1.4, footprint: "Package_QFP:LQFP-48_7x7mm_P0.5mm" },
  "QFN-56": { kind: "qfn", bx: 7, by: 7, pins: 56, pitch: 0.4, span: 7, h: 0.9, footprint: "Package_DFN_QFN:QFN-56-1EP_7x7mm_P0.4mm" },
  "BGA-100": { kind: "bga", bx: 10, by: 10, pins: 100, pitch: 0.8, span: 10, h: 1.25, footprint: "Package_BGA:BGA-100_10x10mm_Layout10x10_P0.8mm" },
  "SOIC-16": { kind: "soic", bx: 3.9, by: 9.9, pins: 16, pitch: 1.27, span: 6, h: 1.55, footprint: "Package_SO:SOIC-16_3.9x9.9mm_P1.27mm" },
  "SOIC-8": { kind: "soic", bx: 3.9, by: 4.9, pins: 8, pitch: 1.27, span: 6, h: 1.55, footprint: "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm" },
};

export const DEFAULT_PACKAGE: Package = "LQFP-64";

export function packageOf(index: number): Package {
  return projects[index].package ?? DEFAULT_PACKAGE;
}

export interface Pad {
  x: number;
  y: number;
  w: number;
  h: number;
  shape: "rect" | "round" | "oval";
  /** plated through hole drill diameter */
  drill?: number;
}

export interface Part {
  ref: string;
  kind: PartKind;
  x: number;
  y: number;
  zone: ZoneId;
  section: SectionId;
  value: string;
  footprint: string;
  /** courtyard size along x / along y */
  court: [number, number];
  height: number;
  pads: Pad[];
  padIn?: Pt;
  padOut?: Pt;
  /** distance along the net at which the part starts / finishes landing */
  dIn: number;
  dOut: number;
  /** index into the matching content array */
  index: number;
  pkg?: Package;
  color?: LedColor;
  years?: number;
  /** y of the net row the part sits on */
  row?: number;
  /** on-route parts that are clickable */
  interactive: boolean;
  /** skill LEDs: label above or below the net */
  labelSide?: -1 | 1;
}

export interface Passive {
  x: number;
  y: number;
  vertical: boolean;
  type: "c" | "r";
  /** ref of the part it belongs to; lands together with it */
  owner: string;
}

/* ------------------------------------------------------------- chip rows */

const CHIP_GAP_MIN = 24;
const CHIP_GAP_MAX = 36;

function courtOf(g: PkgGeom): [number, number] {
  return g.kind === "soic" ? [g.span + 1, g.by + 1] : [g.span + 1.2, Math.max(g.span, g.by) + 1.2];
}

/** greedy fill of a horizontal segment, then even spacing inside it */
function packRow(from: number, xmin: number, xmax: number) {
  const widths: number[] = [];
  let used = 0;
  for (let i = from; i < projects.length; i++) {
    const w = courtOf(PKG[packageOf(i)])[0];
    const next = used + w + (widths.length ? CHIP_GAP_MIN : 0);
    if (widths.length && next > xmax - xmin) break;
    widths.push(w);
    used = next;
  }
  const sum = widths.reduce((a, b) => a + b, 0);
  const gap = widths.length > 1 ? Math.min(CHIP_GAP_MAX, (xmax - xmin - sum) / (widths.length - 1)) : 0;
  const total = sum + gap * (widths.length - 1);
  let x = xmin + (xmax - xmin - total) / 2;
  return widths.map((w) => {
    const c = x + w / 2;
    x += w + gap;
    return c;
  });
}

/* -------------------------------------------------------------- rows (y) */

const ROW1 = 46;
const ROW2 = 112;

// row 1: crystals then resistors, eastward
const row1Items = [
  ...studies.map(() => ({ kind: "crystal" as const, w: 12 })),
  ...certs.map(() => ({ kind: "resistor" as const, w: 12.4 })),
];
const row1X: number[] = [];
{
  const xmin = 146;
  const xmax = 278;
  const sum = row1Items.reduce((a, b) => a + b.w, 0);
  const gap = row1Items.length > 1 ? Math.min(16, (xmax - xmin - sum) / (row1Items.length - 1)) : 0;
  let x = xmin + 6;
  for (const it of row1Items) {
    row1X.push(x + it.w / 2);
    x += it.w + gap;
  }
}

// row 2: capacitors from the east edge, then the first chips westward
const CAP_PITCH = Math.max(12, Math.min(20, 90 / Math.max(1, jobs.length)));
const capX = jobs.map((_, i) => 268 - i * CAP_PITCH);
const capsWest = (capX[capX.length - 1] ?? 268) - 4.3;

interface ChipSlot {
  x: number;
  row: number;
  rowIndex: number;
  dir: 1 | -1;
}
const chipSlots: ChipSlot[] = [];
const chipRows: number[] = [];
{
  const west = packRow(0, 22, capsWest - 22);
  west.sort((a, b) => b - a);
  chipRows.push(ROW2);
  west.forEach((x) => chipSlots.push({ x, row: ROW2, rowIndex: 0, dir: -1 }));
  let y = ROW2 + 60;
  while (chipSlots.length < projects.length) {
    const xs = packRow(chipSlots.length, 24, 266);
    chipRows.push(y);
    xs.forEach((x) => chipSlots.push({ x, row: y, rowIndex: chipRows.length - 1, dir: 1 }));
    y += 70;
  }
}
const lastChipRow = chipRows[chipRows.length - 1];
const ROW4 = lastChipRow + 56;

export const BOARD = { w: 300, h: ROW4 + 22, t: 1.6, radius: 4 };
export const ROWS = { r1: ROW1, r2: ROW2, r4: ROW4, chips: chipRows };

/** power rails between rows, shared with the decoupling network */
export function railAbove(rowIndex: number) {
  if (rowIndex === 0) return ROW2 - 38;
  if (rowIndex === 1) return ROW2 + 34;
  return chipRows[rowIndex] - 24;
}
export function railBelow(rowIndex: number) {
  if (rowIndex === 0) return ROW2 + 34;
  if (rowIndex < chipRows.length - 1) return chipRows[rowIndex] + 26;
  return chipRows[rowIndex] + 27;
}
/** the net returns west between two eastward chip rows */
export function returnChannel(rowIndex: number) {
  return chipRows[rowIndex] + 35;
}

/* ------------------------------------------------------------------ parts */

const parts: Part[] = [];
const partByRef = new Map<string, Part>();

function add(p: Omit<Part, "dIn" | "dOut" | "interactive"> & { interactive?: boolean }) {
  const part: Part = { ...p, dIn: 0, dOut: 0, interactive: p.interactive ?? true };
  parts.push(part);
  partByRef.set(part.ref, part);
  return part;
}

/** two pads on the route axis. dir = +1 when the net travels east */
function axialPads(x: number, y: number, pitch: number, dir: 1 | -1, pad: Omit<Pad, "x" | "y">) {
  const a: Pt = [x - (dir * pitch) / 2, y];
  const b: Pt = [x + (dir * pitch) / 2, y];
  return {
    pads: [
      { ...pad, x: a[0], y: a[1], shape: "rect" as const },
      { ...pad, x: b[0], y: b[1] },
    ],
    padIn: a,
    padOut: b,
  };
}

// J1 · usb-c at the left edge: the net starts here
add({
  ref: "J1",
  kind: "usbc",
  x: 3.4,
  y: ROW1,
  zone: "inicio",
  section: "inicio",
  value: "USB-C · entrada",
  footprint: "Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12",
  court: [8, 9.6],
  height: 3.2,
  pads: [
    ...Array.from({ length: 5 }, (_, i) => ({
      x: 8.6,
      y: ROW1 + (i - 2) * 1.1,
      w: 1.15,
      h: 0.6,
      shape: "rect" as const,
    })),
    { x: 5.5, y: ROW1 - 4.32, w: 1, h: 1.8, shape: "oval", drill: 0.6 },
    { x: 5.5, y: ROW1 + 4.32, w: 1, h: 1.8, shape: "oval", drill: 0.6 },
  ],
  index: 0,
});

add({
  ref: "D0",
  kind: "led",
  x: 18,
  y: 60,
  zone: "inicio",
  section: "inicio",
  value: "PWR",
  footprint: "LED_THT:LED_D3.0mm",
  court: [4.2, 4.2],
  height: 5.3,
  pads: [
    { x: 16.73, y: 60, w: 1.8, h: 1.8, shape: "rect", drill: 0.9 },
    { x: 19.27, y: 60, w: 1.8, h: 1.8, shape: "round", drill: 0.9 },
  ],
  index: -1,
  color: "green",
  interactive: false,
});

// Y · formación, R · certificados (row 1, eastward)
studies.forEach((s, i) => {
  const x = row1X[i];
  add({
    ref: `Y${i + 1}`,
    kind: "crystal",
    x,
    y: ROW1,
    zone: "formacion",
    section: "formacion",
    value: s.title,
    footprint: "Crystal:Crystal_HC49-U_Vertical",
    court: [12, 5.4],
    height: 3.6,
    ...axialPads(x, ROW1, 4.88, 1, { w: 1.5, h: 2.3, shape: "oval", drill: 0.8 }),
    index: i,
    row: ROW1,
  });
});

certs.forEach((c, i) => {
  const x = row1X[studies.length + i];
  add({
    ref: `R${i + 1}`,
    kind: "resistor",
    x,
    y: ROW1,
    zone: "formacion",
    section: "formacion",
    value: c.title,
    footprint: "Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal",
    court: [12.4, 3.2],
    height: 2.6,
    ...axialPads(x, ROW1, 10.16, 1, { w: 1.6, h: 1.6, shape: "round", drill: 0.8 }),
    index: i,
    row: ROW1,
  });
});

// C · experiencia (row 2, westward). height encodes years
jobs.forEach((j, i) => {
  const x = capX[i];
  const years = Math.max(1, (j.end ?? NOW_YEAR) - j.start);
  add({
    ref: `C${i + 1}`,
    kind: "capacitor",
    x,
    y: ROW2,
    zone: "experiencia",
    section: "experiencia",
    value: `${j.role} · ${j.org}`,
    footprint: "Capacitor_THT:CP_Radial_D8.0mm_P3.50mm",
    court: [8.6, 8.6],
    height: 4.6 + Math.min(years, 8) * 2.35,
    ...axialPads(x, ROW2, 3.5, -1, { w: 1.6, h: 1.6, shape: "round", drill: 0.8 }),
    index: i,
    years,
    row: ROW2,
  });
});

// U · proyectos
function chipPads(g: PkgGeom, cx: number, cy: number): Pad[] {
  const pads: Pad[] = [];
  if (g.kind === "bga") {
    const n = Math.round(Math.sqrt(g.pins));
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        pads.push({
          x: cx + (c - (n - 1) / 2) * g.pitch,
          y: cy + (r - (n - 1) / 2) * g.pitch,
          w: 0.4,
          h: 0.4,
          shape: "round",
        });
    return pads;
  }
  if (g.kind === "soic") {
    const n = g.pins / 2;
    for (const side of [-1, 1])
      for (let i = 0; i < n; i++)
        pads.push({
          x: cx + side * (g.span / 2 - 0.35),
          y: cy + (i - (n - 1) / 2) * g.pitch,
          w: 1.55,
          h: 0.6,
          shape: "rect",
        });
    return pads;
  }
  const n = g.pins / 4;
  const reach = g.kind === "qfp" ? g.span / 2 - 0.25 : g.bx / 2 - 0.3;
  const len = g.kind === "qfp" ? 1.5 : 0.9;
  const wid = g.pitch * 0.55;
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * g.pitch;
    pads.push({ x: cx - reach, y: cy + o, w: len, h: wid, shape: "rect" });
    pads.push({ x: cx + reach, y: cy + o, w: len, h: wid, shape: "rect" });
    pads.push({ x: cx + o, y: cy - reach, w: wid, h: len, shape: "rect" });
    pads.push({ x: cx + o, y: cy + reach, w: wid, h: len, shape: "rect" });
  }
  if (g.kind === "qfn") pads.push({ x: cx, y: cy, w: g.bx * 0.62, h: g.by * 0.62, shape: "rect" });
  return pads;
}

/** outer reach of the land pattern along x, where the net meets the pin */
export function chipReach(g: PkgGeom) {
  if (g.kind === "qfp") return g.span / 2 + 0.5;
  if (g.kind === "qfn") return g.bx / 2 + 0.15;
  if (g.kind === "soic") return g.span / 2 + 0.43;
  return g.bx / 2 - 0.4;
}

/** shift the body so a real pin sits exactly on the net */
function pinOffset(g: PkgGeom) {
  if (g.kind === "bga") return 0;
  const perSide = g.kind === "soic" ? g.pins / 2 : g.pins / 4;
  return perSide % 2 === 0 ? g.pitch / 2 : 0;
}

projects.forEach((pr, i) => {
  const at = chipSlots[i];
  const pkg = packageOf(i);
  const g = PKG[pkg];
  const cy = at.row + pinOffset(g);
  const reach = chipReach(g);
  add({
    ref: `U${i + 1}`,
    kind: "chip",
    x: at.x,
    y: cy,
    zone: `proyectos-${at.rowIndex}`,
    section: "proyectos",
    value: pr.name,
    footprint: g.footprint,
    court: courtOf(g),
    height: g.h,
    pads: chipPads(g, at.x, cy),
    padIn: [at.x - at.dir * reach, at.row],
    padOut: [at.x + at.dir * reach, at.row],
    index: i,
    pkg,
    row: at.row,
  });
});

// D · conocimientos (last row, westward)
const LED_X0 = 272;
const LED_X1 = 52;
const skillCount = skillGroups.reduce((a, g) => a + g.skills.length, 0);
const LED_GROUP_GAP = 4;
const LED_PITCH = Math.min(
  8.6,
  (LED_X0 - LED_X1 - LED_GROUP_GAP * Math.max(0, skillGroups.length - 1)) / Math.max(1, skillCount - 1),
);
{
  let x = LED_X0;
  let n = 0;
  skillGroups.forEach((g, gi) => {
    if (gi > 0) x -= LED_GROUP_GAP;
    g.skills.forEach((skill, si) => {
      add({
        ref: `D${n + 1}`,
        kind: "led",
        x,
        y: ROW4,
        zone: "stack",
        section: "stack",
        value: skill,
        footprint: "LED_THT:LED_D3.0mm",
        court: [4.2, 4.2],
        height: 5.3,
        ...axialPads(x, ROW4, 2.54, -1, { w: 1.8, h: 1.8, shape: "round", drill: 0.9 }),
        index: gi * 100 + si,
        color: g.color,
        labelSide: n % 2 === 0 ? -1 : 1,
        row: ROW4,
      });
      n++;
      x -= LED_PITCH;
    });
  });
}

// J2 · contacto, the net ends on pin 4
const J2X = 28;
add({
  ref: "J2",
  kind: "terminal",
  x: J2X,
  y: ROW4 + 1.2,
  zone: "contacto",
  section: "contacto",
  value: "Contacto",
  footprint: "TerminalBlock:TerminalBlock_bornier-4_P5.08mm",
  court: [21.4, 9.2],
  height: 10,
  pads: contactPins.map((_, i) => ({
    x: J2X + (i - 1.5) * 5.08,
    y: ROW4,
    w: 2.4,
    h: 2.4,
    shape: i === 0 ? ("rect" as const) : ("round" as const),
    drill: 1.3,
  })),
  index: 0,
  row: ROW4,
});

export const SW1_Y = ROW4 - 34;
add({
  ref: "SW1",
  kind: "switch",
  x: 14,
  y: SW1_Y,
  zone: "contacto",
  section: "contacto",
  value: "RESET",
  footprint: "Button_Switch_THT:SW_PUSH_6mm",
  court: [8.2, 6.4],
  height: 4.3,
  pads: [
    { x: 14 - 3.25, y: SW1_Y - 2.25, w: 2, h: 2, shape: "round", drill: 1 },
    { x: 14 + 3.25, y: SW1_Y - 2.25, w: 2, h: 2, shape: "round", drill: 1 },
    { x: 14 - 3.25, y: SW1_Y + 2.25, w: 2, h: 2, shape: "round", drill: 1 },
    { x: 14 + 3.25, y: SW1_Y + 2.25, w: 2, h: 2, shape: "round", drill: 1 },
  ],
  index: 0,
});

/* ------------------------------------------------------------------ net */

const gapUnits: Record<PartKind, number> = {
  chip: 0,
  capacitor: 80,
  crystal: 70,
  resistor: 64,
  led: 15,
  terminal: 0,
  usbc: 0,
  switch: 0,
};

const byKind = (kind: PartKind, section?: SectionId) =>
  parts.filter((p) => p.kind === kind && (!section || p.section === section));

const rawRuns: Pt[][] = [];
const gapRefs: string[] = [];
{
  let cur: Pt[] = [[9.2, ROW1]];
  const to = (x: number, y: number) => cur.push([x, y]);
  const through = (p: Part) => {
    cur.push(p.padIn!);
    rawRuns.push(cur);
    gapRefs.push(p.ref);
    cur = [p.padOut!];
  };
  to(14, ROW1);
  byKind("crystal").forEach(through);
  byKind("resistor").forEach(through);
  to(286, ROW1);
  to(286, ROW2);
  byKind("capacitor").forEach(through);
  const chips = byKind("chip");
  chips.filter((c) => c.row === ROW2).forEach(through);
  to(12, ROW2);
  chipRows.slice(1).forEach((row, k) => {
    const ri = k + 1;
    if (ri === 1) to(12, row);
    else {
      to(288, chipRows[ri - 1]);
      to(288, returnChannel(ri - 1));
      to(12, returnChannel(ri - 1));
      to(12, row);
    }
    chips.filter((c) => c.row === row).forEach(through);
  });
  if (chipRows.length === 1) to(12, ROW4 - 40);
  to(288, lastChipRow === ROW2 ? ROW4 - 40 : lastChipRow);
  to(288, ROW4);
  byKind("led", "stack").forEach(through);
  to(J2X + 1.5 * 5.08, ROW4);
  rawRuns.push(cur);
}

export interface Run {
  pts: Pt[];
  d0: number;
  d1: number;
  net: string;
}

export const runs: Run[] = [];
/** the whole net as one polyline, straight through every part */
export const netPath: Pt[] = [];
{
  let d = 0;
  rawRuns.forEach((raw, i) => {
    const pts = chamfer(raw, 5);
    const len = polylineLength(pts);
    const prev = i > 0 ? gapRefs[i - 1] : null;
    runs.push({ pts, d0: d, d1: d + len, net: prev ? `Net-(${prev}-Pad2)` : "/VBUS" });
    if (netPath.length && dist(netPath[netPath.length - 1], pts[0]) < 1e-6) netPath.push(...pts.slice(1));
    else netPath.push(...pts);
    d += len;
    if (i < gapRefs.length) {
      const part = partByRef.get(gapRefs[i])!;
      part.dIn = d;
      d += dist(part.padIn!, part.padOut!);
      part.dOut = d;
    }
  });
}

export const NET_LENGTH = runs[runs.length - 1].d1;

// off-net parts land with their neighbours
{
  const j1 = partByRef.get("J1")!;
  j1.dIn = -1;
  j1.dOut = 0;
  const d0 = partByRef.get("D0")!;
  d0.dIn = -1;
  d0.dOut = 0;
  const j2 = partByRef.get("J2")!;
  j2.dIn = NET_LENGTH - 14;
  j2.dOut = NET_LENGTH;
  const sw = partByRef.get("SW1")!;
  sw.dIn = NET_LENGTH - 8;
  sw.dOut = NET_LENGTH;
}

export { parts, partByRef };

/* ------------------------------------------------------------ passives */

export const passives: Passive[] = [];
byKind("chip").forEach((p) => {
  const g = PKG[p.pkg!];
  const off = g.span / 2 + 2.6;
  if (g.kind === "soic") {
    passives.push({ x: p.x, y: p.y - g.by / 2 - 2.2, vertical: false, type: "c", owner: p.ref });
    return;
  }
  passives.push({ x: p.x - off + 1.5, y: p.y - off, vertical: false, type: "c", owner: p.ref });
  passives.push({ x: p.x + off - 1.5, y: p.y - off, vertical: false, type: "c", owner: p.ref });
  passives.push({ x: p.x + off, y: p.y + off - 1.5, vertical: true, type: "c", owner: p.ref });
  passives.push({ x: p.x - off, y: p.y + off - 1.5, vertical: true, type: "r", owner: p.ref });
});
// load capacitors under each crystal
byKind("crystal").forEach((p) => {
  passives.push({ x: p.padIn![0], y: ROW1 + 5.4, vertical: true, type: "c", owner: p.ref });
  passives.push({ x: p.padOut![0], y: ROW1 + 5.4, vertical: true, type: "c", owner: p.ref });
});

/* ------------------------------------------------------------- mounting */

export const mountingHoles: Pt[] = [
  [6, 6],
  [BOARD.w - 6, 6],
  [6, BOARD.h - 6],
  [BOARD.w - 6, BOARD.h - 6],
];

export const fiducials: Pt[] = [
  [14, BOARD.h - 10],
  [292, 18],
  [286, BOARD.h - 10],
];

/* ------------------------------------------------------------- sections */

export interface Zone {
  id: ZoneId;
  focus: Pt;
  dist: number;
  elev: number;
  yaw: number;
  follow: number;
  d0: number;
  d1: number;
}

function span(zone: ZoneId): [number, number] {
  const zs = parts.filter((p) => p.zone === zone);
  return [Math.min(...zs.map((p) => p.dIn)), Math.max(...zs.map((p) => p.dOut))];
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

const zoneParams: Omit<Zone, "d0" | "d1">[] = [
  { id: "inicio", focus: [72, 40], dist: 235, elev: 56, yaw: -6, follow: 0.25 },
  { id: "formacion", focus: [mean(row1X), 46], dist: 185, elev: 50, yaw: 4, follow: 0.4 },
  { id: "experiencia", focus: [mean(capX), ROW2 - 6], dist: 150, elev: 34, yaw: -10, follow: 0.35 },
  ...chipRows.map((row, ri) => ({
    id: `proyectos-${ri}`,
    focus: [mean(chipSlots.filter((s) => s.rowIndex === ri).map((s) => s.x)), row] as Pt,
    dist: 185,
    elev: 51,
    yaw: ri % 2 === 0 ? 6 : -5,
    follow: 0.45,
  })),
  { id: "stack", focus: [165, ROW4 - 2], dist: 190, elev: 56, yaw: 5, follow: 0.4 },
  { id: "contacto", focus: [30, ROW4 - 10], dist: 125, elev: 46, yaw: 10, follow: 0.6 },
];

export const zones: Zone[] = zoneParams
  .filter((z) => z.id === "inicio" || parts.some((p) => p.zone === z.id))
  .map((z) => {
    if (z.id === "inicio") return { ...z, d0: 0, d1: 14 };
    const [a, b] = span(z.id);
    return { ...z, d0: a - 12, d1: b + 8 };
  });

export interface Section {
  id: SectionId;
  sheet: number;
  name: string;
  zone: ZoneId;
  legend: string[];
  hint: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const sections: Section[] = [
  {
    id: "inicio",
    sheet: 1,
    name: "inicio",
    zone: "inicio",
    legend: ["placa sin montar", `${parts.length + passives.length} componentes por colocar`],
    hint: "Haz scroll montar la placa. O haz click en los huecos para poner los componentes",
  },
  {
    id: "formacion",
    sheet: 2,
    name: "formación",
    zone: "formacion",
    legend: ["Y cristal = formación", "R resistencia = certificado"],
    hint: `${plural(studies.length, "cristal de cuarzo", "cristales de cuarzo")} para los estudios y ${plural(certs.length, "resistencia", "resistencias")} para los títulos. Pulsa para ver en detalle.`,
  },
  {
    id: "experiencia",
    sheet: 3,
    name: "experiencia",
    zone: "experiencia",
    legend: ["C condensador = puesto", "altura = tiempo"],
    hint: "Un condensador por puesto. Cuanto más alto, más tiempo en él. Pulsa para ver en detalle.",
  },
  {
    id: "proyectos",
    sheet: 4,
    name: "proyectos",
    zone: "proyectos-0",
    legend: ["U circuito integrado = proyecto", "proyectos destacados"],
    hint: `${plural(projects.length, "chip", "chips")}, uno por proyecto. Pulsa uno para ver sus detalles y tecnologías.`,
  },
  {
    id: "stack",
    sheet: 5,
    name: "conocimientos",
    zone: "stack",
    legend: ["D led = herramienta", "color = área"],
    hint: `${skillCount} LEDs en serie, uno por herramienta. Pulsa uno para apagarlo o encenderlo.`,
  },
  {
    id: "contacto",
    sheet: 6,
    name: "contacto",
    zone: "contacto",
    legend: ["J2 bornero = contacto", "4 vías"],
    hint: "Conéctate. Cada uno abre un enlace: Email, GitHub, LinkedIn y CV.",
  },
];

/* --------------------------------------------------------------- scroll */

export interface ScrollSeg {
  u0: number;
  u1: number;
  d0: number;
  d1: number;
}

export const INTRO_UNITS = 190;
export const OUTRO_UNITS = 300;

export const scrollSegs: ScrollSeg[] = [];
{
  let u = INTRO_UNITS;
  runs.forEach((r, i) => {
    const len = r.d1 - r.d0;
    scrollSegs.push({ u0: u, u1: u + len, d0: r.d0, d1: r.d1 });
    u += len;
    if (i < gapRefs.length) {
      const part = partByRef.get(gapRefs[i])!;
      const g = part.pkg ? PKG[part.pkg] : null;
      const units = part.kind === "chip" && g ? 70 + g.span * 2.2 : gapUnits[part.kind];
      scrollSegs.push({ u0: u, u1: u + units, d0: part.dIn, d1: part.dOut });
      u += units;
    }
  });
}

export const NET_END_UNITS = scrollSegs[scrollSegs.length - 1].u1;
export const TOTAL_UNITS = NET_END_UNITS + OUTRO_UNITS;

export function unitsToDistance(u: number) {
  if (u <= INTRO_UNITS) return 0;
  if (u >= NET_END_UNITS) return NET_LENGTH;
  let lo = 0;
  let hi = scrollSegs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (scrollSegs[mid].u1 < u) lo = mid + 1;
    else hi = mid;
  }
  const s = scrollSegs[lo];
  return lerp(s.d0, s.d1, (u - s.u0) / Math.max(1e-6, s.u1 - s.u0));
}

export function distanceToUnits(d: number) {
  if (d <= 0) return INTRO_UNITS;
  if (d >= NET_LENGTH) return NET_END_UNITS;
  for (const s of scrollSegs) {
    if (d <= s.d1) return lerp(s.u0, s.u1, (d - s.d0) / Math.max(1e-6, s.d1 - s.d0));
  }
  return NET_END_UNITS;
}

/** scroll position that frames a section */
export function sectionUnits(id: SectionId) {
  if (id === "inicio") return 0;
  if (id === "contacto") return NET_END_UNITS - 20;
  const zone = sections.find((s) => s.id === id)!.zone;
  const zoneParts = parts.filter((p) => p.zone === zone);
  if (!zoneParts.length) return 0;
  const first = zoneParts.reduce((a, b) => (a.dIn < b.dIn ? a : b));
  return distanceToUnits(Math.max(0, first.dIn - 4));
}

export function netAt(d: number) {
  for (const r of runs) if (d <= r.d1) return r.net;
  return runs[runs.length - 1].net;
}

/** first pad the router has not reached yet */
export function nextTarget(d: number): Pt | null {
  for (const r of runs) {
    if (d < r.d1 - 0.01) return r.pts[r.pts.length - 1];
  }
  return null;
}
