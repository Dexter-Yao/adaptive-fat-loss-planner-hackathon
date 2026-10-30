// ABOUTME: Compile the normative DESIGN.md front matter to shared browser CSS variables.
// ABOUTME: Check mode rejects drift; this script owns no duplicate token values.
import { readFile, writeFile } from "node:fs/promises";
import { parse } from "yaml";
const markdown = await readFile(
  new URL("../DESIGN.md", import.meta.url),
  "utf8",
);
const match = markdown.match(/^---\n([\s\S]*?)\n---/);
if (!match) throw new Error("DESIGN.md needs YAML front matter.");
const tokens = parse(match[1], { uniqueKeys: true });
const properties = [];
const kebab = (value) => value.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
function resolve(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const ref = String(value).match(/^\{([^}]+)\}$/);
  if (!ref) return String(value);
  const resolved = ref[1].split(".").reduce((o, k) => o?.[k], tokens);
  if (resolved === undefined) throw new Error("Unknown design token " + value);
  return resolve(resolved);
}
for (const [name, value] of Object.entries(tokens.colors))
  properties.push(`  --${name}: ${resolve(value)};`);
for (const [group, prefix] of [
  ["typography", "type"],
  ["rounded", "radius"],
  ["spacing", "space"],
  ["components", "component"],
])
  for (const [name, value] of Object.entries(tokens[group] ?? {})) {
    if (typeof value === "object")
      for (const [key, raw] of Object.entries(value)) {
        const result = resolve(raw);
        if (result !== null)
          properties.push(`  --${prefix}-${name}-${kebab(key)}: ${result};`);
      }
    else properties.push(`  --${prefix}-${name}: ${resolve(value)};`);
  }
const output = `/* Generated from DESIGN.md. Run pnpm design:tokens; do not edit. */\n:root {\n${properties.join("\n")}\n}\n`;
const target = new URL("../src/app/design-tokens.css", import.meta.url);
if (process.argv.includes("--check")) {
  if ((await readFile(target, "utf8")) !== output)
    throw new Error("Design tokens are stale. Run pnpm design:tokens.");
  console.log("DESIGN.md and generated CSS match.");
} else await writeFile(target, output);
