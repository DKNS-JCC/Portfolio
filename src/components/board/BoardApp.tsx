"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleHelp, FlipVertical2, X } from "lucide-react";
import { contactPins, person, projects } from "@/data/portfolio";
import type { BoardEngine, ViewMode } from "./engine";
import { Inspector } from "./Inspector";
import { parts, partByRef, passives, sections, type SectionId } from "./layout";

type Panel = "none" | "help";

function hoverText(ref: string | null, pin?: number) {
  if (!ref) return null;
  const p = partByRef.get(ref);
  if (!p) return null;
  if (p.kind === "terminal" && pin !== undefined) return [ref, `pin ${pin + 1} · ${contactPins[pin].label}`, "abre el enlace"];
  const pkg = p.pkg ?? p.footprint.split(":")[1]?.split("_").slice(0, 2).join(" ");
  const value = p.kind === "chip" ? projects[p.index].name : p.value;
  return [ref, value, pkg];
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
    import("./engine").then(({ BoardEngine }) => {
      if (cancelled || !canvasRef.current || !spacerRef.current) return;
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
          ready: () => setReady(true),
          outro: (k) => setOutro(k),
          error: () => {
            document.documentElement.dataset.fallback = "1";
          },
        },
        fonts,
      );
      engineRef.current = engine;
      engine.init();
    });
    return () => {
      cancelled = true;
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

  const current = sections.find((s) => s.id === section)!;
  const hoverInfo = hoverText(hover.ref, hover.pin);
  const showLabel = outro > 0.55 && !selected;

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
          <span className="bar__path">jorge_cuadrado.kicad_pcb</span>
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
          Fin de la pista. Para proyectos, clases o puestos de trabajo:
        </p>
        <div className="actions">
          <a className="btn btn--gold" href={`mailto:${person.email}`} tabIndex={showLabel ? 0 : -1}>
            {person.email}
          </a>
          <a className="btn btn--ink" href={person.github} target="_blank" rel="noopener noreferrer" tabIndex={showLabel ? 0 : -1}>
            github
          </a>
          <a className="btn btn--ink" href={person.linkedin} target="_blank" rel="noopener noreferrer" tabIndex={showLabel ? 0 : -1}>
            linkedin
          </a>
          <a className="btn btn--ink" href={person.cv} download tabIndex={showLabel ? 0 : -1}>
            cv
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
