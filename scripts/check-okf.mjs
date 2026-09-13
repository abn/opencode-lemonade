import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const projectRoot = new URL("..", import.meta.url).pathname;
const docsDir = join(projectRoot, "docs");

let failures = 0;

function listMarkdown(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listMarkdown(full));
    } else if (entry.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

function frontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const data = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) {
      data[line.slice(0, colon).trim()] = line
        .slice(colon + 1)
        .trim()
        .replace(/^"|"$/g, "");
    }
  }
  return data;
}

function fail(file, msg) {
  failures += 1;
  console.error(`  [${relative(projectRoot, file)}] ${msg}`);
}

for (const file of listMarkdown(docsDir)) {
  const content = readFileSync(file, "utf8");
  const isRootIndex = relative(docsDir, file) === "index.md";
  const meta = frontmatter(content);

  if (isRootIndex) {
    if (!meta || meta.okf_version !== "0.2") {
      fail(file, "bundle root index.md must declare okf_version: 0.2");
    }
  } else if (!meta || !meta.type) {
    fail(file, "missing non-empty type in frontmatter");
  }

  if (content.includes("file://")) {
    fail(file, "file:// URI present");
  }
  if (content.includes("/home/")) {
    fail(file, "home path present");
  }
  if (content.includes("\u2014")) {
    fail(file, "em-dash present");
  }
}

if (failures > 0) {
  console.error(`\nOKF validation failed with ${failures} issue(s).`);
  process.exit(1);
}
console.log("OKF bundle valid.");
