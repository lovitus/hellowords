import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const args = new Set(process.argv.slice(2));
const milestone = args.has("--milestone");
const explicitPreview = args.has("--explicit-user-preview");

if (milestone === explicitPreview) {
  throw new Error(
    "Public release is frozen. Choose exactly one authorized mode: --milestone or --explicit-user-preview.",
  );
}

if (explicitPreview && process.env.HELLOWORDS_EXPLICIT_PREVIEW_APPROVAL !== "YES") {
  throw new Error(
    "Preview release requires a fresh, explicit user request and HELLOWORDS_EXPLICIT_PREVIEW_APPROVAL=YES.",
  );
}

const manifest = JSON.parse(
  readFileSync(resolve(projectRoot, "public/data/scenes/manifest.json"), "utf8"),
);
const scenes = manifest.scenes.map(({ id }) => JSON.parse(
  readFileSync(resolve(projectRoot, `public/data/scenes/${id}.json`), "utf8"),
));
const uniqueDisplayWords = new Set(
  scenes.flatMap((scene) => scene.labels.map(({ word }) => word.trim().toLocaleLowerCase())),
).size;

if (milestone && uniqueDisplayWords < 10_000) {
  throw new Error(
    `Milestone release blocked: ${uniqueDisplayWords.toLocaleString()} grounded display terms; 10,000 required.`,
  );
}

const status = execFileSync("git", ["status", "--porcelain"], {
  cwd: projectRoot,
  encoding: "utf8",
});
if (status.trim()) {
  throw new Error("Public release blocked: the validated source must be committed and the worktree clean.");
}

console.log(
  `Release preflight authorized (${milestone ? "10k milestone" : "explicit user preview"}): ${uniqueDisplayWords.toLocaleString()} grounded display terms.`,
);
console.log("Run npm run verify:full against this exact clean commit before creating one public version.");
