"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleHelp, FileText, FlipVertical2, Mail, X } from "lucide-react";
import { certs, contactPins, jobs, person, projects, skillGroups, studies } from "@/data/portfolio";
import type { BoardEngine, ViewMode } from "./engine";
import { Inspector } from "./Inspector";
import { parts, partByRef, passives, sections, type SectionId } from "./layout";

type Panel = "none" | "help";

function hoverText(ref: string | null, pin?: number) {
  if (!ref) return null;
  const p = partByRef.get(ref);
  if (!p) return null;
  if (p.kind === "terminal") {
    const label = pin !== undefined && contactPins[pin] ? contactPins[pin].label : "contacto";
    return [ref, label, "abre el enlace"];
  }
  if (p.kind === "chip") {
    return [ref, projects[p.index].name, projects[p.index].year];
  }
  if (p.kind === "capacitor") {
    const j = jobs[p.index];
    return [ref, j.role, j.org];
  }
  if (p.kind === "crystal") {
    const s = studies[p.index];
    return [ref, s.title, s.org];
  }
  if (p.kind === "resistor") {
    const c = certs[p.index];
    return [ref, c.title, c.org];
  }
  if (p.kind === "led") {
    const gi = Math.floor(p.index / 100);
    const g = skillGroups[gi];
    return [ref, p.value, g ? g.name : "conocimientos"];
  }
  if (p.kind === "usbc") {
    return [ref, `${person.given} ${person.family}`, "sobre mí"];
  }
  return [ref, p.value, ""];
}

export default function BoardApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const hx = useRef<HTMLSpanElement>(null);
  const hy = useRef<HTMLSpanElement>(null);
  const hnet = useRef<HTMLSpanElement>(null);
  const hlen = useRef<HTMLSpanElement>(null);
  const hplaced = useRef<HTMLSpanElement>(null);
  const hprog = useRef<HTMLSpanElement>(null);
  const engineRef = useRef<BoardEngine | null>(null);

  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<SectionId>("inicio");
  const [hover, setHover] = useState<{ ref: string | null; pin?: number }>({ ref: null });
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setViewState] = useState<ViewMode>("3d");
  const [flipped, setFlippedState] = useState(false);
  const [panel, setPanel] = useState<Panel>("none");
  const [outro, setOutro] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let engine: BoardEngine | null = null;
    const root = getComputedStyle(document.documentElement);
    const fonts = {
      display: root.getPropertyValue("--font-chakra").trim() || "sans-serif",
      mono: root.getPropertyValue("--font-plex").trim() || "monospace",
    };
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
    if (!gl) {
      document.documentElement.dataset.fallback = "1";
      return;
    }
    // Clean up probe context immediately so it does not compete for GPU memory on mobile
    gl.getExtension("WEBGL_lose_context")?.loseContext();

    // Watchdog: if the 3D board fails to load within 7 seconds, fall back gracefully
    let isBoardReady = false;
    const watchdog = window.setTimeout(() => {
      if (!cancelled && !isBoardReady) {
        console.warn("Board load timeout; switching to fallback");
        document.documentElement.dataset.fallback = "1";
        setReady(true);
      }
    }, 7000);

    import("./engine")
      .then(async ({ BoardEngine }) => {
        if (cancelled || !canvasRef.current || !spacerRef.current) return;
        try {
          engine = new BoardEngine(
            canvasRef.current,
            spacerRef.current,
            {
              x: hx.current,
              y: hy.current,
              net: hnet.current,
              length: hlen.current,
              placed: hplaced.current,
              progress: hprog.current,
            },
            {
              section: (id) => setSection(id),
              hover: (ref, detail) => setHover({ ref, pin: detail?.pin }),
              select: (ref) => setSelected(ref),
              ready: () => {
                isBoardReady = true;
                window.clearTimeout(watchdog);
                setReady(true);
              },
              outro: (k) => setOutro(k),
              error: () => {
                window.clearTimeout(watchdog);
                document.documentElement.dataset.fallback = "1";
                setReady(true);
              },
            },
            fonts,
          );
          engineRef.current = engine;
          await engine.init();
        } catch (err) {
          console.error("Engine initialization error:", err);
          window.clearTimeout(watchdog);
          document.documentElement.dataset.fallback = "1";
          setReady(true);
        }
      })
      .catch((err) => {
        console.error("Failed to load engine module:", err);
        window.clearTimeout(watchdog);
        document.documentElement.dataset.fallback = "1";
        setReady(true);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  const setView = useCallback((v: ViewMode) => {
    setViewState(v);
    engineRef.current?.setView(v);
  }, []);

  const setFlipped = useCallback((f: boolean) => {
    setFlippedState(f);
    engineRef.current?.setFlipped(f);
  }, []);

  const close = useCallback(() => {
    if (panel !== "none") setPanel("none");
    else engineRef.current?.select(null);
  }, [panel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) {
        if (e.altKey && e.key === "3") {
          e.preventDefault();
          setView(view === "3d" ? "2d" : "3d");
        }
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === "escape") close();
      else if (k === "3") setView(view === "3d" ? "2d" : "3d");
      else if (k === "f") setFlipped(!flipped);
      else if (k === "?" || k === "h") setPanel((p) => (p === "help" ? "none" : "help"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, flipped, close, setView, setFlipped]);

  // keep flip state in sync when the engine unflips on scroll
  useEffect(() => {
    if (!flipped) return;
    const onScroll = () => setFlipped(false);
    const id = window.setTimeout(() => window.addEventListener("scroll", onScroll, { once: true }), 400);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("scroll", onScroll);
    };
  }, [flipped, setFlipped]);

  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const current = sections.find((s) => s.id === section)!;
  const hoverInfo = hoverText(hover.ref, hover.pin);
  const showLabel = outro > 0.55 && !selected;

  const sectionParts = useMemo(() => {
    if (section === "inicio") return [];
    return parts.filter((p) => p.section === section && p.interactive && p.kind !== "switch");
  }, [section]);

  return (
    <>
      <div className="stage" aria-hidden="true">
        <canvas ref={canvasRef} />
      </div>
      <div ref={spacerRef} className="scroll-spacer" aria-hidden="true" style={{ height: "1800vh" }} />

      {!ready && (
        <div className="boot" role="status">
          <span className="dot dot--on" />
          <span className="silk">cargando placa</span>
        </div>
      )}

      <header className="bar">
        <div className="bar__file">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="bar__mark" src="/dkns.png" alt="" width={22} height={22} />
          <span className="bar__name">
            Jorge Cuadrado<span> Criado</span>
          </span>
          <span className="bar__path">jorge_cuadrado.pcb</span>
        </div>
        <span className="bar__sheet silk" aria-hidden="true">
          {current.sheet}/{sections.length} · {current.name}
        </span>
        <nav className="tabs" aria-label="Hojas">
          {sections.map((s) => (
            <button
              key={s.id}
              className="tab"
              aria-current={s.id === section}
              onClick={() => engineRef.current?.goToSection(s.id)}
            >
              <span className={`dot ${s.id === section ? "dot--on" : ""}`} />
              <span className="tab__n">{s.sheet}</span>
              <span className="tab__label">{s.name}</span>
            </button>
          ))}
        </nav>
        <div className="tools">
          <div className="seg" role="group" aria-label="Vista">
            <button className="btn" aria-pressed={view === "3d"} onClick={() => setView("3d")} title="Visor 3D (3)">
              3d
            </button>
            <button className="btn" aria-pressed={view === "2d"} onClick={() => setView("2d")} title="Editor de PCB (3)">
              pcb
            </button>
          </div>
          <button className="btn" aria-pressed={flipped} onClick={() => setFlipped(!flipped)} title="Ver la cara inferior (F)">
            <FlipVertical2 size={15} strokeWidth={1.5} />
            <span className="btn__label">voltear</span>
          </button>
          <button className="btn" onClick={() => setPanel("help")} aria-label="Atajos de teclado" title="Atajos (?)">
            <CircleHelp size={15} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      {!showLabel && (
        <section className={`note ${selected ? "note--behind" : ""}`} aria-live="polite">
          <div className="note__sheet">
            <span className="silk">
              hoja {current.sheet}/{sections.length} · {current.name}
            </span>
            <span className="silk">{flipped ? "cara inferior" : view === "2d" ? "editor de pcb" : "visor 3d"}</span>
          </div>
          {section === "inicio" ? (
            <>
              <h1>
                {person.given} {person.family}
              </h1>
              <p className="note__role">
                {person.role} · {person.location}
              </p>
              <p>{person.focus}</p>
              <p className="note__cue">{current.hint}</p>
            </>
          ) : (
            <>
              <h2>{current.name.charAt(0).toUpperCase() + current.name.slice(1)}</h2>
              <p>{current.hint}</p>
            </>
          )}
          <ul className="note__legend">
            {current.legend.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      )}

      {hoverInfo && mousePos && !selected && (
        <div
          className="probe-badge"
          style={{
            left: Math.min(typeof window !== "undefined" ? window.innerWidth - 240 : 800, mousePos.x + 14),
            top: Math.max(12, mousePos.y - 48),
          }}
          aria-hidden="true"
        >
          <div className="probe-badge__header">
            <span className="probe-badge__ref">{hoverInfo[0]}</span>
            <span className="probe-badge__name">{hoverInfo[1]}</span>
          </div>
          <div className="probe-badge__hint">
            <span>pulsa para abrir</span>
            <span className="probe-badge__arrow">↗</span>
          </div>
        </div>
      )}

      {selected && <Inspector refdes={selected} onClose={() => engineRef.current?.select(null)} />}

      <section className="label" data-show={showLabel} aria-hidden={!showLabel}>
        <div className="label__top">
          <span>jcc-portfolio · rev 2026.09</span>
          <span>{parts.length + passives.length} componentes</span>
        </div>
        <h2>
          {person.given} {person.family}
        </h2>
        <p>
          Fin de la pista. Para proyectos o puestos de trabajo:
        </p>
        <div className="actions">
          <a
            className="btn btn--gold"
            href={`mailto:${person.email}`}
            tabIndex={showLabel ? 0 : -1}
            title={person.email}
          >
            <Mail size={14} strokeWidth={1.75} />
            <span>email</span>
          </a>
          <a
            className="btn btn--gold"
            href={person.cv}
            download
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={showLabel ? 0 : -1}
            title="Descargar CV (PDF)"
          >
            <FileText size={14} strokeWidth={1.75} />
            <span>cv</span>
          </a>
          <a
            className="btn btn--ink"
            href={person.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={showLabel ? 0 : -1}
            title="Perfil de LinkedIn"
          >
            <span>linkedin</span>
          </a>
          <a
            className="btn btn--ink"
            href={person.github}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={showLabel ? 0 : -1}
            title="Perfil de GitHub"
          >
            <span>github</span>
          </a>
        </div>
      </section>

      <footer className="status">
        <span className="status__cell status__cell--xy">
          <i>x</i>
          <span className="status__num" ref={hx}>
            0.00
          </span>
          <i>y</i>
          <span className="status__num" ref={hy}>
            0.00
          </span>
          <i>mm</i>
        </span>
        <span className="status__cell status__cell--grid">
          <i>rejilla</i> 1.27 mm
        </span>
        <span className="status__cell status__cell--net">
          <i>net</i> <span ref={hnet}>/VBUS</span>
        </span>
        <span className="status__cell">
          <i>longitud</i> <span ref={hlen}>0.00 mm</span>
        </span>
        <span className="status__cell">
          <i>colocados</i> <span ref={hplaced}>0</span>
        </span>
        <span className="status__cell status__cell--grow status__cell--hover">
          {hoverInfo ? (
            <>
              <b>{hoverInfo[0]}</b>&nbsp;·&nbsp;{hoverInfo[1]}&nbsp;·&nbsp;{hoverInfo[2]}
            </>
          ) : (
            <span style={{ color: "var(--tin-4)" }}>arrastra para orbitar · pulsa un componente para inspeccionarlo</span>
          )}
        </span>
        <span className="status__cell" style={{ borderRight: 0 }}>
          <span className="status__bar">
            <span ref={hprog} />
          </span>
        </span>
      </footer>

      {panel === "help" && (
        <div className="scrim" onClick={() => setPanel("none")}>
          <div
            className="sheet sheet--narrow"
            role="dialog"
            aria-modal="true"
            aria-label="Atajos"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="inspector__head">
              <span className="silk">atajos</span>
              <button className="btn" onClick={() => setPanel("none")} aria-label="Cerrar">
                <X size={15} strokeWidth={1.5} />
                <kbd>esc</kbd>
              </button>
            </div>
            <div className="sheet__body">
              <dl className="keys">
                {[
                  ["scroll", "rutear la pista y colocar componentes"],
                  ["clic", "inspeccionar un componente"],
                  ["arrastrar", "orbitar la cámara"],
                  ["3", "alternar visor 3d y editor de pcb"],
                  ["f", "voltear la placa"],
                  ["esc", "cerrar"],
                  ["inicio", "volver al principio"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>
                      <kbd className="key">{k}</kbd>
                    </dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
