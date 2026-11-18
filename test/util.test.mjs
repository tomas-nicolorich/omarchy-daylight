// Tests for Util.js, the helpers Daylight's other modules share: markup
// stripping, theme slugs, the `omarchy theme list` parse and "HH:MM" parsing.
//
// Seam: Util's public functions, evaluated through test/load.mjs.

import { test } from "node:test"
import assert from "node:assert/strict"
import { load } from "./load.mjs"

const Util = load("Util.js")

test("plainText strips markup and trims", () => {
  assert.equal(Util.plainText("<b>Flexoki</b> Light "), "Flexoki Light")
  assert.equal(Util.plainText(undefined), "")
  assert.equal(Util.plainText(null), "")
})

test("slug is the name `omarchy theme set` takes", () => {
  assert.equal(Util.slug("Flexoki Light"), "flexoki-light")
  assert.equal(Util.slug("<b>Tokyo Night</b>"), "tokyo-night")
  assert.equal(Util.slug("flexoki-light\n"), "flexoki-light")
})

test("a theme list parses to its names, one per line", () => {
  assert.deepEqual(Util.parseThemeList("Nord\n\n Tokyo Night \n"), ["Nord", "Tokyo Night"])
})

test("an empty or missing theme list is unknown, not empty", () => {
  assert.equal(Util.parseThemeList(""), null)
  assert.equal(Util.parseThemeList("\n  \n"), null)
  assert.equal(Util.parseThemeList(undefined), null)
})

test("HH:MM parses to hour and minute, and bad input to null", () => {
  assert.deepEqual(Util.parseTime("07:05"), { hour: 7, minute: 5 })
  assert.deepEqual(Util.parseTime(" 7:30 "), { hour: 7, minute: 30 })
  assert.equal(Util.parseTime("24:00"), null)
  assert.equal(Util.parseTime("12:60"), null)
  assert.equal(Util.parseTime("noon"), null)
  assert.equal(Util.parseTime(5), null)
})

test("formatTime pads hour and minute", () => {
  assert.equal(Util.formatTime(7, 5), "07:05")
  assert.equal(Util.formatTime(19, 30), "19:30")
})
