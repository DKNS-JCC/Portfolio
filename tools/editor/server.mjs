// Editor de contenido del portfolio. Solo escucha en 127.0.0.1.
// Uso: npm run editor
import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CONTENT = path.join(ROOT, "content", "portfolio.json");
const CV = path.join(ROOT, "public", "cv.pdf");
const PORT = Number(process.env.PORT) || 4321;

const STATIC = {
  "/": [path.join(HERE, "index.html"), "text/html; charset=utf-8"],
  "/editor.css": [path.join(HERE, "editor.css"), "text/css; charset=utf-8"],
  "/editor.js": [path.join(HERE, "editor.js"), "text/javascript; charset=utf-8"],
  "/dkns.png": [path.join(ROOT, "public", "dkns.png"), "image/png"],
};

function git(args) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd: ROOT, windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: `${stdout}${stderr}`.trim() });
    });
  });
}

function body(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("archivo demasiado grande"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function send(res, status, data, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type.startsWith("application/json") ? JSON.stringify(data) : data);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && STATIC[url.pathname]) {
      const [file, type] = STATIC[url.pathname];
      return send(res, 200, await readFile(file), type);
    }

    if (url.pathname === "/api/content" && req.method === "GET") {
      return send(res, 200, JSON.parse(await readFile(CONTENT, "utf8")));
    }

    if (url.pathname === "/api/content" && req.method === "PUT") {
      const data = JSON.parse((await body(req, 2_000_000)).toString("utf8"));
      for (const k of ["person", "projects", "jobs", "studies", "certs", "skillGroups"])
        if (!(k in data)) return send(res, 400, { error: `falta la sección ${k}` });
      await writeFile(CONTENT, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      return send(res, 200, { ok: true });
    }

    if (url.pathname === "/api/cv" && req.method === "PUT") {
      const pdf = await body(req, 15_000_000);
      if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") return send(res, 400, { error: "el archivo no es un PDF" });
      await writeFile(CV, pdf);
      return send(res, 200, { ok: true, bytes: pdf.length });
    }

    if (url.pathname === "/api/git" && req.method === "GET") {
      const [branch, remote, status] = await Promise.all([
        git(["rev-parse", "--abbrev-ref", "HEAD"]),
        git(["remote"]),
        git(["status", "--porcelain"]),
      ]);
      const lines = status.out.split("\n").filter(Boolean);
      const isContent = (line) => /(content\/portfolio\.json|public\/cv\.pdf)$/.test(line);
      return send(res, 200, {
        repo: branch.ok,
        branch: branch.out,
        remote: remote.out.split("\n").filter(Boolean)[0] ?? null,
        changes: lines.filter(isContent),
        other: lines.filter((line) => !isContent(line)).length,
      });
    }

    if (url.pathname === "/api/publish" && req.method === "POST") {
      const { message } = JSON.parse((await body(req, 10_000)).toString("utf8") || "{}");
      const log = [];
      const run = async (args) => {
        const r = await git(args);
        log.push(`$ git ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}`, r.out);
        return r;
      };
      await run(["add", "--", "content/portfolio.json", "public/cv.pdf"]);
      const staged = await git(["diff", "--cached", "--name-only", "--", "content/portfolio.json", "public/cv.pdf"]);
      if (!staged.out) return send(res, 200, { ok: true, pushed: false, log: [...log, "no hay cambios que publicar"] });
      const commit = await run([
        "commit",
        "-m",
        (message || "").trim() || "Actualizar contenido del portfolio",
        "--",
        "content/portfolio.json",
        "public/cv.pdf",
      ]);
      if (!commit.ok) return send(res, 500, { ok: false, log });
      const remote = (await git(["remote"])).out.split("\n").filter(Boolean)[0];
      if (!remote) return send(res, 200, { ok: true, pushed: false, log: [...log, "commit hecho; el repositorio no tiene remoto, no se ha subido"] });
      const push = await run(["push"]);
      return send(res, push.ok ? 200 : 500, { ok: push.ok, pushed: push.ok, log });
    }

    send(res, 404, { error: "no encontrado" });
  } catch (err) {
    send(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`Editor de contenido en ${url}`);
  console.log(`Edita content/portfolio.json · Ctrl+C para cerrar`);
  if (!process.env.NO_OPEN) {
    const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    execFile(cmd, args, { windowsHide: true }, () => {});
  }
});
