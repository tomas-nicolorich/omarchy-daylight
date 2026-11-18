// Shared loader for the QML .js resources under test.
//
// The .js files are QML resources: QML exposes their top-level functions and
// there is no export statement for node to read. load() evaluates a file with
// `new Function`, like Valkiria's tests do. A `.import "X.js" as Name` line is
// resolved the way QML resolves it: X.js is evaluated first and bound to Name.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const REPO = join(dirname(fileURLToPath(import.meta.url)), "..")

// All top-level `function` and `var` names of a source, for auto-export.
function topLevelNames(source) {
  return [...source.matchAll(/^(?:function\s+(\w+)|var\s+(\w+))/gm)].map((m) => m[1] || m[2])
}

function evaluate(file) {
  const raw = readFileSync(join(REPO, file), "utf8")
  const imports = []
  const body = raw.split("\n").filter((line) => {
    const m = /^\.import\s+"([^"]+)"\s+as\s+(\w+)/.exec(line)
    if (m) imports.push([m[2], evaluate(m[1])])
    return !m && !line.startsWith(".pragma")
  }).join("\n")
  const exports = topLevelNames(body).map((n) => `${n}: ${n}`).join(", ")
  const fn = new Function(...imports.map(([n]) => n), `${body}\nreturn { ${exports} };`)
  return fn(...imports.map(([, v]) => v))
}

export const load = (file) => evaluate(file)
