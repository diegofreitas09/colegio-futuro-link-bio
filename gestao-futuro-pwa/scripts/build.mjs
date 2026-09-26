import { cp, mkdir, rm } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await mkdir("dist/vendor", { recursive: true });
for (const path of ["index.html", "styles.css", "manifest.webmanifest", "service-worker.js", "app", "assets"]) {
  await cp(path, `dist/${path}`, { recursive: true });
}
await cp("node_modules/jspdf/dist/jspdf.umd.min.js", "dist/vendor/jspdf.umd.min.js");
console.log("Public assets built in dist; backend and dependencies excluded.");
