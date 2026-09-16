import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { certs, jobs, projects, studies, type LedColor } from "@/data/portfolio";
import { BOARD, PKG, partByRef, type Part, type PkgGeom } from "./layout";
import type { Fonts } from "./labels";
import {
  capacitorSleeve,
  capacitorTop,
  chipMarking,
  crystalTop,
  dieFloorplan,
  ledSpill,
  resistorBands,
} from "./partTextures";
import { clamp, damp } from "./geometry";

export interface PartModel {
  part: Part;
  /** positioned on its footprint, drops in while the net arrives */
  root: THREE.Group;
  hits: THREE.Object3D[];
  /** 0..1 selection animation target */
  active: boolean;
  update(dt: number, time: number): void;
  /** LEDs only */
  lit?: number;
  toggle?(): void;
  press?(): void;
}

export interface Shared {
  epoxy: THREE.MeshStandardMaterial;
  tin: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  hit: THREE.MeshBasicMaterial;
  fonts: Fonts;
  anisotropy: number;
  textures: THREE.Texture[];
}

export const LED_HUE: Record<LedColor, number> = {
  green: 0x39e27e,
  amber: 0xffa51f,
  blue: 0x3f9dff,
  white: 0xf4f8ff,
};

export function createShared(fonts: Fonts, anisotropy: number): Shared {
  return {
    epoxy: new THREE.MeshStandardMaterial({ color: 0x121415, roughness: 0.72, metalness: 0 }),
    tin: new THREE.MeshStandardMaterial({ color: 0xd9dddd, roughness: 0.3, metalness: 1 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe6bd62, roughness: 0.22, metalness: 1 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc8cdd1, roughness: 0.26, metalness: 1 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0b0d0e, roughness: 0.8, metalness: 0 }),
    hit: new THREE.MeshBasicMaterial({ visible: false }),
    fonts,
    anisotropy,
    textures: [],
  };
}

function tex(s: Shared, canvas: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = s.anisotropy;
  s.textures.push(t);
  return t;
}

function hitBox(s: Shared, w: number, h: number, d: number, y = h / 2) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), s.hit);
  m.position.y = y;
  return m;
}

/** local position of a part on the board group (top surface at y = t/2) */
export function boardToLocal(x: number, y: number, lift = 0) {
  return new THREE.Vector3(x - BOARD.w / 2, BOARD.t / 2 + lift, y - BOARD.h / 2);
}

/* ------------------------------------------------------------ gull-wing lead */

function gullWing(out: number, rise: number, width: number, thick = 0.13): THREE.BufferGeometry {
  // side profile in XY, extruded along Z by the lead width
  const s = new THREE.Shape();
  const foot = Math.min(0.55, out * 0.5);
  const bend = out - foot;
  s.moveTo(-0.1, rise);
  s.lineTo(bend * 0.35, rise);
  s.quadraticCurveTo(bend * 0.62, rise, bend * 0.72, rise * 0.5);
  s.quadraticCurveTo(bend * 0.84, 0, bend + 0.05, 0);
  s.lineTo(out, 0);
  s.lineTo(out, thick);
  s.lineTo(bend + 0.05, thick);
  s.quadraticCurveTo(bend * 0.84 + thick, thick, bend * 0.72 + thick * 0.7, rise * 0.5 + thick * 0.3);
  s.quadraticCurveTo(bend * 0.62 + thick * 0.2, rise + thick, bend * 0.35, rise + thick);
  s.lineTo(-0.1, rise + thick);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false, curveSegments: 5 });
  g.translate(0, 0, -width / 2);
  return g;
}

/* ------------------------------------------------------------------- chips */

function defaultMarking(name: string, year: string): [string, string] {
  const words = name.split(/[\s·]+/).filter(Boolean).map((w) => w.toUpperCase());
  const first = words.shift() ?? "";
  return [first.slice(0, 10), (words.join(" ") || year).slice(0, 10)];
}

function buildChip(s: Shared, part: Part): PartModel {
  const pr = projects[part.index];
  const g: PkgGeom = PKG[part.pkg!];
  const marking = pr.marking ?? defaultMarking(pr.name, pr.year);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const standoff = g.kind === "qfp" || g.kind === "soic" ? 0.1 : g.kind === "bga" ? 0.3 : 0.02;
  const baseH = g.kind === "bga" ? 0.36 : g.h * 0.42;
  const lidH = g.kind === "bga" ? g.h - 0.36 : g.h - baseH;
  const inset = g.kind === "bga" ? 0.7 : 0;

  // lower half (or BGA laminate)
  const baseMat =
    g.kind === "bga"
      ? new THREE.MeshStandardMaterial({ color: 0x3a3f2a, roughness: 0.55, metalness: 0.05 })
      : s.epoxy;
  const base = new THREE.Mesh(
    g.kind === "bga"
      ? new THREE.BoxGeometry(g.bx, baseH, g.by)
      : new RoundedBoxGeometry(g.bx, baseH, g.by, 2, Math.min(0.12, baseH * 0.3)),
    baseMat,
  );
  base.position.y = standoff + baseH / 2;
  base.castShadow = true;
  base.receiveShadow = true;
  body.add(base);

  // die, bond wires and lead frame inside
  const dieSize = Math.min(g.bx, g.by) * (g.kind === "soic" ? 0.55 : 0.46);
  const dieTex = tex(s, dieFloorplan(s.fonts, pr.stack, 31 * part.index + 7));
  const die = new THREE.Mesh(
    new THREE.BoxGeometry(dieSize, 0.06, dieSize * (g.kind === "soic" ? Math.min(1.6, g.by / g.bx) : 1)),
    [
      s.dark,
      s.dark,
      new THREE.MeshStandardMaterial({ map: dieTex, roughness: 0.28, metalness: 0.55 }),
      s.dark,
      s.dark,
      s.dark,
    ],
  );
  const inner = standoff + baseH + 0.03;
  die.position.y = inner;
  body.add(die);

  if (g.kind !== "bga") {
    const paddle = new THREE.Mesh(
      new THREE.BoxGeometry(dieSize * 1.18, 0.02, dieSize * 1.18 * (g.kind === "soic" ? 1.5 : 1)),
      new THREE.MeshStandardMaterial({ color: 0xb98b56, roughness: 0.35, metalness: 1 }),
    );
    paddle.position.y = inner - 0.035;
    body.add(paddle);
  }

  const wires: THREE.BufferGeometry[] = [];
  {
    const dz = die.geometry.parameters.depth / 2;
    const dx = dieSize / 2;
    const sides = g.kind === "soic" ? [0, 2] : [0, 1, 2, 3];
    const per = g.kind === "soic" ? 6 : 8;
    for (const side of sides) {
      for (let i = 0; i < per; i++) {
        const t = (i + 0.5) / per - 0.5;
        const along = side % 2 === 0 ? dz : dx;
        const a = new THREE.Vector3();
        const b = new THREE.Vector3();
        const frameX = g.bx / 2 - 0.35;
        const frameZ = g.by / 2 - 0.35;
        if (side === 0) {
          a.set(dx - 0.1, inner + 0.03, t * along * 1.7);
          b.set(frameX, inner - 0.02, t * frameZ * 1.6);
        } else if (side === 2) {
          a.set(-dx + 0.1, inner + 0.03, t * along * 1.7);
          b.set(-frameX, inner - 0.02, t * frameZ * 1.6);
        } else if (side === 1) {
          a.set(t * along * 1.7, inner + 0.03, dz - 0.1);
          b.set(t * frameX * 1.6, inner - 0.02, frameZ);
        } else {
          a.set(t * along * 1.7, inner + 0.03, -dz + 0.1);
          b.set(t * frameX * 1.6, inner - 0.02, -frameZ);
        }
        const mid = a.clone().lerp(b, 0.35);
        mid.y = inner + 0.32;
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        wires.push(new THREE.TubeGeometry(curve, 10, 0.018, 4, false));
      }
    }
  }
  const wireMesh = new THREE.Mesh(mergeGeometries(wires), s.gold);
  wires.forEach((w) => w.dispose());
  body.add(wireMesh);

  // lid: the part of the mould that lifts off
  // hinged at the far edge so the lid opens away from the camera
  const lid = new THREE.Group();
  const lidInner = new THREE.Group();
  lid.add(lidInner);
  const lidMesh = new THREE.Mesh(
    new RoundedBoxGeometry(g.bx - inset * 2, lidH, g.by - inset * 2, 2, Math.min(0.2, lidH * 0.3)),
    s.epoxy,
  );
  lidMesh.castShadow = true;
  lidInner.add(lidMesh);
  const markTex = tex(
    s,
    chipMarking(
      s.fonts,
      [marking[0], marking[1], `${pr.year} ${part.ref}`],
      (g.by - inset * 2) / (g.bx - inset * 2),
      g.kind === "soic",
    ),
  );
  const mark = new THREE.Mesh(
    new THREE.PlaneGeometry(g.bx - inset * 2 - 0.2, g.by - inset * 2 - 0.2),
    new THREE.MeshStandardMaterial({
      map: markTex,
      transparent: true,
      roughness: 0.9,
      metalness: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
  );
  mark.rotation.x = -Math.PI / 2;
  mark.position.y = lidH / 2 + 0.02;
  lidInner.add(mark);
  const hinge = (g.by - inset * 2) / 2;
  const lidRest = standoff + baseH;
  lidInner.position.set(0, lidH / 2, hinge);
  lid.position.set(0, lidRest, -hinge);
  body.add(lid);

  // leads
  if (g.kind === "qfp" || g.kind === "soic") {
    const out = (g.span - (g.kind === "soic" ? g.bx : g.bx)) / 2;
    const rise = standoff + baseH - 0.06;
    const geo = gullWing(out + 0.02, rise, g.pitch * 0.46);
    const per = g.kind === "soic" ? g.pins / 2 : g.pins / 4;
    const sides = g.kind === "soic" ? [0, 2] : [0, 1, 2, 3];
    const leads = new THREE.InstancedMesh(geo, s.tin, per * sides.length);
    leads.castShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    let k = 0;
    for (const side of sides) {
      for (let i = 0; i < per; i++) {
        const o = (i - (per - 1) / 2) * g.pitch;
        const angle = (side * Math.PI) / 2;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
        const edge = (side % 2 === 0 ? g.bx : g.by) / 2 - 0.02;
        const pos =
          side === 0
            ? new THREE.Vector3(edge, 0, o)
            : side === 1
              ? new THREE.Vector3(o, 0, -edge)
              : side === 2
                ? new THREE.Vector3(-edge, 0, -o)
                : new THREE.Vector3(-o, 0, edge);
        m.compose(pos, q, one);
        leads.setMatrixAt(k++, m);
      }
    }
    body.add(leads);
  } else if (g.kind === "qfn") {
    const per = g.pins / 4;
    const term = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.2, g.pitch * 0.5), s.tin, per * 4);
    const m = new THREE.Matrix4();
    let k = 0;
    for (let side = 0; side < 4; side++)
      for (let i = 0; i < per; i++) {
        const o = (i - (per - 1) / 2) * g.pitch;
        const e = g.bx / 2 - 0.18;
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (side * Math.PI) / 2);
        const p = new THREE.Vector3(e, 0.1, o).applyQuaternion(q);
        m.compose(p, q, new THREE.Vector3(1, 1, 1));
        term.setMatrixAt(k++, m);
      }
    body.add(term);
  } else {
    const n = Math.round(Math.sqrt(g.pins));
    const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 10, 8), s.tin, (n - 1) * 4);
    const m = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (i !== 0 && j !== 0 && i !== n - 1 && j !== n - 1) continue;
        m.makeTranslation((i - (n - 1) / 2) * g.pitch, 0.18, (j - (n - 1) / 2) * g.pitch);
        if (k < balls.count) balls.setMatrixAt(k++, m);
      }
    body.add(balls);
  }

  const hit = hitBox(s, part.court[0], g.h + 1.2, part.court[1]);
  root.add(hit);

  const model: PartModel = {
    part,
    root,
    hits: [hit],
    active: false,
    update(dt) {
      const k = damp(lid.userData.k ?? 0, model.active ? 1 : 0, 5.5, dt);
      lid.userData.k = k;
      lid.position.y = lidRest + k * (0.6 + g.h);
      lid.position.z = -hinge - k * 0.4;
      lid.rotation.x = -k * 1.95;
    },
  };
  return model;
}

/* -------------------------------------------------------------- capacitors */

function buildCapacitor(s: Shared, part: Part): PartModel {
  const job = jobs[part.index];
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  const r = 4;
  const H = part.height;
  const standoff = 0.35;

  const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x131618, roughness: 0.42, metalness: 0 });
  // shoulder with the rolled groove
  const shoulder = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.001, standoff),
      new THREE.Vector2(r - 0.4, standoff),
      new THREE.Vector2(r - 0.05, standoff + 0.2),
      new THREE.Vector2(r, standoff + 0.6),
      new THREE.Vector2(r, standoff + 1.1),
      new THREE.Vector2(r - 0.32, standoff + 1.35),
      new THREE.Vector2(r - 0.32, standoff + 1.55),
      new THREE.Vector2(r, standoff + 1.8),
    ],
    64,
  );
  const sh = new THREE.Mesh(shoulder, sleeveMat);
  sh.castShadow = true;
  spin.add(sh);

  const bandH = H - standoff - 1.8 - 0.45;
  const sleeveTex = tex(
    s,
    capacitorSleeve(
      s.fonts,
      job.sleeve,
      job.end === null ? `${job.start}–HOY` : job.end === job.start ? `${job.start}` : `${job.start}–${job.end}`,
      part.ref,
      bandH / (2 * Math.PI * r),
    ),
  );
  sleeveTex.wrapS = THREE.RepeatWrapping;
  sleeveTex.offset.x = 0.5;
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, bandH, 72, 1, true),
    new THREE.MeshStandardMaterial({ map: sleeveTex, roughness: 0.38, metalness: 0 }),
  );
  band.position.y = standoff + 1.8 + bandH / 2;
  band.castShadow = true;
  spin.add(band);

  // sleeve rolled over the top edge
  const rim = new THREE.LatheGeometry(
    [
      new THREE.Vector2(r, 0),
      new THREE.Vector2(r, 0.2),
      new THREE.Vector2(r - 0.12, 0.4),
      new THREE.Vector2(r - 0.5, 0.45),
      new THREE.Vector2(r - 0.62, 0.42),
    ],
    64,
  );
  const rimMesh = new THREE.Mesh(rim, sleeveMat);
  rimMesh.position.y = H - 0.45;
  spin.add(rimMesh);

  const topTex = tex(s, capacitorTop());
  const top = new THREE.Mesh(
    new THREE.CircleGeometry(r - 0.58, 48),
    new THREE.MeshStandardMaterial({ map: topTex, bumpMap: topTex, bumpScale: 0.6, roughness: 0.34, metalness: 1 }),
  );
  top.rotation.x = -Math.PI / 2;
  top.position.y = H - 0.05;
  spin.add(top);

  const hit = hitBox(s, 8.4, H + 1, 8.4);
  root.add(hit);

  const model: PartModel = {
    part,
    root,
    hits: [hit],
    active: false,
    update(dt) {
      const k = damp(spin.userData.k ?? 0, model.active ? 1 : 0, 4, dt);
      spin.userData.k = k;
      spin.position.y = k * 2.5;
      if (model.active) spin.rotation.y += dt * 0.9;
      else spin.rotation.y = damp(spin.rotation.y, Math.round(spin.rotation.y / (Math.PI * 2)) * Math.PI * 2, 3, dt);
    },
  };
  return model;
}

/* ---------------------------------------------------------------- crystals */

function buildCrystal(s: Shared, part: Part): PartModel {
  const st = studies[part.index];
  const root = new THREE.Group();
  const lift = new THREE.Group();
  root.add(lift);
  const L = 10.8;
  const W = 4.4;
  const H = 3.4;
  const shape = new THREE.Shape();
  const rr = W / 2;
  shape.moveTo(-L / 2 + rr, -W / 2);
  shape.lineTo(L / 2 - rr, -W / 2);
  shape.absarc(L / 2 - rr, 0, rr, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-L / 2 + rr, W / 2);
  shape.absarc(-L / 2 + rr, 0, rr, Math.PI / 2, (Math.PI * 3) / 2, false);
  const can = new THREE.ExtrudeGeometry(shape, {
    depth: H - 0.5,
    bevelEnabled: true,
    bevelThickness: 0.25,
    bevelSize: 0.22,
    bevelSegments: 4,
    curveSegments: 24,
  });
  can.rotateX(-Math.PI / 2);
  can.translate(0, 0.45, 0);
  const canMesh = new THREE.Mesh(can, s.steel);
  canMesh.castShadow = true;
  lift.add(canMesh);

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(L - 0.8, 0.3, W - 0.4),
    new THREE.MeshStandardMaterial({ color: 0x2b2e2c, roughness: 0.7 }),
  );
  base.position.y = 0.2;
  lift.add(base);

  const engr = tex(s, crystalTop(s.fonts, st.marking));
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(L - 2.2, W - 0.6),
    new THREE.MeshStandardMaterial({
      map: engr,
      transparent: true,
      roughness: 0.7,
      metalness: 0.3,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
  );
  label.rotation.x = -Math.PI / 2;
  label.position.y = H + 0.25;
  lift.add(label);

  const hit = hitBox(s, 12, H + 1.5, 5.4);
  root.add(hit);

  const model: PartModel = {
    part,
    root,
    hits: [hit],
    active: false,
    update(dt) {
      const k = damp(lift.userData.k ?? 0, model.active ? 1 : 0, 5, dt);
      lift.userData.k = k;
      lift.position.y = k * 6;
      lift.rotation.x = k * 0.8;
    },
  };
  return model;
}

/* --------------------------------------------------------------- resistors */

function buildResistor(s: Shared, part: Part): PartModel {
  const c = certs[part.index];
  const root = new THREE.Group();
  const roll = new THREE.Group();
  root.add(roll);
  const len = 6.3;
  const y = 1.45;
  const profile: THREE.Vector2[] = [];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const yy = -len / 2 + t * len;
    const end = Math.min(t, 1 - t);
    let rad = 1.02;
    if (end < 0.2) rad = 1.02 + Math.sin((end / 0.2) * Math.PI) * 0.2;
    if (end < 0.03) rad *= end / 0.03;
    profile.push(new THREE.Vector2(Math.max(0.001, rad), yy));
  }
  const geo = new THREE.LatheGeometry(profile, 40);
  // uv.y proportional to length so the bands land where they are drawn
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setY(i, (pos.getY(i) + len / 2) / len);
  geo.rotateZ(Math.PI / 2);
  const five = c.bands.length === 5;
  const bandTex = tex(s, resistorBands(c.bands, five ? "#3f7cc6" : "#d8c393"));
  const bodyMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: bandTex, roughness: 0.45 }));
  bodyMesh.castShadow = true;
  bodyMesh.position.y = y;
  roll.add(bodyMesh);

  const pitch = 10.16;
  const legs: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const path = new THREE.CurvePath<THREE.Vector3>();
    const a = new THREE.Vector3((sx * len) / 2 - sx * 0.1, y, 0);
    const b = new THREE.Vector3(sx * (pitch / 2 - 0.9), y, 0);
    const cc = new THREE.Vector3(sx * (pitch / 2), y, 0);
    const d = new THREE.Vector3(sx * (pitch / 2), y - 0.9, 0);
    const e = new THREE.Vector3(sx * (pitch / 2), -0.6, 0);
    path.add(new THREE.LineCurve3(a, b));
    path.add(new THREE.QuadraticBezierCurve3(b, cc, d));
    path.add(new THREE.LineCurve3(d, e));
    legs.push(new THREE.TubeGeometry(path, 24, 0.3, 8, false));
  }
  const legMesh = new THREE.Mesh(mergeGeometries(legs), s.tin);
  legs.forEach((l) => l.dispose());
  legMesh.castShadow = true;
  root.add(legMesh);

  const hit = hitBox(s, 12, 3.4, 3.4);
  root.add(hit);

  const model: PartModel = {
    part,
    root,
    hits: [hit],
    active: false,
    update(dt) {
      const k = damp(roll.userData.k ?? 0, model.active ? 1 : 0, 4, dt);
      roll.userData.k = k;
      roll.position.y = k * 3;
      if (model.active) bodyMesh.rotation.x += dt * 1.2;
      legMesh.position.y = 0;
    },
  };
  return model;
}

/* -------------------------------------------------------------------- LEDs */

let spillTexture: THREE.Texture | null = null;

function buildLed(s: Shared, part: Part): PartModel {
  const root = new THREE.Group();
  const hue = new THREE.Color(LED_HUE[part.color ?? "green"]);
  const clear = part.color === "white";
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: clear ? new THREE.Color(0xe8eef0) : hue.clone().multiplyScalar(0.55),
    roughness: 0.18,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    transparent: true,
    opacity: clear ? 0.55 : 0.9,
    emissive: hue,
    emissiveIntensity: 0,
  });
  const profile = [
    new THREE.Vector2(0.001, 0.9),
    new THREE.Vector2(1.95, 0.9),
    new THREE.Vector2(1.95, 1.9),
    new THREE.Vector2(1.52, 1.9),
    new THREE.Vector2(1.52, 3.8),
  ];
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    profile.push(new THREE.Vector2(Math.max(0.001, Math.cos(a) * 1.52), 3.8 + Math.sin(a) * 1.5));
  }
  const lens = new THREE.Mesh(new THREE.LatheGeometry(profile, 36), lensMat);
  lens.castShadow = true;
  root.add(lens);

  // anvil and post inside the lens
  const inner = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.25), s.tin);
  inner.position.set(-0.35, 2.2, 0);
  root.add(inner);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.4, 0.45), s.tin);
  legs.position.set(1.27, 0.3, 0);
  const legs2 = legs.clone();
  legs2.position.x = -1.27;
  root.add(legs, legs2);

  if (!spillTexture) {
    spillTexture = new THREE.CanvasTexture(ledSpill());
    s.textures.push(spillTexture);
  }
  const spillMat = new THREE.MeshBasicMaterial({
    map: spillTexture,
    color: hue,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), spillMat);
  spill.rotation.x = -Math.PI / 2;
  spill.position.y = 0.03;
  root.add(spill);

  const hit = hitBox(s, 5, 6, 5);
  root.add(hit);

  let want = 1;
  const model: PartModel = {
    part,
    root,
    hits: part.interactive ? [hit] : [],
    active: false,
    lit: 0,
    toggle() {
      want = want > 0 ? 0 : 1;
    },
    update(dt, time) {
      const powered = root.userData.powered as number | undefined;
      let target = want * (powered ?? 1);
      if (model.active) target = 0.35 + 0.65 * (Math.floor(time * 2.4) % 2);
      model.lit = damp(model.lit ?? 0, target, 14, dt);
      const l = model.lit;
      lensMat.emissiveIntensity = l * (clear ? 0.9 : 1.25);
      lensMat.opacity = clear ? 0.55 + l * 0.35 : 0.9;
      spillMat.opacity = l * 0.5;
    },
  };
  return model;
}

/* ------------------------------------------------------------------- USB-C */

function buildUsbC(s: Shared, part: Part): PartModel {
  const root = new THREE.Group();
  const w = 8.94;
  const h = 3.26;
  const outer = new THREE.Shape();
  const r = h / 2;
  outer.moveTo(-w / 2 + r, -h / 2);
  outer.lineTo(w / 2 - r, -h / 2);
  outer.absarc(w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2, false);
  outer.lineTo(-w / 2 + r, h / 2);
  outer.absarc(-w / 2 + r, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
  const hole = new THREE.Path();
  const iw = w - 0.5;
  const ih = h - 0.5;
  const ir = ih / 2;
  hole.moveTo(-iw / 2 + ir, -ih / 2);
  hole.lineTo(iw / 2 - ir, -ih / 2);
  hole.absarc(iw / 2 - ir, 0, ir, -Math.PI / 2, Math.PI / 2, false);
  hole.lineTo(-iw / 2 + ir, ih / 2);
  hole.absarc(-iw / 2 + ir, 0, ir, Math.PI / 2, (Math.PI * 3) / 2, false);
  outer.holes.push(hole);
  const depth = 7.3;
  const shell = new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 16 });
  shell.translate(0, 0, -depth / 2);
  shell.rotateY(Math.PI / 2);
  const shellMesh = new THREE.Mesh(shell, s.steel);
  shellMesh.position.y = h / 2;
  shellMesh.castShadow = true;
  root.add(shellMesh);

  const back = new THREE.Mesh(new THREE.BoxGeometry(0.3, h - 0.3, w - 0.3), s.steel);
  back.position.set(depth / 2 - 0.2, h / 2, 0);
  root.add(back);
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(depth - 1.4, 0.7, 6.6), s.dark);
  tongue.position.set(0.5, h / 2, 0);
  root.add(tongue);
  const contacts = new THREE.Mesh(new THREE.BoxGeometry(depth - 2.2, 0.72, 5.6), s.gold);
  contacts.position.set(0.1, h / 2, 0);
  contacts.scale.set(1, 1, 1);
  root.add(contacts);

  const hit = hitBox(s, 8.4, h + 1, 9.6);
  root.add(hit);
  return { part, root, hits: [hit], active: false, update() {} };
}

/* ------------------------------------------------------------------ switch */

function buildSwitch(s: Shared, part: Part): PartModel {
  const root = new THREE.Group();
  const base = new THREE.Mesh(new RoundedBoxGeometry(6, 3.3, 6, 2, 0.15), s.epoxy);
  base.position.y = 1.65;
  base.castShadow = true;
  root.add(base);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.15, 6.1), s.steel);
  plate.position.y = 3.35;
  root.add(plate);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 1.1, 32), s.epoxy);
  cap.position.y = 3.9;
  cap.castShadow = true;
  root.add(cap);
  const hit = hitBox(s, 7, 5.5, 7);
  root.add(hit);
  let pressT = -1;
  const model: PartModel = {
    part,
    root,
    hits: [hit],
    active: false,
    press() {
      pressT = 0;
    },
    update(dt) {
      if (pressT < 0) return;
      pressT += dt;
      const k = pressT < 0.12 ? pressT / 0.12 : Math.max(0, 1 - (pressT - 0.2) / 0.15);
      cap.position.y = 3.9 - clamp(k) * 0.45;
      if (pressT > 0.4) pressT = -1;
    },
  };
  return model;
}

/* ---------------------------------------------------------------- terminal */

export interface TerminalModel extends PartModel {
  screws: THREE.Object3D[];
  turn(i: number): void;
}

function buildTerminal(s: Shared, part: Part): TerminalModel {
  const root = new THREE.Group();
  const pitch = 5.08;
  const n = 4;
  const len = pitch * n;
  const plastic = new THREE.MeshStandardMaterial({ color: 0x1f5e9c, roughness: 0.55, metalness: 0 });
  const profile = new THREE.Shape();
  // side profile in (z, y): wire entries face +z, towards the camera
  profile.moveTo(-3.9, 0);
  profile.lineTo(3.9, 0);
  profile.lineTo(3.9, 6.2);
  profile.lineTo(2.2, 6.2);
  profile.lineTo(1.4, 10);
  profile.lineTo(-3.9, 10);
  profile.closePath();
  const body = new THREE.ExtrudeGeometry(profile, { depth: len, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2 });
  body.translate(0, 0, -len / 2);
  body.rotateY(-Math.PI / 2);
  const bodyMesh = new THREE.Mesh(body, plastic);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  root.add(bodyMesh);

  const screws: THREE.Object3D[] = [];
  const hits: THREE.Object3D[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * pitch;
    // wire entry
    const entry = new THREE.Mesh(new THREE.BoxGeometry(3.3, 3.1, 0.4), s.dark);
    entry.position.set(x, 2.8, 3.92);
    root.add(entry);
    const clampPlate = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.2), s.tin);
    clampPlate.position.set(x, 3.9, 3.85);
    root.add(clampPlate);
    // recess + screw
    const well = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.3, 28), s.dark);
    well.position.set(x, 10.02, -1.4);
    root.add(well);
    const screw = new THREE.Group();
    const headGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.8, 28);
    const head = new THREE.Mesh(headGeo, s.tin);
    head.castShadow = true;
    screw.add(head);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 0.42), s.dark);
    slot.position.y = 0.3;
    screw.add(slot);
    screw.position.set(x, 9.8, -1.4);
    screw.rotation.y = 0.3 + i * 0.7;
    root.add(screw);
    screws.push(screw);
    const hit = hitBox(s, 4.6, 3, 5, 9.6);
    hit.position.x = x;
    hit.userData.pin = i;
    root.add(hit);
    hits.push(hit);
  }
  const turns = [0, 0, 0, 0];
  const model: TerminalModel = {
    part,
    root,
    hits,
    screws,
    active: false,
    turn(i) {
      turns[i] += Math.PI / 2;
    },
    update(dt) {
      screws.forEach((sc, i) => {
        const target = 0.3 + i * 0.7 + turns[i];
        sc.rotation.y = damp(sc.rotation.y, target, 8, dt);
      });
    },
  };
  return model;
}

/* ---------------------------------------------------------------- passives */

export function buildPassives(s: Shared, list: { x: number; y: number; vertical: boolean; type: "c" | "r" }[]) {
  const caps = list.filter((p) => p.type === "c");
  const res = list.filter((p) => p.type === "r");
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xc2ab7c, roughness: 0.6 });
  const capMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.78, 0.8), ceramic, caps.length);
  const resMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.45, 0.8), s.epoxy, res.length);
  const termMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.8, 0.82), s.tin, list.length * 2);
  capMesh.castShadow = resMesh.castShadow = termMesh.castShadow = true;
  const place = (lift: number[]) => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let ci = 0;
    let ri = 0;
    list.forEach((p, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.vertical ? Math.PI / 2 : 0);
      const h = p.type === "c" ? 0.78 : 0.45;
      const base = boardToLocal(p.x, p.y, lift[i]);
      const hide = lift[i] > 30 ? 0.0001 : 1;
      const sc = new THREE.Vector3(hide, hide, hide);
      m.compose(base.clone().setY(base.y + h / 2), q, sc);
      if (p.type === "c") capMesh.setMatrixAt(ci++, m);
      else resMesh.setMatrixAt(ri++, m);
      for (const sx of [-1, 1]) {
        const off = new THREE.Vector3(sx * 0.65, 0, 0).applyQuaternion(q);
        m.compose(base.clone().add(off).setY(base.y + 0.4), q, sc);
        termMesh.setMatrixAt(i * 2 + (sx > 0 ? 1 : 0), m);
      }
    });
    capMesh.instanceMatrix.needsUpdate = true;
    resMesh.instanceMatrix.needsUpdate = true;
    termMesh.instanceMatrix.needsUpdate = true;
  };
  const group = new THREE.Group();
  group.add(capMesh, resMesh, termMesh);
  return { group, place, meshes: [capMesh, resMesh, termMesh] };
}

/* --------------------------------------------------------------- factories */

export function buildPart(s: Shared, part: Part): PartModel {
  const builders: Record<Part["kind"], (s: Shared, p: Part) => PartModel> = {
    chip: buildChip,
    capacitor: buildCapacitor,
    crystal: buildCrystal,
    resistor: buildResistor,
    led: buildLed,
    usbc: buildUsbC,
    switch: buildSwitch,
    terminal: buildTerminal,
  };
  const m = builders[part.kind](s, part);
  m.root.position.copy(boardToLocal(part.x, part.y));
  m.root.traverse((o) => {
    o.userData.ref = part.ref;
  });
  return m;
}

export function partRef(ref: string) {
  return partByRef.get(ref);
}
