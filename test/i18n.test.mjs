import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..")
const read = (f) => readFileSync(join(REPO, f), "utf8")
const QML = ["Service.qml", "BarWidget.qml"]
const en = JSON.parse(read("i18n/en.json"))

test("every translation key used in QML exists in en.json", () => {
  for (const file of QML) {
    for (const [, key] of read(file).matchAll(/strings\.t\(\s*"([^"]+)"/g)) {
      assert.ok(key in en, `${file} uses missing key ${key}`)
    }
  }
})

test("every key in en.json is used", () => {
  const source = QML.map(read).join("\n")
  for (const key of Object.keys(en)) assert.ok(source.includes(`"${key}"`), `unused key ${key}`)
})

test("every Text block sets textFormat to PlainText", () => {
  for (const file of QML) {
    for (const [, body] of read(file).matchAll(/\n\s*Text \{([\s\S]*?)\n\s*\}/g)) {
      assert.match(body, /textFormat: Text\.PlainText/, `${file}: a Text lacks PlainText`)
    }
  }
})

test("the manifest declares the service and the Appearance bar widget", () => {
  const m = JSON.parse(read("manifest.json"))
  assert.deepEqual(m.kinds, ["service", "bar-widget"])
  assert.equal(m.barWidget.category, "Appearance")
  assert.equal(m.entryPoints.barWidget, "BarWidget.qml")
})
