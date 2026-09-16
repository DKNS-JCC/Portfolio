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

const KIND_LABELS: Record<string, string> = {
  chip: "proyecto",
  capacitor: "experiencia",
  crystal: "formación",
  resistor: "certificación",
  led: "conocimientos",
  terminal: "contacto",
  usbc: "sobre mí",
};

function Props({ rows }: { rows: [string, string][] }) {
  if (!rows || rows.length === 0) return null;
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

function Body({ refdes }: { refdes: string }) {
  const part = partByRef.get(refdes);
  if (!part) return null;

  if (part.kind === "chip") {
    const pr = projects[part.index];
    const facts: [string, string][] = [
      ...(pr.facts ?? []),
      ["año", pr.year],
    ];
    return (
      <>
        <h2>{pr.name}</h2>
        <p className="lede">{pr.summary}</p>
        {pr.body.map((b) => (
          <p key={b}>{b}</p>
        ))}
        <Props rows={facts} />
        <div className="silk">tecnologías</div>
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
      </>
    );
  }

  if (part.kind === "capacitor") {
    const j = jobs[part.index];
    const period = j.end === null ? `${j.start} – hoy` : j.start === j.end ? String(j.start) : `${j.start} – ${j.end}`;
    return (
      <>
        <h2>{j.role}</h2>
        <p className="lede">
          {j.org} · {j.place}
        </p>
        <Props rows={[["periodo", period]]} />
        <ul className="bullets">
          {j.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
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
        <Props rows={[["periodo", s.period]]} />
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
        {c.year && <Props rows={[["año", c.year]]} />}
      </>
    );
  }

  if (part.kind === "led") {
    const gi = Math.floor(part.index / 100);
    const g = skillGroups[gi];
    return (
      <>
        <h2>{g.name.charAt(0).toUpperCase() + g.name.slice(1)}</h2>
        <p className="lede">{g.skills.length} tecnologías</p>
        <ul className="nets">
          {g.skills.map((s) => (
            <li key={s} className={`net ${s === part.value ? "net--on" : ""}`}>
              {s}
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (part.kind === "terminal") {
    return (
      <>
        <h2>Contacto</h2>
        <p className="lede">Enlaces directos de contacto.</p>
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
      </>
    );
  }
  return null;
}

export function Inspector({ refdes, onClose }: { refdes: string; onClose: () => void }) {
  const part = partByRef.get(refdes);
  if (!part) return null;
  const label = KIND_LABELS[part.kind] ?? "detalle";
  return (
    <aside className="inspector" aria-label={`Propiedades de ${refdes}`} key={refdes}>
      <div className="inspector__head">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
          <span className="ref">{refdes}</span>
          <span className="silk" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {label}
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
