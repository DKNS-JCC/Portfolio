/*
 * El contenido vive en content/portfolio.json y se edita con `npm run editor`.
 * La placa se construye sola a partir de él: añadir o quitar un elemento
 * recoloca componentes, pistas, serigrafía y scroll. Las referencias
 * (U1, C1, Y1…) se numeran en el orden de cada lista.
 *
 *   projects     → circuitos integrados (U). `package` marca el tamaño del chip
 *   jobs         → condensadores (C). La altura sale de los años en el puesto
 *   studies      → cristales de cuarzo (Y)
 *   certs        → resistencias (R)
 *   skillGroups  → LEDs (D), un color por grupo
 *   person       → perfil, cara inferior y bornero de contacto J2
 *
 * Este archivo solo declara los tipos y comprueba el JSON al compilar.
 */

import raw from "../../content/portfolio.json";

export type LinkRef = { label: string; href: string };

export const PACKAGES = ["LQFP-144", "LQFP-100", "LQFP-64", "LQFP-48", "QFN-56", "BGA-100", "SOIC-16", "SOIC-8"] as const;
export type Package = (typeof PACKAGES)[number];

export interface Project {
  name: string;
  year: string;
  summary: string;
  body: string[];
  /** bloques del die al decapar el chip: las tecnologías del proyecto */
  stack: string[];
  /** filas clave · valor del panel de propiedades */
  facts?: [string, string][];
  links?: LinkRef[];
  /** tamaño del chip. Por defecto LQFP-64 */
  package?: Package;
  /** texto grabado en el chip, dos líneas cortas. Por defecto, el nombre */
  marking?: [string, string];
}

export interface Job {
  role: string;
  org: string;
  place: string;
  start: number;
  /** null = sigue en curso */
  end: number | null;
  /** texto impreso en la funda del condensador */
  sleeve: string;
  bullets: string[];
}

export interface Study {
  title: string;
  org: string;
  period: string;
  /** grabado del cristal, dos líneas cortas */
  marking: [string, string];
  detail: string;
}

export interface Cert {
  title: string;
  org: string;
  year: string;
  /** texto serigrafiado junto a la resistencia */
  code: string;
  detail: string;
  /** colores de bandas, de izquierda a derecha */
  bands: string[];
}

export const LED_COLORS = ["green", "amber", "blue", "white"] as const;
export type LedColor = (typeof LED_COLORS)[number];

export interface SkillGroup {
  id: string;
  name: string;
  color: LedColor;
  skills: string[];
}

export interface Person {
  given: string;
  family: string;
  role: string;
  focus: string;
  location: string;
  summary: string;
  bio: string[];
  email: string;
  github: string;
  linkedin: string;
  cv: string;
  languages: [string, string][];
  classroom: string[];
}

export interface PortfolioContent {
  person: Person;
  projects: Project[];
  jobs: Job[];
  studies: Study[];
  certs: Cert[];
  skillGroups: SkillGroup[];
}

export const BAND_COLORS = ["black", "brown", "red", "orange", "yellow", "green", "blue", "violet", "gray", "white", "gold", "silver"];

/* --------------------------------------------------------------- checks */

function check(data: PortfolioContent): PortfolioContent {
  const errors: string[] = [];
  const need = (ok: unknown, msg: string) => {
    if (!ok) errors.push(msg);
  };
  const text = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  const texts = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");

  const p = data.person;
  for (const k of ["given", "family", "role", "location", "summary", "email", "github", "linkedin", "cv"] as const)
    need(text(p?.[k]), `person.${k} está vacío`);

  need(data.projects?.length > 0, "hace falta al menos un proyecto");
  data.projects?.forEach((pr, i) => {
    const at = `projects[${i}] (${pr.name || "sin nombre"})`;
    need(text(pr.name), `${at}: falta name`);
    need(text(pr.summary), `${at}: falta summary`);
    need(texts(pr.body), `${at}: body debe ser una lista de párrafos`);
    need(texts(pr.stack) && pr.stack.length > 0, `${at}: stack necesita al menos una tecnología`);
    need(!pr.package || PACKAGES.includes(pr.package), `${at}: package "${pr.package}" no existe (${PACKAGES.join(", ")})`);
    need(!pr.links || pr.links.every((l) => text(l.label) && text(l.href)), `${at}: cada enlace necesita label y href`);
  });
  data.jobs?.forEach((j, i) => {
    const at = `jobs[${i}] (${j.role || "sin puesto"})`;
    need(text(j.role) && text(j.org), `${at}: faltan role u org`);
    need(Number.isInteger(j.start), `${at}: start debe ser un año`);
    need(j.end === null || Number.isInteger(j.end), `${at}: end debe ser un año o null`);
  });
  data.studies?.forEach((s, i) => need(text(s.title), `studies[${i}]: falta title`));
  data.certs?.forEach((c, i) => {
    need(text(c.title), `certs[${i}]: falta title`);
    need(c.bands?.every((b) => BAND_COLORS.includes(b)), `certs[${i}]: color de banda desconocido`);
  });
  data.skillGroups?.forEach((g, i) => {
    need(LED_COLORS.includes(g.color), `skillGroups[${i}]: color "${g.color}" no existe (${LED_COLORS.join(", ")})`);
    need(texts(g.skills) && g.skills.length > 0, `skillGroups[${i}]: skills vacío`);
  });

  if (errors.length) throw new Error(`content/portfolio.json tiene errores:\n- ${errors.join("\n- ")}`);
  return data;
}

const content = check(raw as unknown as PortfolioContent);

export const person = content.person;
export const projects = content.projects;
export const jobs = content.jobs;
export const studies = content.studies;
export const certs = content.certs;
export const skillGroups = content.skillGroups;

export const contactPins: { label: string; value: string; href: string }[] = [
  { label: "email", value: person.email, href: `mailto:${person.email}` },
  { label: "github", value: person.github.replace(/^https?:\/\/(www\.)?/, ""), href: person.github },
  { label: "linkedin", value: person.linkedin.replace(/^https?:\/\/(www\.)?(linkedin\.com\/)?/, ""), href: person.linkedin },
  { label: "cv", value: person.cv.replace(/^\//, ""), href: person.cv },
];
