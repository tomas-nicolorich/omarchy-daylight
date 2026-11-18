// Tests for the plugin's source files as text: translation keys, markup
// safety of every Text, and the manifest's entry points.
//
// Seam: the files on disk (i18n/en.json and the QML and JS sources). There is
// no module to call; these checks keep the source tree consistent.

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..")
const read = (f) => readFileSync(join(REPO, f), "utf8")
const QML = ["Service.qml", "BarWidget.qml", "TimeFields.qml", "PlainText.qml"]
// Sources that look up translation keys: strings.t(...) in QML, t(...) in the
// message builders.
const KEY_SOURCES = [...QML, "Messages.js"]
const en = JSON.parse(read("i18n/en.json"))

test("every translation key used in the sources exists in en.json", () => {
  for (const file of KEY_SOURCES) {
    for (const [, key] of read(file).matchAll(/\b(?:strings\.t|t)\(\s*"([^"]+)"/g)) {
      assert.ok(key in en, `${file} uses missing key ${key}`)
    }
  }
})

test("every key in en.json is used", () => {
  const source = KEY_SOURCES.map(read).join("\n")
  for (const key of Object.keys(en)) assert.ok(source.includes(`"${key}"`), `unused key ${key}`)
})

test("PlainText.qml is a Text with textFormat PlainText", () => {
  const source = read("PlainText.qml")
  assert.match(source, /\nText \{/)
  assert.match(source, /textFormat: Text\.PlainText/)
})

test("no QML file uses a bare Text, only PlainText", () => {
  for (const file of QML.filter((f) => f !== "PlainText.qml")) {
    assert.doesNotMatch(read(file), /(^|\n)\s*Text \{/, `${file} has a bare Text`)
  }
})

test("the manifest declares the service and the Appearance bar widget", () => {
  const m = JSON.parse(read("manifest.json"))
  assert.deepEqual(m.kinds, ["service", "bar-widget"])
  assert.equal(m.barWidget.category, "Appearance")
  assert.equal(m.entryPoints.barWidget, "BarWidget.qml")
})
