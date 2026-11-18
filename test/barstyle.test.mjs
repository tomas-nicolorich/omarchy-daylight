// Tests for BarStyle.js, the bar background Daylight remembers per period.
//
// Seam: `reconcile(input)`, a pure function of the current period, whether the
// theme just changed, the bar background and the remembered backgrounds. It
// returns the backgrounds to keep and the background to set. `backgroundOf`
// and `periodOf` read shell.json and the current theme.

import { test } from "node:test"
import assert from "node:assert/strict"
import { load } from "./load.mjs"

const { backgroundOf, periodOf, reconcile } = load("BarStyle.js")

const SETTINGS = { lightTheme: "Flexoki Light", darkTheme: "Tokyo Night" }

test("backgroundOf reads bar.background, and the older transparent flag", () => {
  assert.equal(backgroundOf({ bar: { background: "glassy" } }), "glassy")
  assert.equal(backgroundOf({ bar: { background: "none" } }), "none")
  assert.equal(backgroundOf({ bar: { transparent: true } }), "none")
  assert.equal(backgroundOf({ bar: {} }), "opaque")
  assert.equal(backgroundOf(null), "opaque")
})

test("periodOf names the period of a chosen theme, in any spelling", () => {
  assert.equal(periodOf("flexoki-light", SETTINGS), "light")
  assert.equal(periodOf("Tokyo Night", SETTINGS), "dark")
  assert.equal(periodOf("nord", SETTINGS), null)
  assert.equal(periodOf("", SETTINGS), null)
})

test("periodOf is null when both periods use one theme, or none is chosen", () => {
  assert.equal(periodOf("nord", { lightTheme: "Nord", darkTheme: "Nord" }), null)
  assert.equal(periodOf("nord", {}), null)
})

test("changing the background remembers it for the current period", () => {
  const r = reconcile({ period: "dark", themeChanged: false, background: "glassy", saved: { light: "opaque", dark: "none" } })
  assert.deepEqual(r, { saved: { light: "opaque", dark: "glassy" }, changed: true, apply: null })
})

test("an unchanged background changes nothing", () => {
  const r = reconcile({ period: "dark", themeChanged: false, background: "glassy", saved: { dark: "glassy" } })
  assert.equal(r.changed, false)
  assert.equal(r.apply, null)
})

test("switching theme restores the period's remembered background", () => {
  const r = reconcile({ period: "light", themeChanged: true, background: "glassy", saved: { light: "opaque", dark: "glassy" } })
  assert.equal(r.apply, "opaque")
  assert.equal(r.changed, false)
})

test("switching theme to a background already on the bar sets nothing", () => {
  const r = reconcile({ period: "light", themeChanged: true, background: "opaque", saved: { light: "opaque" } })
  assert.equal(r.apply, null)
})

test("switching to a period with nothing remembered keeps the bar and remembers it", () => {
  const r = reconcile({ period: "light", themeChanged: true, background: "glassy", saved: { dark: "glassy" } })
  assert.deepEqual(r, { saved: { dark: "glassy", light: "glassy" }, changed: true, apply: null })
})

test("a theme outside both periods leaves the bar and the memory alone", () => {
  const r = reconcile({ period: null, themeChanged: true, background: "none", saved: { light: "opaque" } })
  assert.deepEqual(r, { saved: { light: "opaque" }, changed: false, apply: null })
})

test("a bad remembered value is replaced, never applied", () => {
  const r = reconcile({ period: "dark", themeChanged: true, background: "none", saved: { dark: "frosted" } })
  assert.equal(r.apply, null)
  assert.deepEqual(r.saved, { dark: "none" })
})
