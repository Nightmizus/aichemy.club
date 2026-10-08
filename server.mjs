import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const portArg = process.argv.indexOf("--port");
const port = Number(
  portArg >= 0 ? process.argv[portArg + 1] : process.env.PORT || 3000,
);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".md": "text/markdown; charset=utf-8",
};
const noCache = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};
const sceneFiles = [
  "index.html",
  "styles.css",
  "furnace.js",
  "stardust.js",
  "app.js",
  "favicon.svg",
];

async function sceneRevision() {
  const files = await Promise.all(
    sceneFiles.map((name) => readFile(resolve(root, name))),
  );
  const hash = createHash("sha256");
  files.forEach((file) => hash.update(file));
  return hash.digest("hex").slice(0, 12);
}

function previewHtml(source, revision) {
  // Version every asset; this also avoids stale caches in embedded preview frames.
  const html = source
    .toString("utf8")
    .replace(
      /((?:src|href)="\.\/(?:furnace\.js|stardust\.js|app\.js|styles\.css))(?:\?[^"\s]*)?"/g,
      `$1?v=${revision}"`,
    );
  // Local-preview-only reload: the deployable HTML remains independent of this server.
  const reload = `<script data-aichemy-preview>
(() => {
  const revision = ${JSON.stringify(revision)};
  let checking = false;
  async function check() {
    if (document.hidden || checking) return;
    checking = true;
    try {
      const response = await fetch('/_aichemy/revision', {cache: 'no-store'});
      if (response.ok && (await response.text()) !== revision) location.reload();
    } catch {} finally { checking = false; }
  }
  setInterval(check, 1500);
  document.addEventListener('visibilitychange', check);
})();
</script>`;
  return html.replace("</body>", `${reload}\n  </body>`);
}

createServer(async (request, response) => {
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end("Method not allowed");
      return;
    }
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/_aichemy/revision") {
      response.writeHead(200, {
        ...noCache,
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end(
        request.method === "HEAD" ? undefined : await sceneRevision(),
      );
      return;
    }
    let path = resolve(root, "." + decodeURIComponent(url.pathname));
    if (
      path !== root.replace(/\/$/, "") &&
      !path.startsWith(root.endsWith(sep) ? root : root + sep)
    ) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }
    if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
    let body = await readFile(path);
    let revision;
    if (path === resolve(root, "index.html")) {
      revision = await sceneRevision();
      body = previewHtml(body, revision);
    }
    response.writeHead(200, {
      ...noCache,
      "Content-Type": types[extname(path)] || "application/octet-stream",
      ...(revision ? { "X-AIchemy-Revision": revision } : {}),
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 400);
    response.end(error.code === "ENOENT" ? "Not found" : "Bad request");
  }
}).listen(port, "0.0.0.0", () =>
  console.log(`AIchemy is ready at http://localhost:${port}`),
);
