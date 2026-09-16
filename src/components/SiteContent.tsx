import { certs, contactPins, jobs, person, projects, skillGroups, studies } from "@/data/portfolio";

/*
 * The whole portfolio as plain HTML. Screen readers and search engines read this;
 * browsers without WebGL show it instead of the board.
 */
export default function SiteContent() {
  return (
    <main className="content sr-only">
      <h1>
        {person.given} {person.family}
      </h1>
      <p>
        {person.role} · {person.location}
      </p>
      <p>{person.summary}</p>
      {person.bio.map((b) => (
        <p key={b}>{b}</p>
      ))}

      <h2>Formación</h2>
      {studies.map((s) => (
        <section key={s.title}>
          <h3>{s.title}</h3>
          <p>
            {s.org} · {s.period}
          </p>
          <p>{s.detail}</p>
        </section>
      ))}
      {certs.map((c) => (
        <section key={c.title}>
          <h3>{c.title}</h3>
          <p>
            {c.org}
            {c.year ? ` · ${c.year}` : ""}
          </p>
        </section>
      ))}

      <h2>Experiencia</h2>
      {jobs.map((j) => (
        <section key={`${j.role}-${j.org}`}>
          <h3>
            {j.role} · {j.org}
          </h3>
          <p>
            {j.place} · {j.start}
            {j.end === null ? " – hoy" : j.end !== j.start ? ` – ${j.end}` : ""}
          </p>
          <ul>
            {j.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </section>
      ))}

      <h2>Proyectos</h2>
      {projects.map((p) => (
        <section key={p.name}>
          <h3>{p.name}</h3>
          <p>{p.summary}</p>
          {p.body.map((b) => (
            <p key={b}>{b}</p>
          ))}
          <p>{p.stack.join(" · ")}</p>
          {(p.links ?? []).map((l) => (
            <p key={l.href}>
              <a href={l.href}>{l.label}</a>
            </p>
          ))}
        </section>
      ))}

      <h2>Conocimientos</h2>
      {skillGroups.map((g) => (
        <section key={g.id}>
          <h3>{g.name}</h3>
          <p>{g.skills.join(" · ")}</p>
        </section>
      ))}

      <h2>Contacto</h2>
      <ul>
        {contactPins.map((c) => (
          <li key={c.label}>
            <a href={c.href}>
              {c.label}: {c.value}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
