import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createLexicalWorldFiles } from "../../scripts/generate-lexical-world.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("generated lexical navigation is byte-for-byte reproducible", () => {
  const first = createLexicalWorldFiles();
  const second = createLexicalWorldFiles();
  assert.deepEqual([...second.entries()], [...first.entries()]);

  const result = spawnSync(process.execPath, ["scripts/generate-lexical-world.mjs", "--check"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Lexical world is reproducible: 55 files/);
});
