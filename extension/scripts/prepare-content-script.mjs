import { readFile, writeFile } from "node:fs/promises";

// MV3 content scripts run as classic scripts, so remove TypeScript's empty module marker.
const contentScript = new URL("../dist/content.js", import.meta.url);
const source = await readFile(contentScript, "utf8");
const prepared = source.replace(/^export \{\};\r?\n?/gm, "");
await writeFile(contentScript, prepared, "utf8");
