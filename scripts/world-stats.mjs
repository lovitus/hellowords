import { resolve } from "node:path";
import { collectWorldStats } from "./lib/world-stats.mjs";

const stats = await collectWorldStats(resolve(import.meta.dirname, ".."));
process.stdout.write(`${JSON.stringify(stats, null, 2)}\n`);
