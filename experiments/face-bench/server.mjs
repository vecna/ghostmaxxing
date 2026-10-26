import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export function startServer(inputs = {}, port = 0) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost"),
        p = decodeURIComponent(url.pathname);
      const local = inputs[p] || path.resolve(root, "." + p);
      if (!inputs[p] && local !== root && !local.startsWith(root + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      const file = (await stat(local)).isDirectory()
        ? path.join(local, "index.html")
        : local;
      const info = await stat(file),
        types = {
          ".html": "text/html",
          ".mjs": "text/javascript",
          ".js": "text/javascript",
          ".wasm": "application/wasm",
          ".json": "application/json",
          ".mp4": "video/mp4",
          ".webm": "video/webm",
          ".onnx": "application/octet-stream",
        };
      const headers = {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      };
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      if (range) {
        const start = Number(range[1]),
          end = Math.min(
            range[2] ? Number(range[2]) : info.size - 1,
            info.size - 1,
          );
        if (start > end || start >= info.size) {
          res.writeHead(416, { "Content-Range": `bytes */${info.size}` }).end();
          return;
        }
        res.writeHead(206, {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${info.size}`,
          "Content-Length": end - start + 1,
        });
        createReadStream(file, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { ...headers, "Content-Length": info.size });
        createReadStream(file).pipe(res);
      }
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () =>
      resolve({ server, url: `http://127.0.0.1:${server.address().port}` }),
    ),
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await startServer({}, 8088);
  console.log(url + "/experiments/face-bench/");
}
