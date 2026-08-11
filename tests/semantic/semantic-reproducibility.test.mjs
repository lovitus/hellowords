import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function filesBelow(directory, base = directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(absolute, base) : [path.relative(base, absolute)];
  }).sort();
}

test("the pinned semantic generator is byte-for-byte reproducible", { timeout: 30_000 }, () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "hellowords-semantic-test-"));
  const first = path.join(temporary, "first");
  const second = path.join(temporary, "second");
  const cachedArchive = path.join(os.tmpdir(), "hellowords-semantic", "wordnet.zip");
  const common = [path.join(root, "scripts/semantic-generate.py")];
  const sourceArgs = fs.existsSync(cachedArchive) ? ["--wordnet-zip", cachedArchive] : [];
  try {
    execFileSync("python3", [...common, ...sourceArgs, "--output", first], { cwd: root, stdio: "ignore" });
    execFileSync("python3", [...common, ...sourceArgs, "--output", second], { cwd: root, stdio: "ignore" });
    const firstFiles = filesBelow(first);
    assert.deepEqual(firstFiles, filesBelow(second));
    for (const relative of firstFiles) {
      assert(fs.readFileSync(path.join(first, relative)).equals(fs.readFileSync(path.join(second, relative))),
        `${relative} changed between identical generator runs`);
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
