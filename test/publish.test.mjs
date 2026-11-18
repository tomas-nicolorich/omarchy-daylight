import { test } from "node:test"
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..")
const read = (f) => readFileSync(join(REPO, f), "utf8")
const manifest = JSON.parse(read("manifest.json"))

test("manifest has every field the listing needs", () => {
  assert.equal(manifest.schemaVersion, 1)
  for (const key of ["id", "name", "version", "author", "license", "description"]) {
    assert.equal(typeof manifest[key], "string", key)
    assert.notEqual(manifest[key].trim(), "", key)
  }
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/)
  assert.equal(manifest.license, "MIT")
  assert.deepEqual(manifest.kinds, ["service", "bar-widget"])
  assert.equal(manifest.entryPoints.service, "Service.qml")
  assert.equal(manifest.entryPoints.barWidget, "BarWidget.qml")
  assert.equal(typeof manifest.barWidget, "object")
  for (const file of Object.values(manifest.entryPoints)) assert.ok(existsSync(join(REPO, file)), file)
})

test("LICENSE is MIT", () => {
  assert.match(read("LICENSE"), /^MIT License/)
})

test(".gitignore keeps .claude/ out of the repo", () => {
  assert.ok(read(".gitignore").split("\n").includes(".claude/"))
})

function settingKeys() {
  const defaults = /var DEFAULTS = \{([\s\S]*?)\}/.exec(read("Config.js"))[1]
  const keys = [...defaults.matchAll(/^\s*(\w+):/gm)].map((m) => m[1])
  return [...keys, "lightTheme", "darkTheme"]
}

test("README documents install, removal, location lookup, images and every setting", () => {
  const readme = read("README.md")
  assert.ok(readme.includes("omarchy plugin add https://github.com/tomas-nicolorich/omarchy-daylight"))
  assert.ok(readme.includes(`omarchy plugin remove ${manifest.id}`))
  assert.ok(readme.includes("geo.omarchy.org"))
  assert.match(readme, /!\[[^\]]+\]\(preview\.png\)/)
  assert.match(readme, /!\[[^\]]+\]\(docs\/screenshot\.png\)/)
  for (const key of settingKeys()) assert.ok(readme.includes(`\`${key}\``), `README lacks setting ${key}`)
})

test("the only file the plugin writes is its state file", () => {
  const source = ["Service.qml", "BarWidget.qml"].map(read).join("\n")
  const writes = source.split("\n").filter((l) => /\b(mv|tee|touch|rm|cp|mkdir)\b|>\s*"\$/.test(l))
  assert.ok(writes.length > 0)
  for (const line of writes) assert.match(line, /\$1(\.tmp)?"/, `unexpected write: ${line.trim()}`)
  assert.match(source, /stateFile: stateHome \+ "\/omarchy\/daylight-state\.json"/)
  assert.doesNotMatch(source, /setText\(/)
})
