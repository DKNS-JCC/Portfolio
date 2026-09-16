import type { Fonts } from "./labels";
import { mulberry32 } from "./geometry";

/* Small canvases printed onto individual parts. All return a canvas; the engine wraps them. */

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function tracked(g: CanvasRenderingContext2D, text: string, x: number, y: number, track: number) {
  const spaced = g as CanvasRenderingContext2D & { letterSpacing?: string };
  if (typeof spaced.letterSpacing === "string") {
    spaced.letterSpacing = `${track}px`;
    g.fillText(text, x, y);
    spaced.letterSpacing = "0px";
    return;
  }
  g.fillText(text, x, y);
}

/** laser marking on an epoxy body: light, low contrast, matte */
export function chipMarking(
  fonts: Fonts,
  lines: [string, string, string],
  aspect: number,
  soic: boolean,
) {
  const W = 512;
  const H = Math.round(W * aspect);
  const c = canvas(W, H);
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, W, H);
  // pin 1 dimple
  const r = W * (soic ? 0.07 : 0.045);
  const px = W * (soic ? 0.2 : 0.12);
  const py = soic ? H * 0.12 : W * 0.12;
  const grad = g.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r);
  grad.addColorStop(0, "rgba(0,0,0,0.75)");
  grad.addColorStop(1, "rgba(40,44,46,0.55)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(px, py, r, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = "rgba(196,202,204,0.62)";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const big = Math.min(W * 0.15, (W * 0.84) / Math.max(4, lines[0].length) / 0.62);
  g.font = `600 ${big}px ${fonts.mono}`;
  tracked(g, lines[0], W / 2, H * 0.45, big * 0.02);
  const mid = big * 0.62;
  g.font = `500 ${mid}px ${fonts.mono}`;
  tracked(g, lines[1], W / 2, H * 0.45 + big * 0.95, mid * 0.06);
  g.font = `500 ${mid * 0.8}px ${fonts.mono}`;
  g.fillStyle = "rgba(196,202,204,0.42)";
  tracked(g, lines[2], W / 2, H * 0.45 + big * 1.75, mid * 0.1);
  return c;
}

/** silicon floorplan: one functional block per technology in the project */
export function dieFloorplan(fonts: Fonts, blocks: string[], seed: number) {
  const S = 1024;
  const c = canvas(S, S);
  const g = c.getContext("2d")!;
  const rnd = mulberry32(seed);

  g.fillStyle = "#4d545b";
  g.fillRect(0, 0, S, S);
  // seal ring and bond pads
  g.strokeStyle = "#8c8f86";
  g.lineWidth = 10;
  g.strokeRect(22, 22, S - 44, S - 44);
  g.fillStyle = "#c9a95b";
  const pads = 22;
  for (let i = 0; i < pads; i++) {
    const t = 70 + ((S - 140) / (pads - 1)) * i;
    for (const [x, y] of [
      [t, 48],
      [t, S - 48],
      [48, t],
      [S - 48, t],
    ])
      g.fillRect(x - 11, y - 11, 22, 22);
  }

  // treemap of blocks
  type R = { x: number; y: number; w: number; h: number };
  const area: R = { x: 96, y: 96, w: S - 192, h: S - 192 };
  const rects: R[] = [];
  const split = (r: R, n: number, vertical: boolean) => {
    if (n <= 1) {
      rects.push(r);
      return;
    }
    const a = Math.floor(n / 2);
    const k = a / n + (rnd() - 0.5) * 0.12;
    if (vertical) {
      const w = r.w * k;
      split({ x: r.x, y: r.y, w: w - 6, h: r.h }, a, !vertical);
      split({ x: r.x + w + 6, y: r.y, w: r.w - w - 6, h: r.h }, n - a, !vertical);
    } else {
      const h = r.h * k;
      split({ x: r.x, y: r.y, w: r.w, h: h - 6 }, a, !vertical);
      split({ x: r.x, y: r.y + h + 6, w: r.w, h: r.h - h - 6 }, n - a, !vertical);
    }
  };
  split(area, blocks.length, true);

  const fills = ["#5f676e", "#6b6560", "#566068", "#6a6f66", "#5d5a63"];
  rects.forEach((r, i) => {
    g.fillStyle = fills[i % fills.length];
    g.fillRect(r.x, r.y, r.w, r.h);
    // standard-cell rows or memory grid
    g.save();
    g.beginPath();
    g.rect(r.x, r.y, r.w, r.h);
    g.clip();
    if (i % 3 === 1) {
      g.strokeStyle = "rgba(210,190,150,0.22)";
      g.lineWidth = 1.2;
      for (let x = r.x; x < r.x + r.w; x += 9) {
        g.beginPath();
        g.moveTo(x, r.y);
        g.lineTo(x, r.y + r.h);
        g.stroke();
      }
      for (let y = r.y; y < r.y + r.h; y += 9) {
        g.beginPath();
        g.moveTo(r.x, y);
        g.lineTo(r.x + r.w, y);
        g.stroke();
      }
    } else {
      for (let y = r.y + 4; y < r.y + r.h; y += 14) {
        let x = r.x + 3;
        while (x < r.x + r.w) {
          const w = 6 + rnd() * 30;
          g.fillStyle = rnd() > 0.5 ? "rgba(170,150,120,0.28)" : "rgba(120,135,150,0.3)";
          g.fillRect(x, y, w, 10);
          x += w + 2;
        }
      }
    }
    g.restore();
    g.strokeStyle = "rgba(20,22,24,0.9)";
    g.lineWidth = 3;
    g.strokeRect(r.x, r.y, r.w, r.h);

    // block name, on one or two lines
    const words = blocks[i].toUpperCase().split(" ");
    const fit = (lines: string[], size: number) => {
      g.font = `600 ${size}px ${fonts.mono}`;
      return lines.every((l) => g.measureText(l).width <= r.w * 0.84) && lines.length * size * 1.15 <= r.h * 0.8;
    };
    let lines = [words.join(" ")];
    let size = Math.min(r.h * 0.22, 64);
    while (!fit(lines, size) && size > 22) size -= 2;
    if (!fit(lines, size) && words.length > 1) {
      const half = Math.ceil(words.length / 2);
      lines = [words.slice(0, half).join(" "), words.slice(half).join(" ")];
      size = Math.min(r.h * 0.2, 56);
      while (!fit(lines, size) && size > 14) size -= 2;
    }
    while (!fit(lines, size) && size > 12) size -= 1;
    g.font = `600 ${size}px ${fonts.mono}`;
    const tw = Math.max(...lines.map((l) => g.measureText(l).width));
    const th = lines.length * size * 1.15;
    g.fillStyle = "rgba(10,12,14,0.72)";
    g.fillRect(r.x + r.w / 2 - tw / 2 - size * 0.3, r.y + r.h / 2 - th / 2 - size * 0.2, tw + size * 0.6, th + size * 0.4);
    g.fillStyle = "#e9e4d4";
    g.textAlign = "center";
    g.textBaseline = "middle";
    lines.forEach((l, k) => {
      g.fillText(l, r.x + r.w / 2, r.y + r.h / 2 + (k - (lines.length - 1) / 2) * size * 1.15 + size * 0.04);
    });
  });

  return c;
}

/** PVC sleeve of a radial electrolytic. u = 0.5 faces the camera once offset */
export function capacitorSleeve(fonts: Fonts, big: string, mid: string, small: string, heightOverCirc: number) {
  const W = 1024;
  const H = Math.max(64, Math.round(W * heightOverCirc));
  const c = canvas(W, H);
  const g = c.getContext("2d")!;
  g.fillStyle = "#121517";
  g.fillRect(0, 0, W, H);
  // polarity stripe, centred at u = 0.25 (ends up on the negative lead)
  const sw = W * 0.2;
  g.fillStyle = "#8d9296";
  g.fillRect(W * 0.25 - sw / 2, 0, sw, H);
  g.fillStyle = "#121517";
  g.font = `600 ${W * 0.05}px ${fonts.mono}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let y = W * 0.06; y < H; y += W * 0.1) g.fillRect(W * 0.25 - W * 0.022, y - 4, W * 0.044, 8);

  g.fillStyle = "#e1bd6a";
  const cx = W * 0.5;
  const lineH = Math.min(H / 3, W * 0.08);
  const y0 = H / 2 - lineH * 0.85;
  g.font = `700 ${lineH}px ${fonts.display}`;
  g.fillText(big, cx, y0);
  g.font = `600 ${lineH * 0.74}px ${fonts.mono}`;
  g.fillText(mid, cx, y0 + lineH * 1.05);
  g.font = `500 ${lineH * 0.56}px ${fonts.mono}`;
  g.fillStyle = "rgba(225,189,106,0.75)";
  g.fillText(small, cx, y0 + lineH * 1.85);
  // wrap seam band
  g.fillStyle = "#0c0e10";
  g.fillRect(0, 0, W, 3);
  g.fillRect(0, H - 3, W, 3);
  return c;
}

/** aluminium top with the vent score */
export function capacitorTop() {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(S * 0.42, S * 0.38, 4, S / 2, S / 2, S / 2);
  grad.addColorStop(0, "#d7dbde");
  grad.addColorStop(1, "#aab0b4");
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  // machining rings
  g.strokeStyle = "rgba(90,96,100,0.12)";
  for (let r = 8; r < S / 2; r += 5) {
    g.beginPath();
    g.arc(S / 2, S / 2, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = "rgba(40,44,48,0.8)";
  g.lineWidth = 7;
  g.lineCap = "round";
  const k = S * 0.3;
  g.beginPath();
  g.moveTo(S / 2 - k, S / 2);
  g.lineTo(S / 2 + k, S / 2);
  g.moveTo(S / 2, S / 2 - k);
  g.lineTo(S / 2, S / 2 + k);
  g.stroke();
  return c;
}

/** stainless can top of an HC-49 crystal, engraved */
export function crystalTop(fonts: Fonts, lines: [string, string]) {
  const W = 1024;
  const H = 400;
  const c = canvas(W, H);
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, W, H);
  g.fillStyle = "rgba(38,42,46,0.78)";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `600 ${H * 0.27}px ${fonts.mono}`;
  tracked(g, lines[0], W / 2, H * 0.36, 4);
  g.font = `500 ${H * 0.2}px ${fonts.mono}`;
  tracked(g, lines[1], W / 2, H * 0.7, 8);
  return c;
}

const BAND: Record<string, string> = {
  black: "#141414",
  brown: "#6b3a1c",
  red: "#c0262d",
  orange: "#e0701c",
  yellow: "#e8c21c",
  green: "#2f8f3a",
  blue: "#2757b8",
  violet: "#6d3a9c",
  gray: "#8a8a8a",
  white: "#f0f0f0",
  gold: "#c9a24a",
  silver: "#b8bcc0",
};

/** colour bands along v for an axial resistor body */
export function resistorBands(bands: string[], body: string) {
  const W = 64;
  const H = 512;
  const c = canvas(W, H);
  const g = c.getContext("2d")!;
  g.fillStyle = body;
  g.fillRect(0, 0, W, H);
  const n = bands.length;
  const start = 0.2;
  const end = 0.8;
  const bw = H * 0.055;
  bands.forEach((b, i) => {
    const t = i === n - 1 ? 0.84 : start + ((end - start - 0.1) * i) / Math.max(1, n - 2);
    g.fillStyle = BAND[b] ?? "#000";
    g.fillRect(0, H * t - bw / 2, W, bw);
  });
  return c;
}

/** soft pool of light an LED throws onto the mask */
export function ledSpill() {
  const S = 128;
  const c = canvas(S, S);
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return c;
}
