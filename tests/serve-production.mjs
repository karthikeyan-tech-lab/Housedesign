// Isolated hosts catch absolute asset paths that accidentally depend on another
// deployment's subpath. Neither host uses Vite's development server or fallback.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const root = resolve("dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
function serve(mount, port) {
  createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (!path.startsWith(mount)) throw new Error("Outside deployment path");
      path = path.slice(mount.length - 1);
      const file = resolve(
        root,
        "." + path + (path.endsWith("/") ? "index.html" : ""),
      );
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile())
        throw new Error("Not found");
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
      });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  }).listen(port, "127.0.0.1");
}
serve("/", 4174);
serve("/Housedesign/", 4175);
