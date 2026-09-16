"use client";

import { X } from "lucide-react";
import {
  certs,
  contactPins,
  jobs,
  person,
  projects,
  skillGroups,
  studies,
} from "@/data/portfolio";
import { partByRef } from "./layout";

const LED_CSS: Record<string, string> = {
  green: "var(--led-green)",
  amber: "var(--led-amber)",
  blue: "var(--led-blue)",
  white: "#f4f8ff",
};

function Props({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="props">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Footprint({ refdes }: { refdes: string }) {
  const p = partByRef.get(refdes);
  if (!p) return null;
  return (
    <div className="footprint">
      {p.footprint} · capa F.Cu · x {p.x.toFixed(2)} y {p.y.toFixed(2)} mm
    </div>
  );
}

function Body({ refdes }: { refdes: string }) {
  const part = partByRef.get(refdes);
  if (!part) return null;

  if (part.kind === "chip") {
    const pr = projects[part.index];
    return (
      <>
        <h2>{pr.name}</h2>
        <p className="lede">{pr.summary}</p>
        {pr.body.map((b) => (
          <p key={b}>{b}</p>
        ))}
        <Props rows={[["encapsulado", (part.pkg ?? "").toLowerCase()], ...(pr.facts ?? []), ["año", pr.year]]} />
        <div className="silk">bloques del die</div>
        <ul className="nets">
          {pr.stack.map((s) => (
            <li key={s} className="net">
              {s}
            </li>
          ))}
        </ul>
        {pr.links && pr.links.length > 0 && (
          <div className="actions">
            {pr.links.map((l, i) => (
              <a
                key={l.href}
                className={`btn ${i === 0 ? "btn--gold" : "btn--line"}`}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {l.label}
              </a>
            ))}
          </div>
        )}
        <Footprint refdes={refdes} />
      </>
    );
  }

  if (part.kind === "capacitor") {
    const j = jobs[part.index];
    return (
      <>
        <h2>{j.role}</h2>
        <p className="lede">
          {j.org} · {j.place}
        </p>
        <Props
          rows={[
            ["periodo", j.end === null ? `${j.start} – hoy` : j.start === j.end ? String(j.start) : `${j.start} – ${j.end}`],
            ["altura del condensador", `${part.height.toFixed(1)} mm`],
          ]}
        />
        <ul className="bullets">
          {j.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
        <Footprint refdes={refdes} />
      </>
    );
  }

  if (part.kind === "crystal") {
    const s = studies[part.index];
    return (
      <>
        <h2>{s.title}</h2>
        <p className="lede">{s.org}</p>
        <p>{s.detail}</p>
        <Props rows={[["periodo", s.period], ["grabado", s.marking.join(" · ").toLowerCase()]]} />
        <Footprint refdes={refdes} />
      </>
    );
  }

  if (part.kind === "resistor") {
    const c = certs[part.index];
    return (
      <>
        <h2>{c.title}</h2>
        <p className="lede">{c.org}</p>
        <p>{c.detail}</p>
        <Props
          rows={[
            ...(c.year ? ([["año", c.year]] as [string, string][]) : []),
            ["bandas", c.bands.map((b) => BAND_ES[b] ?? b).join(" · ")],
          ]}
        />
        {c.code === c.year && <p>Las cuatro primeras bandas leen {c.year}.</p>}
        <Footprint refdes={refdes} />
      </>
    );
  }

  if (part.kind === "led") {
    const gi = Math.floor(part.index / 100);
    const g = skillGroups[gi];
    return (
      <>
        <h2>{g.name.charAt(0).toUpperCase() + g.name.slice(1)}</h2>
        <p className="lede">
          {g.skills.length} leds en serie · color{" "}
          <span style={{ color: LED_CSS[g.color] }}>{COLOR_ES[g.color]}</span>
        </p>
        <ul className="nets">
          {g.skills.map((s) => (
            <li key={s} className={`net ${s === part.value ? "net--on" : ""}`}>
              {s}
            </li>
          ))}
        </ul>
        <p>Pulsar un led lo apaga o lo enciende. La tira completa está en la hoja 5.</p>
        <Footprint refdes={refdes} />
      </>
    );
  }

  if (part.kind === "terminal") {
    return (
      <>
        <h2>Contacto</h2>
        <p className="lede">Cada tornillo del bornero abre un enlace.</p>
        <ul className="pins">
          {contactPins.map((c, i) => (
            <li key={c.label}>
              <a
                href={c.href}
                target={c.href.startsWith("mailto:") ? undefined : "_blank"}
                rel="noopener noreferrer"
              >
                <span className={`pin-pad ${i === 0 ? "pin-pad--sq" : ""}`} />
                <span className="silk">
                  {i + 1} · {c.label}
                </span>
                <span>{c.value}</span>
              </a>
            </li>
          ))}
        </ul>
        <Footprint refdes={refdes} />
      </>
    );
  }

  if (part.kind === "usbc") {
    return (
      <>
        <h2>
          {person.given} {person.family}
        </h2>
        <p className="lede">{person.summary}</p>
        {person.bio.map((b) => (
          <p key={b}>{b}</p>
        ))}
        <Props rows={person.languages} />
        <div className="silk">en el aula</div>
        <ul className="bullets">
          {person.classroom.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Footprint refdes={refdes} />
      </>
    );
  }
  return null;
}

const BAND_ES: Record<string, string> = {
  black: "negro",
  brown: "marrón",
  red: "rojo",
  orange: "naranja",
  yellow: "amarillo",
  green: "verde",
  blue: "azul",
  gold: "oro",
};

const COLOR_ES: Record<string, string> = {
  green: "verde",
  amber: "ámbar",
  blue: "azul",
  white: "blanco",
};

export function Inspector({ refdes, onClose }: { refdes: string; onClose: () => void }) {
  const part = partByRef.get(refdes);
  if (!part) return null;
  const pkg = part.pkg ?? part.footprint.split(":")[1]?.split("_").slice(0, 3).join("_");
  return (
    <aside className="inspector" aria-label={`Propiedades de ${refdes}`} key={refdes}>
      <div className="inspector__head">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
          <span className="ref">{refdes}</span>
          <span className="silk" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            propiedades · {pkg}
          </span>
        </div>
        <button className="btn" onClick={onClose} aria-label="Cerrar">
          <X size={15} strokeWidth={1.5} />
          <kbd>esc</kbd>
        </button>
      </div>
      <div className="inspector__body">
        <Body refdes={refdes} />
      </div>
    </aside>
  );
}
