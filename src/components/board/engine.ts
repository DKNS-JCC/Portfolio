import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { contactPins } from "@/data/portfolio";
import {
  BOARD,
  INTRO_UNITS,
  NET_END_UNITS,
  NET_LENGTH,
  NET_W,
  NET_CLEARANCE,
  OUTRO_UNITS,
  TOTAL_UNITS,
  distanceToUnits,
  mountingHoles,
  netAt,
  netPath,
  nextTarget,
  partByRef,
  parts,
  passives,
  runs,
  sectionUnits,
  sections,
  unitsToDistance,
  zones,
  type SectionId,
  type Zone,
} from "./layout";
import { buildAtlases, buildLabels, type Fonts } from "./labels";
import { paintBoard, type PaletteId } from "./paint";
import {
  buildPart,
  buildPassives,
  createShared,
  type PartModel,
  type Shared,
  type TerminalModel,
} from "./models";
import { clamp, damp, easeInOutCubic, easeOutCubic, lerp, samplePolyline, smoothstep, type Pt } from "./geometry";

export type ViewMode = "3d" | "2d";
export type LayerId = "silk" | "refs" | "mask" | "models" | "ratsnest";

export interface HudRefs {
  x?: HTMLElement | null;
  y?: HTMLElement | null;
  net?: HTMLElement | null;
  length?: HTMLElement | null;
  placed?: HTMLElement | null;
  progress?: HTMLElement | null;
}

export interface EngineEvents {
  section(id: SectionId): void;
  hover(ref: string | null, detail?: { pin?: number }): void;
  select(ref: string | null): void;
  ready(): void;
  outro(k: number): void;
  error(message: string): void;
}

interface Rig {
  tx: number;
  ty: number;
  tz: number;
  dist: number;
  elev: number;
  yaw: number;
}

const DEG = Math.PI / 180;

export class BoardEngine {
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 1, 5000);
  private board = new THREE.Group();
  private partsGroup = new THREE.Group();
  private models: PartModel[] = [];
  private modelByRef = new Map<string, PartModel>();
  private shared!: Shared;
  private passiveSet!: ReturnType<typeof buildPassives>;
  private topMat!: THREE.MeshPhysicalMaterial;
  private bottomMat!: THREE.MeshStandardMaterial;
  private editorMat: THREE.MeshBasicMaterial | null = null;
  private editorPlane: THREE.Mesh | null = null;
  private maskTex!: THREE.Texture;
  private ormTex!: THREE.Texture;
  private silkTop: THREE.Mesh[] = [];
  private silkRefs: THREE.Mesh[] = [];
  private silkBottom: THREE.Mesh[] = [];
  private silkMats: THREE.MeshStandardMaterial[] = [];
  private netMat!: THREE.MeshStandardMaterial;
  private netProgress = { value: 0 };
  private head!: THREE.Mesh;
  private headRing!: THREE.Mesh;
  private ratsnest!: THREE.Line;
  private courtyard!: THREE.LineSegments;
  private pulseRing!: THREE.Mesh;
  private fr4Side!: THREE.MeshStandardMaterial;
  private sun!: THREE.DirectionalLight;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(-9, -9);
  private pointerInside = false;
  private boardPoint: Pt | null = null;
  private fonts: Fonts;
  private logo: HTMLImageElement | null = null;
  private hitList: THREE.Object3D[] = [];

  private raf = 0;
  private last = 0;
  private time = 0;
  private disposed = false;
  private ready = false;
  private reduced = false;
  private mobile = false;

  private pxPerUnit = 3;
  private uTarget = 0;
  private d = 0;
  private cam: Rig = { tx: 0, ty: 0, tz: 0, dist: 400, elev: 60 * DEG, yaw: 0 };
  private orbit = { yaw: 0, elev: 0 };
  private drag: { x: number; y: number; moved: boolean; id: number; touch: boolean } | null = null;
  private view: ViewMode = "3d";
  private viewT = 0;
  private flipped = false;
  private flipT = 0;
  private selected: string | null = null;
  private selT = 0;
  private selU = 0;
  private hovered: string | null = null;
  private hoverPin: number | undefined;
  private sectionId: SectionId = "inicio";
  private layers: Record<LayerId, boolean> = { silk: true, refs: true, mask: true, models: true, ratsnest: true };
  private placedCount = -1;
  private frame = 0;
  private reboot = -1;
  private flipU = 0;
  private interval = 0;
  private lastOutro = -1;

  constructor(
    private canvas: HTMLCanvasElement,
    private spacer: HTMLElement,
    private hud: HudRefs,
    private events: EngineEvents,
    fonts: Fonts,
  ) {
    this.fonts = fonts;
  }

  /* ================================================================ setup */

  async init() {
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.mobile = window.matchMedia("(pointer: coarse)").matches || Math.min(window.innerWidth, window.innerHeight) < 600;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      this.events.error("webgl");
      return;
    }
    try {
      const r = this.renderer;
      r.setPixelRatio(Math.min(window.devicePixelRatio, this.mobile ? 2 : 1.75));
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 0.92;
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFShadowMap;
      r.shadowMap.autoUpdate = false;

      this.canvas.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        console.warn("WebGL context lost; switching to fallback");
        this.events.error("webgl-lost");
      });

      this.scene.background = new THREE.Color(0x06140a);
      const pmrem = new THREE.PMREMGenerator(r);
      const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environment = env;
      this.scene.environmentIntensity = 0.5;
      pmrem.dispose();

      this.sun = new THREE.DirectionalLight(0xfff0dc, 1.7);
      this.sun.position.set(-150, 320, 210);
      this.sun.castShadow = true;
      const size = this.mobile ? 1024 : 2048;
      this.sun.shadow.mapSize.set(size, size);
      const sc = this.sun.shadow.camera;
      sc.left = -175;
      sc.right = 175;
      sc.top = 150;
      sc.bottom = -150;
      sc.near = 50;
      sc.far = 900;
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.04;
      this.scene.add(this.sun, this.sun.target);
      this.scene.add(new THREE.HemisphereLight(0xe4f2e6, 0x0b1a0e, 0.3));

      this.scene.add(this.board);

      await this.loadAssets();
      if (this.disposed) return;

      const anisotropy = r.capabilities.getMaxAnisotropy();
      this.shared = createShared(this.fonts, anisotropy, this.mobile);

      this.buildBoard(anisotropy);
      this.buildSilk(anisotropy);
      this.buildNet();
      this.buildParts();

      this.resize();
      window.addEventListener("resize", this.resize);
      window.addEventListener("scroll", this.onScroll, { passive: true });
      this.canvas.addEventListener("pointermove", this.onPointerMove);
      this.canvas.addEventListener("pointerdown", this.onPointerDown);
      window.addEventListener("pointerup", this.onPointerUp);
      this.canvas.addEventListener("pointerleave", this.onPointerLeave);
      this.canvas.addEventListener("pointercancel", this.onPointerCancel);

      this.onScroll();
      this.d = unitsToDistance(this.uTarget);
      this.netProgress.value = this.d;
      this.cam = this.rigFor(this.uTarget, this.d);
      this.ready = true;
      this.renderer.shadowMap.needsUpdate = true;
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
      this.interval = window.setInterval(this.fallback, 120);
      this.events.ready();
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __pcb: unknown }).__pcb = {
          u: (u: number | null) => {
            this.debugU = u;
            this.onScroll();
          },
          engine: this,
        };
      }
    } catch (err) {
      console.error("BoardEngine initialization failed:", err);
      this.events.error(err instanceof Error ? err.message : "init-failed");
    }
  }

  private async loadAssets() {
    const cleanFamily = (fam: string, fallback: string) => {
      const first = fam.split(",")[0].replace(/['"]/g, "").trim();
      return first || fallback;
    };
    const display = cleanFamily(this.fonts.display, "sans-serif");
    const mono = cleanFamily(this.fonts.mono, "monospace");

    const families = [
      `700 32px "${display}"`,
      `600 32px "${display}"`,
      `500 32px "${mono}"`,
      `600 32px "${mono}"`,
    ];
    if (typeof document !== "undefined" && document.fonts?.load) {
      await Promise.race([
        Promise.all(families.map((f) => document.fonts.load(f).catch(() => null))),
        new Promise((res) => setTimeout(res, 2000)),
      ]);
    }
    this.logo = await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = "/dkns.png";
      setTimeout(() => resolve(null), 2500);
    });
  }

  private canvasTexture(palette: PaletteId, side: "top" | "bottom", scale: number, anisotropy: number, srgb: boolean) {
    const cv = document.createElement("canvas");
    paintBoard(cv, { palette, side, scale, logo: palette === "height" || palette === "orm" ? null : this.logo });
    const t = new THREE.CanvasTexture(cv);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropy;
    return t;
  }

  private textureScale() {
    const max = this.renderer.capabilities.maxTextureSize;
    const wanted = this.mobile ? 1800 : 2880;
    return Math.min(wanted, max) / BOARD.w;
  }

  private boardShape(sign: 1 | -1) {
    const { w, h, radius: rr } = BOARD;
    const s = new THREE.Shape();
    const x0 = -w / 2;
    const y0 = -h / 2;
    s.moveTo(x0 + rr, y0);
    s.lineTo(x0 + w - rr, y0);
    s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + rr);
    s.lineTo(x0 + w, y0 + h - rr);
    s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - rr, y0 + h);
    s.lineTo(x0 + rr, y0 + h);
    s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - rr);
    s.lineTo(x0, y0 + rr);
    s.quadraticCurveTo(x0, y0, x0 + rr, y0);
    for (const [mx, my] of mountingHoles) {
      const hole = new THREE.Path();
      hole.absarc(mx - w / 2, sign * (my - h / 2), 1.6, 0, Math.PI * 2, true);
      s.holes.push(hole);
    }
    return s;
  }

  private buildBoard(anisotropy: number) {
    const scale = this.textureScale();
    this.maskTex = this.canvasTexture("mask", "top", scale, anisotropy, true);
    this.ormTex = this.canvasTexture("orm", "top", scale / 2, anisotropy, false);
    const heightTex = this.canvasTexture("height", "top", scale / 2, anisotropy, false);

    // FR4 core, visible at the routed edge and inside the mounting holes
    const body = new THREE.ExtrudeGeometry(this.boardShape(-1), { depth: BOARD.t, bevelEnabled: false, curveSegments: 24 });
    body.rotateX(-Math.PI / 2);
    body.translate(0, -BOARD.t / 2, 0);
    this.fr4Side = new THREE.MeshStandardMaterial({ color: 0xa99a62, roughness: 0.78 });
    const bodyMesh = new THREE.Mesh(body, [new THREE.MeshBasicMaterial({ visible: false }), this.fr4Side]);
    bodyMesh.castShadow = true;
    this.board.add(bodyMesh);

    const surface = (side: "top" | "bottom") => {
      const g = new THREE.ShapeGeometry(this.boardShape(-1), 24);
      g.rotateX(side === "top" ? -Math.PI / 2 : Math.PI / 2);
      const pos = g.attributes.position;
      const uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        uv.setXY(i, (x + BOARD.w / 2) / BOARD.w, side === "top" ? 1 - (z + BOARD.h / 2) / BOARD.h : (z + BOARD.h / 2) / BOARD.h);
      }
      return g;
    };

    this.topMat = new THREE.MeshPhysicalMaterial({
      map: this.maskTex,
      roughnessMap: this.ormTex,
      metalnessMap: this.ormTex,
      bumpMap: heightTex,
      bumpScale: 1.6,
      roughness: 1,
      metalness: 1,
      clearcoat: 0.28,
      clearcoatRoughness: 0.42,
    });
    const top = new THREE.Mesh(surface("top"), this.topMat);
    top.position.y = BOARD.t / 2 + 0.004;
    top.receiveShadow = true;
    this.board.add(top);

    const bScale = scale * 0.5;
    const bMask = this.canvasTexture("mask", "bottom", bScale, anisotropy, true);
    const bOrm = this.canvasTexture("orm", "bottom", bScale / 2, anisotropy, false);
    this.bottomMat = new THREE.MeshStandardMaterial({
      map: bMask,
      roughnessMap: bOrm,
      metalnessMap: bOrm,
      roughness: 1,
      metalness: 1,
    });
    const bottom = new THREE.Mesh(surface("bottom"), this.bottomMat);
    bottom.position.y = -BOARD.t / 2 - 0.004;
    bottom.receiveShadow = true;
    this.board.add(bottom);

    // solder joints of every through-hole lead, seen when the board is flipped
    const tht = parts.flatMap((p) => p.pads.filter((pd) => pd.drill));
    const joint = new THREE.InstancedMesh(new THREE.ConeGeometry(0.85, 0.9, 20), this.shared.tin, tht.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    tht.forEach((pd, i) => {
      m.compose(new THREE.Vector3(pd.x - BOARD.w / 2, -BOARD.t / 2 - 0.45, pd.y - BOARD.h / 2), q, new THREE.Vector3(1, 1, 1));
      joint.setMatrixAt(i, m);
    });
    this.board.add(joint);
  }

  private buildSilk(anisotropy: number) {
    const labels = buildLabels();
    const { canvases, quads } = buildAtlases(labels, this.fonts, this.mobile ? 36 : 56);
    const textures = canvases.map((cv) => {
      const t = new THREE.CanvasTexture(cv);
      t.anisotropy = anisotropy;
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    });
    type Bucket = { pos: number[]; uv: number[]; idx: number[] };
    const buckets = new Map<string, Bucket>();
    const W = BOARD.w;
    const H = BOARD.h;
    for (const q of quads) {
      const l = q.label;
      const group = l.side === "bottom" ? "bottom" : l.layer === "ref" ? "ref" : "silk";
      const key = `${group}:${q.atlas}`;
      if (!buckets.has(key)) buckets.set(key, { pos: [], uv: [], idx: [] });
      const b = buckets.get(key)!;
      const em = l.size / 0.7;
      const cy = l.y - 0.35 * em;
      const cx = l.align === "center" ? l.x : l.align === "right" ? l.x - q.w / 2 : l.x + q.w / 2;
      const x0 = cx - q.w / 2 - W / 2;
      const x1 = cx + q.w / 2 - W / 2;
      const base = b.pos.length / 3;
      if (l.side === "top") {
        const y = BOARD.t / 2 + 0.03;
        const z0 = cy - q.h / 2 - H / 2;
        const z1 = cy + q.h / 2 - H / 2;
        b.pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
      } else {
        const y = -BOARD.t / 2 - 0.03;
        const zt = H / 2 - cy + q.h / 2;
        const zb = zt - q.h;
        b.pos.push(x0, y, zt, x1, y, zt, x1, y, zb, x0, y, zb);
      }
      b.uv.push(q.u0, 1 - q.v0, q.u1, 1 - q.v0, q.u1, 1 - q.v1, q.u0, 1 - q.v1);
      // tl, tr, br, bl
      b.idx.push(base, base + 3, base + 1, base + 1, base + 3, base + 2);
    }
    for (const [key, b] of buckets) {
      const [group, atlas] = key.split(":");
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
      g.setIndex(b.idx);
      g.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        map: textures[Number(atlas)],
        color: 0xeef5ea,
        roughness: 0.85,
        metalness: 0,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      this.silkMats.push(mat);
      const mesh = new THREE.Mesh(g, mat);
      mesh.renderOrder = 2;
      this.board.add(mesh);
      if (group === "silk") this.silkTop.push(mesh);
      else if (group === "ref") this.silkRefs.push(mesh);
      else this.silkBottom.push(mesh);
    }
  }

  private buildNet() {
    const geos: THREE.BufferGeometry[] = [];
    const y = BOARD.t / 2 + 0.05;
    for (const run of runs) {
      const pts = run.pts;
      if (pts.length < 2) continue;
      const pos: number[] = [];
      const dist: number[] = [];
      const idx: number[] = [];
      let acc = run.d0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const prev = pts[Math.max(0, i - 1)];
        const next = pts[Math.min(pts.length - 1, i + 1)];
        const din = normalize([p[0] - prev[0], p[1] - prev[1]]);
        const dout = normalize([next[0] - p[0], next[1] - p[1]]);
        const a = i === 0 ? dout : din;
        const b = i === pts.length - 1 ? din : dout;
        const na: Pt = [-a[1], a[0]];
        const nb: Pt = [-b[1], b[0]];
        let mx = na[0] + nb[0];
        let my = na[1] + nb[1];
        const ml = Math.hypot(mx, my) || 1;
        mx /= ml;
        my /= ml;
        const k = (NET_W / 2) / Math.max(0.3, mx * na[0] + my * na[1]);
        if (i > 0) acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
        pos.push(p[0] + mx * k - BOARD.w / 2, y, p[1] + my * k - BOARD.h / 2);
        pos.push(p[0] - mx * k - BOARD.w / 2, y, p[1] - my * k - BOARD.h / 2);
        dist.push(acc, acc);
        if (i > 0) {
          const L0 = (i - 1) * 2;
          const R0 = L0 + 1;
          const L1 = i * 2;
          const R1 = L1 + 1;
          idx.push(L0, L1, R0, R0, L1, R1);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("aDist", new THREE.Float32BufferAttribute(dist, 1));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      g.setIndex(idx);
      geos.push(g);
    }
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    this.netMat = new THREE.MeshStandardMaterial({ color: 0xd0874a, metalness: 1, roughness: 0.3 });
    const progress = this.netProgress;
    this.netMat.onBeforeCompile = (shader) => {
      shader.uniforms.uProgress = progress;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aDist;\nvarying float vDist;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvDist = aDist;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uProgress;\nvarying float vDist;")
        .replace("void main() {", "void main() {\n  if (vDist > uProgress) discard;");
    };
    this.netMat.customProgramCacheKey = () => "net-progress";
    const net = new THREE.Mesh(merged, this.netMat);
    net.renderOrder = 1;
    this.board.add(net);

    this.head = new THREE.Mesh(
      new THREE.CircleGeometry(NET_W / 2, 24),
      new THREE.MeshStandardMaterial({ color: 0xd0874a, metalness: 1, roughness: 0.3 }),
    );
    this.head.rotation.x = -Math.PI / 2;
    this.board.add(this.head);

    this.headRing = new THREE.Mesh(
      new THREE.RingGeometry(NET_W / 2 + NET_CLEARANCE - 0.07, NET_W / 2 + NET_CLEARANCE, 40),
      new THREE.MeshBasicMaterial({ color: 0xdfe8dc, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    this.headRing.rotation.x = -Math.PI / 2;
    this.board.add(this.headRing);

    const rg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]);
    this.ratsnest = new THREE.Line(rg, new THREE.LineBasicMaterial({ color: 0xf2f6ee, transparent: true, opacity: 0.75 }));
    this.board.add(this.ratsnest);

    const L = 0.26;
    const cg = new THREE.BufferGeometry().setFromPoints([
      // top-left
      new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(-0.5 + L, 0, -0.5),
      new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(-0.5, 0, -0.5 + L),
      // top-right
      new THREE.Vector3(0.5, 0, -0.5), new THREE.Vector3(0.5 - L, 0, -0.5),
      new THREE.Vector3(0.5, 0, -0.5), new THREE.Vector3(0.5, 0, -0.5 + L),
      // bottom-right
      new THREE.Vector3(0.5, 0, 0.5), new THREE.Vector3(0.5 - L, 0, 0.5),
      new THREE.Vector3(0.5, 0, 0.5), new THREE.Vector3(0.5, 0, 0.5 - L),
      // bottom-left
      new THREE.Vector3(-0.5, 0, 0.5), new THREE.Vector3(-0.5 + L, 0, 0.5),
      new THREE.Vector3(-0.5, 0, 0.5), new THREE.Vector3(-0.5, 0, 0.5 - L),
    ]);
    this.courtyard = new THREE.LineSegments(
      cg,
      new THREE.LineBasicMaterial({ color: 0xe8c275, transparent: true, opacity: 0.88, depthWrite: false }),
    );
    this.courtyard.visible = false;
    this.board.add(this.courtyard);

    const ringGeo = new THREE.RingGeometry(0.46, 0.52, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.pulseRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0xe8c275, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.pulseRing.visible = false;
    this.board.add(this.pulseRing);
  }

  private buildParts() {
    this.board.add(this.partsGroup);
    for (const p of parts) {
      const m = buildPart(this.shared, p);
      m.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.material !== this.shared.hit) mesh.receiveShadow = mesh.receiveShadow || false;
      });
      this.partsGroup.add(m.root);
      this.models.push(m);
      this.modelByRef.set(p.ref, m);
      this.hitList.push(...m.hits);
    }
    this.passiveSet = buildPassives(this.shared, passives);
    this.partsGroup.add(this.passiveSet.group);
  }

  /* ========================================================= camera rig */

  private aspect() {
    return window.innerWidth / Math.max(1, window.innerHeight);
  }

  /**
   * Closest camera that keeps the whole board inside the part of the frame the
   * chrome leaves free: the sheet note sits bottom-left, the dock top-right.
   */
  private overviewRig(elevDeg = 62, flipped = false): Rig {
    const elev = elevDeg * DEG;
    const wide = this.aspect() >= 1.2;
    const box = wide ? { x0: -0.42, x1: 0.7, y0: -0.86, y1: 0.82 } : { x0: -0.94, x1: 0.94, y0: -0.42, y1: 0.8 };
    const cam = this.camera.clone();
    cam.aspect = this.aspect();
    cam.updateProjectionMatrix();
    const corners = [
      new THREE.Vector3(-BOARD.w / 2, 0, -BOARD.h / 2),
      new THREE.Vector3(BOARD.w / 2, 0, -BOARD.h / 2),
      new THREE.Vector3(BOARD.w / 2, 0, BOARD.h / 2),
      new THREE.Vector3(-BOARD.w / 2, 0, BOARD.h / 2),
    ];
    const extents = (r: Rig) => {
      placeCamera(cam, r);
      cam.updateMatrixWorld();
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const c of corners) {
        const p = c.clone().project(cam);
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y);
        y1 = Math.max(y1, p.y);
      }
      return { x0, x1, y0, y1 };
    };
    const tanH = Math.tan((cam.fov * DEG) / 2);
    const solve = (dist: number): Rig => {
      const r: Rig = { tx: 0, ty: 0, tz: flipped ? 0 : 4, dist, elev, yaw: 0 };
      for (let i = 0; i < 4; i++) {
        const e = extents(r);
        const dx = (box.x0 + box.x1) / 2 - (e.x0 + e.x1) / 2;
        const dy = (box.y0 + box.y1) / 2 - (e.y0 + e.y1) / 2;
        r.tx -= dx * dist * tanH * cam.aspect;
        r.tz += (dy * dist * tanH) / Math.max(0.3, Math.sin(elev));
      }
      return r;
    };
    const fits = (r: Rig) => {
      const e = extents(r);
      return e.x0 >= box.x0 - 0.01 && e.x1 <= box.x1 + 0.01 && e.y0 >= box.y0 - 0.01 && e.y1 <= box.y1 + 0.01;
    };
    let lo = 50;
    let hi = 4000;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (fits(solve(mid))) hi = mid;
      else lo = mid;
    }
    return solve(hi);
  }

  private zoneAt(d: number): { a: Zone; b: Zone; t: number } {
    if (d <= zones[0].d1) return { a: zones[0], b: zones[0], t: 0 };
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (d >= z.d0 && d <= z.d1) return { a: z, b: z, t: 0 };
      const n = zones[i + 1];
      if (n && d > z.d1 && d < n.d0) return { a: z, b: n, t: smoothstep((d - z.d1) / Math.max(1, n.d0 - z.d1)) };
    }
    const last = zones[zones.length - 1];
    return { a: last, b: last, t: 0 };
  }

  private headAt(d: number) {
    return samplePolyline(netPath, d);
  }

  private followRig(d: number): Rig {
    const { a, b, t } = this.zoneAt(d);
    const aspect = this.aspect();
    const portrait = clamp((1.3 - aspect) / 0.8);
    const head = this.headAt(d);
    const focusX = lerp(a.focus[0], b.focus[0], t);
    const focusY = lerp(a.focus[1], b.focus[1], t);
    const follow = lerp(lerp(a.follow, b.follow, t), 0.92, portrait);
    const x = lerp(focusX, head.p[0], follow);
    const y = lerp(focusY, head.p[1], follow);
    const baseDist = lerp(a.dist, b.dist, t);
    const zoneFollow = lerp(a.follow, b.follow, t);
    const portraitScale = lerp(1.55, 1.14, zoneFollow);
    const dist = baseDist * lerp(1, portraitScale, portrait);
    return {
      tx: x - BOARD.w / 2,
      ty: BOARD.t / 2,
      tz: y - BOARD.h / 2,
      dist,
      elev: lerp(a.elev, b.elev, t) * DEG * lerp(1, 1.12, portrait),
      yaw: (lerp(a.yaw, b.yaw, t) + head.t[0] * 3) * DEG,
    };
  }

  private overCache = new Map<string, Rig>();

  private overview(elevDeg = 62, flipped = false) {
    const key = `${elevDeg}:${flipped}:${this.aspect().toFixed(3)}:${this.camera.fov}`;
    let r = this.overCache.get(key);
    if (!r) {
      r = this.overviewRig(elevDeg, flipped);
      this.overCache.set(key, r);
    }
    return r;
  }

  private rigFor(u: number, d: number): Rig {
    const over = this.overview();
    if (u < INTRO_UNITS) {
      const k = easeInOutCubic(u / INTRO_UNITS);
      return mixRig(over, this.followRig(0), k);
    }
    if (u > NET_END_UNITS) {
      const k = easeInOutCubic((u - NET_END_UNITS) / OUTRO_UNITS);
      return mixRig(this.followRig(NET_LENGTH), this.overview(58), k);
    }
    return this.followRig(d);
  }

  /* ============================================================== frame */

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.tick(now);
  };

  /* rAF stops in hidden or occluded frames; keep the board alive at a low rate */
  private fallback = () => {
    const now = performance.now();
    if (now - this.last > 200) this.tick(now);
  };

  private tick(now: number) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.frame++;
    this.step(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private step(dt: number) {
    const u = this.uTarget;
    const dTarget = unitsToDistance(u);
    const prevD = this.d;
    this.d = this.reduced ? dTarget : damp(this.d, dTarget, 6.5, dt);
    if (Math.abs(this.d - dTarget) < 0.01) this.d = dTarget;
    const d = this.d;
    const moving = Math.abs(d - prevD) > 1e-4;

    // selection clears when the reader scrolls away
    if (this.selected && Math.abs(u - this.selU) > 60) this.select(null);

    /* ---- view transitions */
    this.viewT = damp(this.viewT, this.view === "2d" ? 1 : 0, 5, dt);
    this.flipT = damp(this.flipT, this.flipped ? 1 : 0, 3.2, dt);
    this.selT = damp(this.selT, this.selected ? 1 : 0, 4, dt);
    const flipE = easeInOutCubic(this.flipT);
    this.board.rotation.x = Math.PI * flipE;
    const transitioning = Math.abs(this.flipT - (this.flipped ? 1 : 0)) > 1e-3 || Math.abs(this.viewT - (this.view === "2d" ? 1 : 0)) > 1e-3;

    /* ---- camera */
    let rig = this.rigFor(u, d);
    if (this.selected && this.selT > 0.001) {
      const p = partByRef.get(this.selected)!;
      const size = Math.max(p.court[0], p.court[1]);
      const wide = this.aspect() > 1.1;
      const dist = clamp(size * 3.3 + p.height * 3.4, 34, 110) * (wide ? 1 : 1.6);
      const focus: Rig = {
        // on wide screens the inspector covers the right third: keep the part left of centre
        tx: p.x - BOARD.w / 2 + (wide ? dist * 0.2 : 0),
        ty: BOARD.t / 2 + Math.min(14, p.height) * 0.55,
        tz: p.y - BOARD.h / 2 + (p.kind === "chip" ? size * 0.12 : 0) + (wide ? 0 : dist * 0.42),
        dist,
        elev: (p.kind === "capacitor" ? 30 : 46) * DEG,
        yaw: rig.yaw,
      };
      rig = mixRig(rig, focus, easeInOutCubic(this.selT));
    }
    if (this.flipT > 0.001) rig = mixRig(rig, this.overview(68, true), smoothstep(this.flipT * 1.4));
    if (this.viewT > 0.001) {
      const top: Rig = { ...rig, elev: 89.5 * DEG, yaw: 0, dist: rig.dist * 1.08 };
      rig = mixRig(rig, top, easeInOutCubic(this.viewT));
    }
    rig.yaw += this.orbit.yaw;
    rig.elev = clamp(rig.elev + this.orbit.elev, 12 * DEG, 89.6 * DEG);
    if (!this.drag) {
      this.orbit.yaw = damp(this.orbit.yaw, 0, 0.9, dt);
      this.orbit.elev = damp(this.orbit.elev, 0, 0.9, dt);
    }

    const rate = this.reduced ? 20 : 3.6;
    const c = this.cam;
    c.tx = damp(c.tx, rig.tx, rate, dt);
    c.ty = damp(c.ty, rig.ty, rate, dt);
    c.tz = damp(c.tz, rig.tz, rate, dt);
    c.dist = damp(c.dist, rig.dist, rate, dt);
    c.elev = damp(c.elev, rig.elev, rate, dt);
    c.yaw = damp(c.yaw, rig.yaw, rate, dt);
    placeCamera(this.camera, c);
    const near = clamp(c.dist * 0.08, 1, 40);
    const far = c.dist * 4 + 900;
    if (Math.abs(this.camera.near - near) > near * 0.05 || Math.abs(this.camera.far - far) > 50) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }

    /* ---- the net */
    this.netProgress.value = d;
    const head = this.headAt(d);
    const inRun = runs.some((r) => d >= r.d0 - 0.01 && d <= r.d1 + 0.01);
    const routing = d > 0.2 && d < NET_LENGTH - 0.05;
    this.head.visible = inRun && d > 0.05;
    this.head.position.set(head.p[0] - BOARD.w / 2, BOARD.t / 2 + 0.051, head.p[1] - BOARD.h / 2);
    this.headRing.visible = inRun && routing && this.viewT < 0.5;
    this.headRing.position.set(this.head.position.x, BOARD.t / 2 + 0.06, this.head.position.z);
    const target = nextTarget(d);
    this.ratsnest.visible = this.layers.ratsnest && !!target && routing && inRun;
    if (target) {
      const pa = this.ratsnest.geometry.attributes.position as THREE.BufferAttribute;
      pa.setXYZ(0, head.p[0] - BOARD.w / 2, BOARD.t / 2 + 0.08, head.p[1] - BOARD.h / 2);
      pa.setXYZ(1, target[0] - BOARD.w / 2, BOARD.t / 2 + 0.08, target[1] - BOARD.h / 2);
      pa.needsUpdate = true;
      this.ratsnest.geometry.computeBoundingSphere();
    }

    /* ---- parts land as the net reaches them */
    let placed = 0;
    let animating = moving || transitioning;
    const ownerF = new Map<string, number>();
    for (const m of this.models) {
      const p = m.part;
      const span = Math.max(1e-3, p.dOut - p.dIn);
      const f = this.reduced ? (d >= p.dIn ? 1 : 0) : clamp((d - p.dIn) / span);
      ownerF.set(p.ref, f);
      const e = easeOutCubic(f);
      m.root.visible = f > 0.002 && this.viewT < 0.55 && this.layers.models;
      const isHovered = p.ref === this.hovered && !this.selected;
      const targetLift = isHovered ? 0.6 : 0;
      m.root.userData.lift = damp(m.root.userData.lift ?? 0, targetLift, 12, dt);
      if (Math.abs((m.root.userData.lift ?? 0) - targetLift) > 1e-3) animating = true;
      m.root.position.y = BOARD.t / 2 + (1 - e) * 24 + (m.root.userData.lift ?? 0);
      m.root.rotation.y = (1 - e) * 0.5;
      if (f >= 1) placed++;
      if (p.kind === "led") {
        const powered = p.ref === "D0" ? (d > 0.3 ? 1 : 0) : f >= 1 ? 1 : 0;
        m.root.userData.powered = this.reboot >= 0 ? (this.time - this.reboot > 0.6 + p.x * 0.004 ? powered : 0) : powered;
      }
      m.update(dt, this.time);
    }
    if (this.reboot >= 0 && this.time - this.reboot > 2.2) this.reboot = -1;
    const lifts = passives.map((ps) => {
      const f = clamp(((ownerF.get(ps.owner) ?? 0) - 0.25) / 0.75);
      return f <= 0 ? 99 : (1 - easeOutCubic(f)) * 18;
    });
    this.passiveSet.place(lifts);
    this.passiveSet.group.visible = this.viewT < 0.55 && this.layers.models;
    if (this.selT > 0.001 && this.selT < 0.999) animating = true;
    if (this.selected) animating = true;

    if (animating || this.frame % 30 === 0) this.renderer.shadowMap.needsUpdate = true;

    /* ---- 2d editor view */
    if (this.viewT > 0.001) this.ensureEditor();
    if (this.editorMat) {
      this.editorMat.opacity = smoothstep((this.viewT - 0.15) / 0.6);
      this.editorPlane!.visible = this.viewT > 0.01;
    }
    const bg = this.scene.background as THREE.Color;
    bg.setHex(0x06140a).lerp(new THREE.Color(0x001023), smoothstep(this.viewT));
    const silkColor = new THREE.Color(0xeef5ea).lerp(new THREE.Color(0xf2eda1), smoothstep(this.viewT));
    this.silkMats.forEach((mm) => mm.color.copy(silkColor));
    this.netMat.color.setHex(0xd0874a).lerp(new THREE.Color(0xc83434), smoothstep(this.viewT));
    this.netMat.metalness = 1 - smoothstep(this.viewT);
    (this.head.material as THREE.MeshStandardMaterial).color.copy(this.netMat.color);
    (this.head.material as THREE.MeshStandardMaterial).metalness = this.netMat.metalness;

    /* ---- hover outline */
    this.updateHover();

    /* ---- hud */
    const landed = placed + lifts.filter((l) => l === 0).length;
    if (landed !== this.placedCount) {
      this.placedCount = landed;
      if (this.hud.placed) this.hud.placed.textContent = `${landed}/${parts.length + passives.length}`;
    }
    if (this.frame % 3 === 0) this.writeHud(u, d);

    /* ---- section + outro */
    const sec = this.sectionFor(u, d);
    if (sec !== this.sectionId) {
      this.sectionId = sec;
      this.events.section(sec);
    }
    const outro = Math.round(clamp((u - NET_END_UNITS) / OUTRO_UNITS) * 50) / 50;
    if (outro !== this.lastOutro) {
      this.lastOutro = outro;
      this.events.outro(outro);
    }
  }

  private sectionFor(u: number, d: number): SectionId {
    if (u < INTRO_UNITS * 0.6) return "inicio";
    if (u >= NET_END_UNITS - 10) return "contacto";
    let best: SectionId = "inicio";
    for (const s of sections) {
      const zs = zones.filter((z) => z.id === s.zone || (s.id === "proyectos" && z.id.startsWith("proyectos")));
      const start = Math.min(...zs.map((z) => z.d0));
      if (d >= start - 18) best = s.id;
    }
    return best;
  }

  private writeHud(u: number, d: number) {
    const h = this.hud;
    const pt = this.boardPoint ?? this.headAt(d).p;
    if (h.x) h.x.textContent = pt[0].toFixed(2);
    if (h.y) h.y.textContent = pt[1].toFixed(2);
    if (h.net) h.net.textContent = netAt(d);
    if (h.length) h.length.textContent = `${d.toFixed(2)} mm`;
    if (h.progress) h.progress.style.transform = `scaleX(${clamp(u / TOTAL_UNITS)})`;
  }

  /* ============================================================ editor 2d */

  private ensureEditor() {
    if (this.editorMat) return;
    const tex = this.canvasTexture("editor", "top", this.textureScale(), this.renderer.capabilities.getMaxAnisotropy(), true);
    this.editorMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const g = new THREE.PlaneGeometry(BOARD.w, BOARD.h);
    g.rotateX(-Math.PI / 2);
    this.editorPlane = new THREE.Mesh(g, this.editorMat);
    this.editorPlane.position.y = BOARD.t / 2 + 0.01;
    this.editorPlane.renderOrder = 1;
    this.board.add(this.editorPlane);
  }

  /* ============================================================ pointer */

  private updatePointer(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.pointerInside = true;
  }

  private onPointerMove = (e: PointerEvent) => {
    this.updatePointer(e);
    if (this.drag && e.pointerId === this.drag.id) {
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (Math.hypot(dx, dy) > (this.drag.touch ? 10 : 5)) this.drag.moved = true;
      if (this.drag.moved && !this.drag.touch) {
        this.orbit.yaw = clamp(this.orbit.yaw - dx * 0.005, -1.1, 1.1);
        this.orbit.elev = clamp(this.orbit.elev + dy * 0.004, -0.6, 0.6);
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
        this.canvas.style.cursor = "grabbing";
      }
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    this.updatePointer(e);
    if (e.pointerType === "mouse" && e.button !== 0) return;
    this.drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId, touch: e.pointerType === "touch" };
  };

  private onPointerCancel = () => {
    this.drag = null;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const moved = this.drag.moved;
    this.drag = null;
    this.canvas.style.cursor = "";
    if (moved || e.target !== this.canvas) return;
    this.updatePointer(e);
    this.click();
  };

  private onPointerLeave = () => {
    this.pointerInside = false;
    this.boardPoint = null;
  };

  private pick(): { ref: string; pin?: number } | null {
    if (!this.pointerInside || !this.ready) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.flipT > 0.5) return null;
    // board-plane coordinate for the status bar and for unplaced footprints
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BOARD.t / 2);
    const hit = new THREE.Vector3();
    this.boardPoint = this.raycaster.ray.intersectPlane(plane, hit)
      ? [hit.x + BOARD.w / 2, hit.z + BOARD.h / 2]
      : null;
    if (this.boardPoint && (this.boardPoint[0] < 0 || this.boardPoint[1] < 0 || this.boardPoint[0] > BOARD.w || this.boardPoint[1] > BOARD.h))
      this.boardPoint = null;

    if (this.viewT < 0.5 && this.layers.models) {
      const hits = this.raycaster.intersectObjects(
        this.hitList.filter((h) => {
          const m = this.modelByRef.get(h.userData.ref as string);
          return m && m.root.visible && m.root.position.y < BOARD.t / 2 + 0.5;
        }),
        false,
      );
      if (hits.length) {
        const o = hits[0].object;
        return { ref: o.userData.ref as string, pin: o.userData.pin as number | undefined };
      }
    }
    if (this.boardPoint) {
      const [bx, by] = this.boardPoint;
      for (const p of parts) {
        if (!p.interactive && p.kind !== "switch") continue;
        if (Math.abs(bx - p.x) <= p.court[0] / 2 && Math.abs(by - p.y) <= p.court[1] / 2) return { ref: p.ref };
      }
    }
    return null;
  }

  private updateHover() {
    if (this.drag?.moved) return;
    const h = this.pick();
    const ref = h?.ref ?? null;
    if (ref !== this.hovered || h?.pin !== this.hoverPin) {
      this.hovered = ref;
      this.hoverPin = h?.pin;
      this.events.hover(ref, { pin: h?.pin });
      this.canvas.style.cursor = ref ? "pointer" : "";
    }

    const hoveredPart = ref ? partByRef.get(ref) : null;
    const selectedPart = this.selected ? partByRef.get(this.selected) : null;
    let targetPart = hoveredPart ?? selectedPart;

    if (!targetPart && this.viewT < 0.55 && !this.flipped && this.d > 20) {
      const d = this.d;
      targetPart =
        parts.find((p) => p.interactive && p.kind !== "switch" && d >= p.dIn - 1 && d <= p.dOut + 8) ??
        parts.filter((p) => p.interactive && p.kind !== "switch" && d >= p.dOut).slice(-1)[0] ??
        null;
    }

    const show = !!targetPart && this.viewT < 0.55 && !this.flipped;
    this.courtyard.visible = show;
    this.pulseRing.visible = show;

    if (targetPart && show) {
      const pad = 0.8;
      const cw = targetPart.court[0] + pad;
      const ch = targetPart.court[1] + pad;
      this.courtyard.position.set(targetPart.x - BOARD.w / 2, BOARD.t / 2 + 0.07, targetPart.y - BOARD.h / 2);
      this.courtyard.scale.set(cw, 1, ch);

      const cycle = (this.time % 2.4) / 2.4;
      const expand = 1.0 + cycle * 0.7;
      const maxDim = Math.max(cw, ch);
      this.pulseRing.position.copy(this.courtyard.position);
      this.pulseRing.scale.set(maxDim * expand, 1, maxDim * expand);
      (this.pulseRing.material as THREE.MeshBasicMaterial).opacity =
        (1 - cycle) * (hoveredPart ? 0.75 : 0.42);
    }
  }

  private click() {
    const h = this.pick();
    if (!h) {
      if (this.selected) this.select(null);
      return;
    }
    const p = partByRef.get(h.ref)!;
    const m = this.modelByRef.get(h.ref)!;
    const placed = this.d >= p.dOut - 0.01;
    if (!placed) {
      this.scrollToUnits(distanceToUnits(p.dOut) + 4);
      return;
    }
    if (p.kind === "switch") {
      m.press?.();
      this.select(null);
      this.reboot = this.time;
      window.setTimeout(() => this.scrollToUnits(0), 900);
      return;
    }
    if (p.kind === "terminal" && h.pin !== undefined) {
      (m as TerminalModel).turn(h.pin);
      const pin = contactPins[h.pin];
      if (pin.href.startsWith("mailto:")) window.location.href = pin.href;
      else window.open(pin.href, "_blank", "noopener");
      this.select("J2");
      return;
    }
    if (p.kind === "led" && p.ref !== "D0") m.toggle?.();
    this.select(this.selected === h.ref ? null : h.ref);
  }

  /* ============================================================ public */

  select(ref: string | null) {
    if (this.selected === ref) return;
    if (this.selected) {
      const prev = this.modelByRef.get(this.selected);
      if (prev) prev.active = false;
    }
    this.selected = ref;
    this.selU = this.uTarget;
    if (ref) {
      const m = this.modelByRef.get(ref);
      if (m) m.active = m.part.kind !== "led" && m.part.kind !== "terminal" && m.part.kind !== "usbc";
    }
    this.events.select(ref);
  }

  setHovered(ref: string | null) {
    if (this.hovered === ref) return;
    this.hovered = ref;
    this.events.hover(ref);
    this.updateHover();
    if (this.renderer) this.renderer.shadowMap.needsUpdate = true;
  }

  setView(v: ViewMode) {
    this.view = v;
    if (v === "2d") this.select(null);
  }

  setFlipped(f: boolean) {
    this.flipped = f;
    this.flipU = this.uTarget;
    if (f) this.select(null);
  }

  scrollToUnits(u: number) {
    const top = clamp(u, 0, TOTAL_UNITS) * this.pxPerUnit;
    window.scrollTo({ top, behavior: this.reduced ? "auto" : "smooth" });
  }

  goToSection(id: SectionId) {
    this.select(null);
    this.setFlipped(false);
    this.scrollToUnits(id === "contacto" ? TOTAL_UNITS : sectionUnits(id));
  }

  get unitsTotal() {
    return TOTAL_UNITS;
  }

  get isReady() {
    return this.ready;
  }

  /** development hook: drive the board without scrolling the document */
  private debugU: number | null = null;

  private onScroll = () => {
    this.uTarget = this.debugU ?? window.scrollY / this.pxPerUnit;
    if (this.flipped && Math.abs(this.uTarget - this.flipU) > 30) this.flipped = false;
  };

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const u = this.uTarget;
    this.pxPerUnit = Math.max(2.4, h / 300);
    this.spacer.style.height = `${Math.round(TOTAL_UNITS * this.pxPerUnit + h)}px`;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 42 : 30;
    this.camera.updateProjectionMatrix();
    if (this.ready && this.debugU === null) window.scrollTo({ top: u * this.pxPerUnit });
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.clearInterval(this.interval);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("scroll", this.onScroll);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
    if (!this.renderer) return;
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
      else mat?.dispose();
    });
    this.shared?.textures.forEach((t) => t.dispose());
    this.renderer.dispose();
  }
}

function normalize(v: Pt): Pt {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}

function placeCamera(cam: THREE.PerspectiveCamera, c: Rig) {
  const ce = Math.cos(c.elev);
  cam.position.set(c.tx + Math.sin(c.yaw) * ce * c.dist, c.ty + Math.sin(c.elev) * c.dist, c.tz + Math.cos(c.yaw) * ce * c.dist);
  cam.lookAt(c.tx, c.ty, c.tz);
}

function mixRig(a: Rig, b: Rig, t: number): Rig {
  return {
    tx: lerp(a.tx, b.tx, t),
    ty: lerp(a.ty, b.ty, t),
    tz: lerp(a.tz, b.tz, t),
    dist: lerp(a.dist, b.dist, t),
    elev: lerp(a.elev, b.elev, t),
    yaw: lerp(a.yaw, b.yaw, t),
  };
}
