export type Pt = [number, number];

export function dist(a: Pt, b: Pt) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function clamp(v: number, lo = 0, hi = 1) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function smoothstep(t: number) {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
}

export function easeOutCubic(t: number) {
  const x = clamp(t);
  return 1 - Math.pow(1 - x, 3);
}

export function easeInOutCubic(t: number) {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** frame-rate independent exponential approach */
export function damp(current: number, target: number, rate: number, dt: number) {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

/**
 * Cuts every interior corner of an orthogonal polyline to 45°,
 * the way an interactive router lays copper.
 */
export function chamfer(points: Pt[], size: number): Pt[] {
  if (points.length < 3) return points.slice();
  const out: Pt[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i - 1];
    const c = points[i];
    const n = points[i + 1];
    const inLen = dist(p, c);
    const outLen = dist(c, n);
    const k = Math.max(0, Math.min(size, inLen / 2, outLen / 2));
    if (k < 1e-6) {
      out.push(c);
      continue;
    }
    out.push([c[0] - ((c[0] - p[0]) / inLen) * k, c[1] - ((c[1] - p[1]) / inLen) * k]);
    out.push([c[0] + ((n[0] - c[0]) / outLen) * k, c[1] + ((n[1] - c[1]) / outLen) * k]);
  }
  out.push(points[points.length - 1]);
  return out;
}

export function polylineLength(points: Pt[]) {
  let l = 0;
  for (let i = 1; i < points.length; i++) l += dist(points[i - 1], points[i]);
  return l;
}

/** point and unit tangent at arc length s along a polyline */
export function samplePolyline(points: Pt[], s: number): { p: Pt; t: Pt } {
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const l = dist(a, b);
    if (acc + l >= s || i === points.length - 1) {
      const u = l > 0 ? clamp((s - acc) / l) : 0;
      return {
        p: [lerp(a[0], b[0], u), lerp(a[1], b[1], u)],
        t: l > 0 ? [(b[0] - a[0]) / l, (b[1] - a[1]) / l] : [1, 0],
      };
    }
    acc += l;
  }
  return { p: points[0], t: [1, 0] };
}

/** deterministic PRNG so the board is the same on every visit */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
