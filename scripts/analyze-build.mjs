import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

const root = resolve(process.cwd(), "dist");
const outputRoot = resolve(process.cwd(), "artifacts/build");
const budgets = {
  largestClientJavaScriptGzipBytes: Number(
    process.env.BUILD_MAX_CLIENT_JS_GZIP_BYTES ?? 300 * 1024,
  ),
  largestSvgGzipBytes: Number(process.env.BUILD_MAX_SVG_GZIP_BYTES ?? 350 * 1024),
};

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? walk(path) : Promise.resolve([path]);
    }),
  );
  return nested.flat();
}

const paths = await walk(root);
const files = await Promise.all(
  paths.sort().map(async (path) => {
    const contents = await readFile(path);
    return {
      path: relative(root, path).split(sep).join("/"),
      bytes: contents.byteLength,
      gzipBytes: gzipSync(contents, { level: 9 }).byteLength,
      brotliBytes: brotliCompressSync(contents).byteLength,
      sha256: createHash("sha256").update(contents).digest("hex"),
    };
  }),
);

const clientJavaScript = files.filter(
  (file) =>
    file.path.endsWith(".js") &&
    !file.path.endsWith(".map.js") &&
    !/(^|\/)(server|worker)(\/|$)/.test(file.path),
);
const svg = files.filter((file) => file.path.endsWith(".svg"));
const largest = (entries, field) =>
  entries.reduce((current, entry) =>
    !current || entry[field] > current[field] ? entry : current,
  null);
const largestClientJavaScript = largest(clientJavaScript, "gzipBytes");
const largestSvg = largest(svg, "gzipBytes");
const checks = {
  hasClientJavaScript: clientJavaScript.length > 0,
  clientJavaScript:
    largestClientJavaScript === null ||
    largestClientJavaScript.gzipBytes <= budgets.largestClientJavaScriptGzipBytes,
  svg:
    largestSvg === null || largestSvg.gzipBytes <= budgets.largestSvgGzipBytes,
};
const manifest = {
  schemaVersion: 1,
  gitSha: process.env.GITHUB_SHA ?? null,
  generatedAt: new Date().toISOString(),
  totals: {
    files: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    gzipBytes: files.reduce((sum, file) => sum + file.gzipBytes, 0),
    brotliBytes: files.reduce((sum, file) => sum + file.brotliBytes, 0),
    clientJavaScriptGzipBytes: clientJavaScript.reduce(
      (sum, file) => sum + file.gzipBytes,
      0,
    ),
  },
  largestClientJavaScript,
  largestSvg,
  budgets,
  checks,
  files,
};

await mkdir(outputRoot, { recursive: true });
await writeFile(
  resolve(outputRoot, "dist-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
const summary = [
  "## Production build",
  "",
  `- Files: ${manifest.totals.files}`,
  `- Raw size: ${(manifest.totals.bytes / 1024).toFixed(1)} KiB`,
  `- Client JavaScript gzip: ${(manifest.totals.clientJavaScriptGzipBytes / 1024).toFixed(1)} KiB`,
  `- Largest client JavaScript gzip: ${largestClientJavaScript ? `${(largestClientJavaScript.gzipBytes / 1024).toFixed(1)} KiB (${largestClientJavaScript.path})` : "not found"}`,
  `- Largest SVG gzip: ${largestSvg ? `${(largestSvg.gzipBytes / 1024).toFixed(1)} KiB (${largestSvg.path})` : "none"}`,
  "",
].join("\n");
await writeFile(resolve(outputRoot, "summary.md"), summary);

if (process.env.GITHUB_STEP_SUMMARY) {
  const previous = await readFile(process.env.GITHUB_STEP_SUMMARY, "utf8").catch(() => "");
  await writeFile(process.env.GITHUB_STEP_SUMMARY, `${previous}${summary}`);
}

if (!Object.values(checks).every(Boolean)) {
  console.error(JSON.stringify({ budgets, checks, largestClientJavaScript, largestSvg }, null, 2));
  process.exitCode = 1;
}
