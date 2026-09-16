import { certs, contactPins, jobs, person, projects, skillGroups, studies } from "@/data/portfolio";
import { BOARD, NOW_YEAR, PKG, ROWS, SW1_Y, parts, partByRef } from "./layout";

/*
 * Silkscreen text is not baked into the board texture: every label gets its own
 * high-density region in an atlas and a quad on the board, so type stays sharp
 * when the camera is a few centimetres away.
 */

export type Family = "display" | "mono";

export interface Label {
  side: "top" | "bottom";
  /** anchor in the side's own coordinates (bottom: flipped view) */
  x: number;
  y: number;
  text: string;
  /** cap height in mm */
  size: number;
  family?: Family;
  weight?: number;
  align?: "left" | "center" | "right";
  tracking?: number;
  /** which group toggles it: refdes or values */
  layer?: "silk" | "ref";
}

export interface Fonts {
  display: string;
  mono: string;
}

export interface AtlasQuad {
  label: Label;
  /** size on the board, mm */
  w: number;
  h: number;
  /** uv rectangle in the atlas */
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  atlas: number;
}

const up = (s: string) => s.toLocaleUpperCase("es-ES");

export function buildLabels(): Label[] {
  const L: Label[] = [];
  const t = (l: Omit<Label, "side"> & { side?: Label["side"] }) => L.push({ side: "top", ...l });

  /* title block */
  t({ x: 38, y: 21.2, text: person.given.toUpperCase(), size: 7.4, family: "display", weight: 700, tracking: 0.02 });
  t({ x: 38, y: 32.6, text: up(person.family), size: 7.4, family: "display", weight: 700, tracking: 0.02 });
  t({ x: 14.2, y: 37.6, text: up(`${person.role} · ${person.location}`), size: 1.75, tracking: 0.16 });
  t({ x: 22, y: 57.4, text: up(person.focus), size: 1.5, tracking: 0.16 });
  t({ x: 22, y: 62.4, text: up("rev 2026.09 · jcc-portfolio"), size: 1.3, tracking: 0.16 });
  t({ x: 18, y: 64.4, text: "PWR", size: 1.2, align: "center", tracking: 0.12 });
  t({ x: 9.6, y: 38.8, text: "J1", size: 1.3, tracking: 0.08, layer: "ref" });

  /* section headers */
  const header = (x: number, y: number, n: number, name: string) => {
    t({ x, y, text: `${n.toString().padStart(2, "0")}`, size: 1.6, tracking: 0.16 });
    t({ x: x + 5.2, y, text: up(name), size: 2.6, family: "display", weight: 600, tracking: 0.12 });
  };
  const ofKind = (k: string) => parts.filter((p) => p.kind === k);
  const row1 = [...ofKind("crystal"), ...ofKind("resistor")];
  if (row1.length) header(Math.min(...row1.map((p) => p.x)) - 8, ROWS.r1 - 16, 2, "formación");
  const caps = ofKind("capacitor");
  if (caps.length) header(Math.min(...caps.map((p) => p.x)) - 10, ROWS.r2 - 20, 3, "experiencia");
  header(22, ROWS.r2 - 20, 4, "proyectos");
  header(214, ROWS.r4 - 21.6, 5, "conocimientos");

  /* formación: crystals and resistors */
  ofKind("crystal").forEach((p) => {
    const s = studies[p.index];
    t({ x: p.x, y: p.y - 4.2, text: p.ref, size: 1.3, align: "center", layer: "ref" });
    t({ x: p.x, y: p.y + 12.2, text: up(s.period), size: 1.25, align: "center", tracking: 0.1 });
  });
  ofKind("resistor").forEach((p) => {
    const c = certs[p.index];
    t({ x: p.x, y: p.y - 3.4, text: p.ref, size: 1.3, align: "center", layer: "ref" });
    t({ x: p.x, y: p.y + 4.8, text: up(c.code), size: 1.4, align: "center", tracking: 0.12 });
  });

  /* experiencia: capacitors */
  caps.forEach((p) => {
    const j = jobs[p.index];
    t({ x: p.x, y: p.y - 5.6, text: p.ref, size: 1.3, align: "center", layer: "ref" });
    const period = j.end === null ? `${j.start}–HOY` : j.start === j.end ? `${j.start}` : `${j.start}–${j.end}`;
    t({ x: p.x, y: p.y + 6.6, text: period, size: 1.3, align: "center", tracking: 0.08 });
  });

  /* proyectos: IC refdes and value */
  ofKind("chip").forEach((p) => {
    const pr = projects[p.index];
    const g = PKG[p.pkg!];
    const half = (g.kind === "soic" ? g.by : g.span) / 2;
    const vy = p.y + half + (g.kind === "soic" ? 4.2 : 3.6);
    t({ x: p.x, y: p.y - half - (g.kind === "soic" ? 2.4 : 1.4), text: p.ref, size: 1.3, align: "center", layer: "ref" });
    const short = pr.name.split(" · ")[0];
    t({ x: p.x, y: vy, text: up(short), size: g.span > 12 ? 1.7 : 1.35, align: "center", tracking: 0.08 });
    t({ x: p.x, y: vy + 2.6, text: up(p.pkg!), size: 1.05, align: "center", tracking: 0.12 });
  });

  /* conocimientos: group names + one label per LED */
  let first = 0;
  skillGroups.forEach((grp) => {
    const leds = parts.slice(
      parts.findIndex((p) => p.ref === `D${first + 1}`),
      parts.findIndex((p) => p.ref === `D${first + 1}`) + grp.skills.length,
    );
    const x0 = leds[0].x;
    const x1 = leds[leds.length - 1].x;
    t({ x: (x0 + x1) / 2, y: ROWS.r4 - 10.8, text: up(grp.name), size: 1.45, align: "center", tracking: 0.18 });
    leds.forEach((p) => {
      const side = p.labelSide ?? -1;
      t({ x: p.x, y: p.y + side * 4.4 + (side > 0 ? 1.3 : 0), text: up(p.value), size: 1.25, align: "center", tracking: 0.02 });
    });
    first += grp.skills.length;
  });

  /* contacto */
  const j2 = partByRef.get("J2")!;
  contactPins.forEach((c, i) => {
    t({ x: j2.x + (i - 1.5) * 5.08, y: j2.y + (i % 2 === 0 ? 7.8 : 10.4), text: up(c.label), size: 1.2, align: "center", tracking: 0.08 });
  });
  t({ x: j2.x, y: j2.y - 9.8, text: "J2", size: 1.3, align: "center", layer: "ref" });
  t({ x: 17.6, y: ROWS.r4 - 19.4, text: "06", size: 1.6, tracking: 0.16 });
  t({ x: 22.8, y: ROWS.r4 - 19.4, text: up("contacto"), size: 2.6, family: "display", weight: 600, tracking: 0.12 });
  t({ x: 14, y: SW1_Y - 4.6, text: "SW1", size: 1.3, align: "center", layer: "ref" });
  t({ x: 14, y: SW1_Y + 6.6, text: "RESET", size: 1.2, align: "center", tracking: 0.14 });

  /* fab notes along the bottom edge */
  t({
    x: BOARD.w - 9,
    y: BOARD.h - 6.2,
    text: up(`jcc-portfolio · ${BOARD.w} × ${BOARD.h} mm · 2 capas · fr4 1,6 mm · enig`),
    size: 1.25,
    align: "right",
    tracking: 0.14,
  });

  /* ---------------------------------------------------------- bottom side */
  const b = (l: Omit<Label, "side">) => L.push({ side: "bottom", ...l });
  b({ x: 74, y: 102, text: up("perfil"), size: 3.2, family: "display", weight: 600, tracking: 0.08 });
  const wrap = (s: string, max: number) => {
    const words = s.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > max) {
        lines.push(cur.trim());
        cur = w;
      } else cur += " " + w;
    }
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  };
  let y = 110;
  for (const para of [person.summary, ...person.bio]) {
    for (const line of wrap(para, 64)) {
      b({ x: 74, y, text: line, size: 1.75 });
      y += 3.6;
    }
    y += 2.4;
  }
  b({ x: 196, y: 102, text: up("idiomas"), size: 3.2, family: "display", weight: 600, tracking: 0.08 });
  y = 110;
  person.languages.forEach(([k, v]) => {
    b({ x: 196, y, text: up(`${k} · ${v}`), size: 1.75, tracking: 0.12 });
    y += 4.2;
  });
  b({ x: 22, y: 150, text: up(person.location), size: 1.5, tracking: 0.16 });
  b({ x: 22, y: 154.4, text: up(`© ${NOW_YEAR} ${person.given} ${person.family}`), size: 1.5, tracking: 0.16 });

  return L;
}

export function fontFor(l: Label, fonts: Fonts, px: number) {
  const family = l.family === "display" ? fonts.display : fonts.mono;
  return `${l.weight ?? 500} ${px}px ${family}`;
}

/* cap height to em ratio for both families */
const CAP = 0.7;

export function buildAtlases(labels: Label[], fonts: Fonts, maxDensity: number) {
  const SIZE = maxDensity <= 36 ? 1024 : 2048;
  const PAD = 6;
  const measureCv = document.createElement("canvas");
  const measure = measureCv.getContext("2d");
  const items = labels.map((l) => {
    const emMm = l.size / CAP;
    const probePx = 100;
    if (measure) measure.font = fontFor(l, fonts, probePx);
    const letter = measure ? measure.measureText(l.text).width : probePx * l.text.length * 0.6;
    const track = (l.tracking ?? 0) * probePx * Math.max(0, l.text.length - 1);
    const wMm = ((letter + track) / probePx) * emMm;
    const hMm = emMm * 1.18;
    const density = Math.min(maxDensity, (SIZE - PAD * 2) / wMm);
    return { l, wMm, hMm, density, wPx: Math.ceil(wMm * density) + PAD, hPx: Math.ceil(hMm * density) + PAD };
  });
  const order = items.map((_, i) => i).sort((a, b) => items[b].hPx - items[a].hPx);

  const canvases: HTMLCanvasElement[] = [];
  const quads: AtlasQuad[] = new Array(items.length);
  let ctx: CanvasRenderingContext2D | null = null;
  let cx = 0;
  let cy = 0;
  let rowH = 0;
  const open = (): CanvasRenderingContext2D | null => {
    const cv = document.createElement("canvas");
    cv.width = SIZE;
    cv.height = SIZE;
    canvases.push(cv);
    const c = cv.getContext("2d");
    if (c) {
      c.fillStyle = "#fff";
      c.textBaseline = "alphabetic";
    }
    cx = 0;
    cy = 0;
    rowH = 0;
    return c;
  };
  ctx = open();
  for (const i of order) {
    const it = items[i];
    if (cx + it.wPx > SIZE) {
      cx = 0;
      cy += rowH;
      rowH = 0;
    }
    if (cy + it.hPx > SIZE) {
      ctx = open();
    }
    const g = ctx;
    if (g) {
      const emPx = (it.l.size / CAP) * it.density;
      g.font = fontFor(it.l, fonts, emPx);
      const trackPx = (it.l.tracking ?? 0) * emPx;
      const baseline = cy + PAD / 2 + emPx * 0.94;
      const spaced = g as CanvasRenderingContext2D & { letterSpacing?: string };
      if (typeof spaced.letterSpacing === "string") {
        spaced.letterSpacing = `${trackPx}px`;
        g.fillText(it.l.text, cx + PAD / 2, baseline);
      } else {
        let x = cx + PAD / 2;
        for (const ch of it.l.text) {
          g.fillText(ch, x, baseline);
          x += g.measureText(ch).width + trackPx;
        }
      }
    }
    quads[i] = {
      label: it.l,
      w: (it.wPx - PAD) / it.density,
      h: (it.hPx - PAD) / it.density,
      u0: (cx + PAD / 2) / SIZE,
      v0: (cy + PAD / 2) / SIZE,
      u1: (cx + it.wPx - PAD / 2) / SIZE,
      v1: (cy + it.hPx - PAD / 2) / SIZE,
      atlas: canvases.length - 1,
    };
    cx += it.wPx;
    rowH = Math.max(rowH, it.hPx);
  }
  return { canvases, quads };
}
