// Content editor for content/portfolio.json. No build step, no dependencies.

const PACKAGES = [
  ["LQFP-144", "enorme · 20 × 20 mm"],
  ["LQFP-100", "grande · 14 × 14 mm"],
  ["LQFP-64", "mediano · 10 × 10 mm"],
  ["LQFP-48", "pequeño · 7 × 7 mm"],
  ["QFN-56", "pequeño sin patas · 7 × 7 mm"],
  ["BGA-100", "bolas por debajo · 10 × 10 mm"],
  ["SOIC-16", "estrecho · 4 × 10 mm"],
  ["SOIC-8", "mínimo · 4 × 5 mm"],
];
const LED_COLORS = [
  ["green", "verde"],
  ["amber", "ámbar"],
  ["blue", "azul"],
  ["white", "blanco"],
];
const BAND_HEX = {
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

/* ------------------------------------------------------------ sections */

const SHEETS = [
  {
    key: "person",
    ref: "J1",
    name: "perfil",
    single: true,
    hint: "Datos de la nota de inicio, la cara inferior de la placa y el bornero de contacto.",
    fields: [
      { key: "given", label: "nombre", kind: "text" },
      { key: "family", label: "apellidos", kind: "text" },
      { key: "role", label: "puesto", kind: "text" },
      { key: "location", label: "ubicación", kind: "text" },
      { key: "focus", label: "áreas", kind: "text", wide: true, help: "Separadas por ·" },
      { key: "summary", label: "resumen", kind: "textarea", wide: true },
      { key: "bio", label: "biografía", kind: "paragraphs", wide: true, help: "Una línea en blanco separa párrafos." },
      { key: "email", label: "email", kind: "text" },
      { key: "github", label: "github", kind: "text" },
      { key: "linkedin", label: "linkedin", kind: "text" },
      { key: "languages", label: "idiomas", kind: "pairs", help: "Uno por línea: idioma: nivel" },
      { key: "classroom", label: "en el aula", kind: "lines", wide: true, help: "Una idea por línea." },
    ],
  },
  {
    key: "projects",
    ref: "U",
    name: "proyectos",
    title: (it) => it.name || "proyecto sin nombre",
    hint: "El orden es el de la placa: el primero queda junto a la experiencia. Si no caben en una fila, se abre otra y la placa crece.",
    blank: () => ({
      name: "Nuevo proyecto",
      year: String(new Date().getFullYear()),
      package: "LQFP-64",
      summary: "",
      body: [],
      stack: [],
      facts: [],
      links: [],
    }),
    fields: [
      { key: "name", label: "nombre", kind: "text" },
      { key: "year", label: "año", kind: "text" },
      {
        key: "package",
        label: "tamaño del chip",
        kind: "select",
        options: PACKAGES.map(([v, d]) => [v, `${v} · ${d}`]),
        help: "Cuanto más grande el proyecto, más grande el encapsulado.",
      },
      { key: "marking", label: "grabado del chip", kind: "marking", help: "Opcional. Dos líneas cortas; si se deja vacío usa el nombre." },
      { key: "summary", label: "resumen", kind: "textarea", wide: true, help: "Una o dos frases. Es lo primero que se lee al decapar el chip." },
      { key: "body", label: "detalle", kind: "paragraphs", wide: true, help: "Una línea en blanco separa párrafos." },
      { key: "stack", label: "tecnologías", kind: "tags", wide: true, help: "Separadas por comas. Cada una es un bloque del die." },
      { key: "facts", label: "datos", kind: "pairs", wide: true, help: "Uno por línea: clave: valor" },
      { key: "links", label: "enlaces", kind: "links", wide: true, help: "Uno por línea: etiqueta | https://…" },
    ],
  },
  {
    key: "jobs",
    ref: "C",
    name: "experiencia",
    title: (it) => [it.role, it.org].filter(Boolean).join(" · ") || "puesto sin nombre",
    hint: "Cada puesto es un condensador. Su altura sale de los años entre el inicio y el fin (o hoy).",
    blank: () => ({
      role: "Nuevo puesto",
      org: "",
      place: "",
      start: new Date().getFullYear(),
      end: null,
      sleeve: "",
      bullets: [],
    }),
    fields: [
      { key: "role", label: "puesto", kind: "text" },
      { key: "org", label: "organización", kind: "text" },
      { key: "place", label: "lugar", kind: "text" },
      { key: "sleeve", label: "texto de la funda", kind: "text", help: "Siglas cortas, se imprimen en el condensador." },
      { key: "start", label: "año de inicio", kind: "number" },
      { key: "end", label: "año de fin", kind: "yearEnd" },
      { key: "bullets", label: "tareas", kind: "lines", wide: true, help: "Una por línea." },
    ],
  },
  {
    key: "studies",
    ref: "Y",
    name: "formación",
    title: (it) => it.title || "estudio sin título",
    hint: "Cristales de cuarzo en la fila superior. Entre formación y títulos caben bien hasta seis.",
    blank: () => ({ title: "Nuevo estudio", org: "", period: "", marking: ["", ""], detail: "" }),
    fields: [
      { key: "title", label: "título", kind: "text", wide: true },
      { key: "org", label: "centro", kind: "text" },
      { key: "period", label: "periodo", kind: "text", help: "Por ejemplo 2022 – 2026 o en curso" },
      { key: "marking", label: "grabado del cristal", kind: "marking", help: "Dos líneas cortas." },
      { key: "detail", label: "detalle", kind: "textarea", wide: true },
    ],
  },
  {
    key: "certs",
    ref: "R",
    name: "títulos",
    title: (it) => it.title || "título sin nombre",
    hint: "Resistencias junto a los cristales. Los colores de las bandas son decorativos: pueden codificar el año.",
    blank: () => ({ title: "Nuevo título", org: "", year: "", code: "", detail: "", bands: ["brown", "black", "red", "gold"] }),
    fields: [
      { key: "title", label: "título", kind: "text", wide: true },
      { key: "org", label: "entidad", kind: "text" },
      { key: "year", label: "año", kind: "text" },
      { key: "code", label: "texto serigrafiado", kind: "text", help: "Muy corto: 2023, B2…" },
      { key: "bands", label: "bandas", kind: "bands", help: `Colores separados por comas: ${Object.keys(BAND_HEX).join(", ")}` },
      { key: "detail", label: "detalle", kind: "textarea", wide: true },
    ],
  },
  {
    key: "skillGroups",
    ref: "D",
    name: "conocimientos",
    title: (it) => it.name || "grupo sin nombre",
    hint: "Cada grupo es un color de LED. Si hay más de 30 LEDs en total, la tira se compacta.",
    blank: () => ({ id: "", name: "nuevo grupo", color: "green", skills: [] }),
    fields: [
      { key: "name", label: "grupo", kind: "text" },
      { key: "color", label: "color del led", kind: "select", options: LED_COLORS },
      { key: "skills", label: "herramientas", kind: "lines", wide: true, help: "Una por línea. Nombres cortos: se serigrafían junto al LED." },
    ],
  },
];

/* --------------------------------------------------------------- state */

const state = { data: null, sheet: "projects", index: 0, dirty: false };
const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined) node.append(c);
  return node;
};

const sheetDef = () => SHEETS.find((s) => s.key === state.sheet);

function setState(kind, text) {
  $("state-dot").className = `dot dot--${kind}`;
  $("state-text").textContent = text;
}

function markDirty() {
  state.dirty = true;
  setState("dirty", "cambios sin guardar");
  renderErrors();
}

/* ------------------------------------------------------------ validation */

function validate(d) {
  const errors = [];
  const need = (ok, msg) => ok || errors.push(msg);
  const text = (v) => typeof v === "string" && v.trim().length > 0;
  for (const k of ["given", "family", "role", "location", "summary", "email", "github", "linkedin"])
    need(text(d.person[k]), `perfil: falta ${k}`);
  need(d.projects.length > 0, "hace falta al menos un proyecto");
  d.projects.forEach((p, i) => {
    const at = `U${i + 1} ${p.name || ""}`;
    need(text(p.name), `${at}: falta el nombre`);
    need(text(p.summary), `${at}: falta el resumen`);
    need(p.stack.length > 0, `${at}: añade al menos una tecnología`);
    need((p.links ?? []).every((l) => text(l.label) && /^(https?:|mailto:|\/)/.test(l.href)), `${at}: algún enlace no es válido`);
  });
  d.jobs.forEach((j, i) => {
    const at = `C${i + 1} ${j.role || ""}`;
    need(text(j.role) && text(j.org), `${at}: faltan puesto u organización`);
    need(Number.isInteger(j.start), `${at}: el año de inicio no es válido`);
    need(j.end === null || (Number.isInteger(j.end) && j.end >= j.start), `${at}: el año de fin no es válido`);
  });
  d.studies.forEach((s, i) => need(text(s.title), `Y${i + 1}: falta el título`));
  d.certs.forEach((c, i) => {
    need(text(c.title), `R${i + 1}: falta el título`);
    need(c.bands.length > 0 && c.bands.every((b) => b in BAND_HEX), `R${i + 1}: color de banda desconocido`);
  });
  d.skillGroups.forEach((g, i) => need(g.skills.length > 0, `grupo ${i + 1}: sin herramientas`));
  return errors;
}

function renderErrors() {
  const errors = validate(state.data);
  const line = $("errors-line");
  line.textContent = errors.length ? `${errors.length} ${errors.length === 1 ? "aviso" : "avisos"} · ${errors[0]}` : "sin errores";
  line.style.color = errors.length ? "#f1c9c3" : "";
  return errors;
}

/* ----------------------------------------------------------- rendering */

function refRange(sheet, i) {
  if (sheet.key !== "skillGroups") return `${sheet.ref}${i + 1}`;
  const before = state.data.skillGroups.slice(0, i).reduce((a, g) => a + g.skills.length, 0);
  const n = state.data.skillGroups[i].skills.length;
  return n ? `D${before + 1}` : "D–";
}

function renderSheets() {
  const nav = $("sheets");
  nav.replaceChildren(
    ...SHEETS.map((s) =>
      el(
        "button",
        {
          class: "sheet-tab",
          "aria-current": String(s.key === state.sheet),
          onclick: () => {
            state.sheet = s.key;
            state.index = 0;
            render();
          },
        },
        el("span", { class: "sheet-tab__ref" }, s.single ? s.ref : s.ref),
        el("span", { class: "sheet-tab__name" }, s.name),
        el("span", { class: "sheet-tab__count" }, s.single ? "" : String(state.data[s.key].length)),
      ),
    ),
  );
}

function renderList() {
  const s = sheetDef();
  const list = $("list");
  if (s.single) {
    list.replaceChildren(el("div", { class: "list__head" }, el("span", { class: "silk" }, s.name)), el("p", { class: "list__hint" }, s.hint));
    return;
  }
  const items = state.data[s.key];
  const move = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    state.index = j;
    markDirty();
    render();
  };
  list.replaceChildren(
    el(
      "div",
      { class: "list__head" },
      el("span", { class: "silk" }, `${s.name} · ${items.length}`),
      el(
        "button",
        {
          class: "btn btn--line btn--sm",
          onclick: () => {
            items.push(s.blank());
            state.index = items.length - 1;
            markDirty();
            render();
          },
        },
        "añadir",
      ),
    ),
    el("p", { class: "list__hint" }, s.hint),
    items.length
      ? el(
          "ul",
          { class: "items" },
          items.map((it, i) =>
            el(
              "li",
              { class: "item", "aria-current": String(i === state.index) },
              el(
                "button",
                {
                  class: "item__pick",
                  onclick: () => {
                    state.index = i;
                    render();
                  },
                },
                el("span", { class: "item__ref" }, refRange(s, i)),
                el("span", {}, s.title(it)),
              ),
              el(
                "span",
                { class: "item__moves" },
                el("button", { class: "btn", title: "Subir", "aria-label": "Subir", disabled: i === 0, onclick: () => move(i, -1) }, "↑"),
                el("button", { class: "btn", title: "Bajar", "aria-label": "Bajar", disabled: i === items.length - 1, onclick: () => move(i, 1) }, "↓"),
              ),
            ),
          ),
        )
      : el("p", { class: "empty" }, "Sin elementos."),
  );
}

/* conversions between stored values and what the textarea shows */
const codec = {
  lines: [(v) => (v ?? []).join("\n"), (t) => t.split("\n").map((x) => x.trim()).filter(Boolean)],
  paragraphs: [
    (v) => (v ?? []).join("\n\n"),
    (t) => t.split(/\n\s*\n/).map((x) => x.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean),
  ],
  tags: [(v) => (v ?? []).join(", "), (t) => t.split(",").map((x) => x.trim()).filter(Boolean)],
  pairs: [
    (v) => (v ?? []).map(([k, x]) => `${k}: ${x}`).join("\n"),
    (t) =>
      t
        .split("\n")
        .map((line) => {
          const i = line.indexOf(":");
          return i < 0 ? null : [line.slice(0, i).trim(), line.slice(i + 1).trim()];
        })
        .filter((p) => p && p[0] && p[1]),
  ],
  links: [
    (v) => (v ?? []).map((l) => `${l.label} | ${l.href}`).join("\n"),
    (t) =>
      t
        .split("\n")
        .map((line) => {
          const [label, ...rest] = line.split("|");
          return { label: (label ?? "").trim(), href: rest.join("|").trim() };
        })
        .filter((l) => l.label || l.href),
  ],
  bands: [(v) => (v ?? []).join(", "), (t) => t.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)],
};

function fieldNode(item, f, onChange) {
  const help = f.help ? el("span", { class: "field__help" }, f.help) : null;
  const wrap = (...control) => el("label", { class: `field ${f.wide ? "field--wide" : ""}` }, el("span", { class: "silk" }, f.label), ...control, help);
  const set = (v) => {
    if (v === undefined) delete item[f.key];
    else item[f.key] = v;
    onChange();
  };

  switch (f.kind) {
    case "text":
      return wrap(el("input", { type: "text", value: item[f.key] ?? "", oninput: (e) => set(e.target.value) }));
    case "number":
      return wrap(el("input", { type: "number", value: item[f.key] ?? "", oninput: (e) => set(Number.parseInt(e.target.value, 10)) }));
    case "textarea":
      return wrap(el("textarea", { oninput: (e) => set(e.target.value) }, item[f.key] ?? ""));
    case "select": {
      const select = el(
        "select",
        { onchange: (e) => set(e.target.value) },
        f.options.map(([v, label]) => el("option", { value: v, selected: (item[f.key] ?? f.options[2]?.[0]) === v }, label)),
      );
      return wrap(select);
    }
    case "marking": {
      const current = item[f.key] ?? ["", ""];
      const inputs = [0, 1].map((k) =>
        el("input", {
          type: "text",
          maxlength: "12",
          value: current[k] ?? "",
          placeholder: k === 0 ? "línea 1" : "línea 2",
          oninput: () => {
            const v = inputs.map((x) => x.value.toUpperCase());
            set(v[0] || v[1] ? v : undefined);
          },
        }),
      );
      return el(
        "div",
        { class: "field" },
        el("span", { class: "silk" }, f.label),
        el("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:8px" }, inputs),
        help,
      );
    }
    case "yearEnd": {
      const ongoing = item[f.key] === null;
      const input = el("input", {
        type: "number",
        value: ongoing ? "" : (item[f.key] ?? ""),
        disabled: ongoing,
        oninput: (e) => set(Number.parseInt(e.target.value, 10)),
      });
      const box = el("input", {
        type: "checkbox",
        checked: ongoing,
        onchange: (e) => {
          input.disabled = e.target.checked;
          set(e.target.checked ? null : Number.parseInt(input.value, 10) || new Date().getFullYear());
          if (!e.target.checked && !input.value) input.value = String(item[f.key]);
        },
      });
      return el(
        "div",
        { class: "field" },
        el("span", { class: "silk" }, f.label),
        input,
        el("label", { class: "check" }, box, "sigue en curso"),
      );
    }
    case "bands": {
      const preview = el("span", { class: "bands" });
      const paint = () =>
        preview.replaceChildren(...(item[f.key] ?? []).map((b) => el("span", { style: `background:${BAND_HEX[b] ?? "transparent"}`, title: b })));
      paint();
      const [show, read] = codec.bands;
      return wrap(
        el("input", {
          type: "text",
          value: show(item[f.key]),
          oninput: (e) => {
            set(read(e.target.value));
            paint();
          },
        }),
        preview,
      );
    }
    default: {
      const [show, read] = codec[f.kind];
      return wrap(el("textarea", { oninput: (e) => set(read(e.target.value)) }, show(item[f.key])));
    }
  }
}

function renderForm() {
  const s = sheetDef();
  const form = $("form");
  const items = s.single ? null : state.data[s.key];
  const item = s.single ? state.data.person : items[state.index];
  if (!item) {
    form.replaceChildren(el("p", { class: "empty" }, "Añade un elemento para empezar."));
    return;
  }
  const refreshList = () => {
    markDirty();
    if (s.key === "skillGroups" && item.name) item.id = item.name.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase();
    renderList();
    renderSheets();
  };
  const remove = () => {
    if (!confirm(`¿Quitar «${s.title(item)}» de la placa?`)) return;
    items.splice(state.index, 1);
    state.index = Math.max(0, state.index - 1);
    markDirty();
    render();
  };
  form.replaceChildren(
    el(
      "div",
      { class: "form__inner" },
      el(
        "div",
        { class: "form__title" },
        el(
          "div",
          {},
          el("span", { class: "silk" }, s.single ? `${s.ref} · perfil` : `${refRange(s, state.index)} · ${s.name}`),
          el("h1", {}, s.single ? `${item.given} ${item.family}` : s.title(item)),
        ),
        s.single ? null : el("button", { class: "btn btn--line btn--danger", onclick: remove }, "quitar"),
      ),
      el("div", { class: "grid" }, s.fields.map((f) => fieldNode(item, f, refreshList))),
    ),
  );
}

function render() {
  renderSheets();
  renderList();
  renderForm();
  renderErrors();
}

/* ------------------------------------------------------------- actions */

async function save() {
  const errors = renderErrors();
  if (errors.length && !confirm(`Hay ${errors.length} avisos (${errors[0]}). La web no compilará así. ¿Guardar igualmente?`)) return false;
  const res = await fetch("/api/content", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.data),
  });
  if (!res.ok) {
    setState("error", (await res.json()).error ?? "no se pudo guardar");
    return false;
  }
  state.dirty = false;
  setState("ok", "guardado");
  refreshGit();
  return true;
}

async function refreshGit() {
  const g = await (await fetch("/api/git")).json();
  $("git-branch").innerHTML = `<i>rama</i> ${g.repo ? g.branch : "sin repositorio"}`;
  $("git-remote").innerHTML = `<i>remoto</i> ${g.remote ?? "ninguno"}`;
  return g;
}

$("save").addEventListener("click", save);

window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    save();
  }
});

window.addEventListener("beforeunload", (e) => {
  if (state.dirty) e.preventDefault();
});

$("cv-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  setState("dirty", "subiendo cv");
  const res = await fetch("/api/cv", { method: "PUT", body: file });
  const out = await res.json();
  setState(res.ok ? "ok" : "error", res.ok ? `cv actualizado · ${Math.round(out.bytes / 1024)} kb` : out.error);
  e.target.value = "";
  refreshGit();
});

$("publish").addEventListener("click", async () => {
  const g = await refreshGit();
  const other = g.other
    ? ` Ojo: hay ${g.other} ${g.other === 1 ? "archivo" : "archivos"} de código sin commitear fuera del contenido; publicar no los incluye.`
    : "";
  $("publish-info").textContent = (!g.repo
    ? "Esta carpeta no es un repositorio git: no se puede publicar."
    : g.remote
      ? `Se guardarán los cambios, se hará commit en ${g.branch} y se subirán a ${g.remote}. Si Cloudflare Pages está conectado a ese repositorio, la web se reconstruye sola.`
      : `Se guardarán los cambios y se hará commit en ${g.branch}. El repositorio no tiene remoto, así que no se subirá a ningún sitio.`) + other;
  $("publish-log").hidden = true;
  $("publish-go").disabled = !g.repo;
  $("publish-dialog").showModal();
});

$("publish-go").addEventListener("click", async (e) => {
  e.preventDefault();
  const button = e.currentTarget;
  button.disabled = true;
  const log = $("publish-log");
  log.hidden = false;
  log.textContent = "guardando…";
  if (!(await save())) {
    log.textContent = "no se ha guardado; no se publica";
    button.disabled = false;
    return;
  }
  log.textContent = "publicando…";
  const res = await fetch("/api/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: $("publish-message").value }),
  });
  const out = await res.json();
  log.textContent = (out.log ?? [out.error]).join("\n");
  setState(out.ok ? "ok" : "error", out.ok ? (out.pushed ? "publicado" : "commit hecho") : "error al publicar");
  button.disabled = false;
  refreshGit();
});

/* ---------------------------------------------------------------- boot */

(async () => {
  state.data = await (await fetch("/api/content")).json();
  for (const k of ["projects", "jobs", "studies", "certs", "skillGroups"]) state.data[k] ??= [];
  setState("ok", "sin cambios");
  render();
  refreshGit();
})();
