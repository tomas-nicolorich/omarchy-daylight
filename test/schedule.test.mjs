process.env.TZ = "Europe/Madrid"

import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..")
const load = (file, names) =>
  new Function(`${readFileSync(join(REPO, file), "utf8")}\nreturn { ${names} };`)()
const { evaluate, themeSlug } = load("Schedule.js", "evaluate, themeSlug")

// Local (Europe/Madrid) wall-clock time as epoch ms.
const at = (s) => new Date(s).getTime()

const SETTINGS = {
  mode: "fixed", sunriseOffsetMinutes: 0, sunsetOffsetMinutes: 0,
  lightTime: "07:00", darkTime: "19:00", paused: false,
  lightTheme: "Flexoki Light", darkTheme: "Tokyo Night",
}
const THEMES = ["Flexoki Light", "Tokyo Night", "Nord"]

const run = (over) => evaluate({
  settings: SETTINGS, location: null, now: at("2026-06-10T12:00"),
  state: null, currentTheme: "nord", installedThemes: THEMES, ...over,
})

test("midday is the light period and the next switch is dark at 19:00", () => {
  const r = run()
  assert.equal(r.period, "light")
  assert.deepEqual(r.next, { at: at("2026-06-10T19:00"), period: "dark" })
})

test("night is the dark period and the next switch is light the next morning", () => {
  const r = run({ now: at("2026-06-10T22:00") })
  assert.equal(r.period, "dark")
  assert.deepEqual(r.next, { at: at("2026-06-11T07:00"), period: "light" })
})

test("before the light time the dark period is still running", () => {
  const r = run({ now: at("2026-06-10T05:00") })
  assert.equal(r.period, "dark")
  assert.equal(r.next.at, at("2026-06-10T07:00"))
})

test("sun mode behaves as fixed times until sun calculation exists", () => {
  assert.equal(run({ settings: { ...SETTINGS, mode: "sun" } }).period, "light")
})

test("first start with both themes chosen applies the current period's theme", () => {
  assert.equal(run().apply, "flexoki-light")
  assert.equal(run({ now: at("2026-06-10T22:00") }).apply, "tokyo-night")
})

test("first start records the boundary it acted on", () => {
  const r = run()
  assert.equal(r.record, true)
  assert.equal(r.boundary, at("2026-06-10T07:00"))
})

test("first start with no themes chosen does nothing", () => {
  const r = run({ settings: { ...SETTINGS, lightTheme: undefined, darkTheme: undefined } })
  assert.equal(r.apply, null)
  assert.equal(r.record, false)
})

test("first start with only one theme chosen does nothing", () => {
  const r = run({ settings: { ...SETTINGS, darkTheme: undefined } })
  assert.equal(r.apply, null)
  assert.equal(r.record, false)
})

test("a restart inside a boundary already acted on does nothing", () => {
  const r = run({ state: { lastBoundary: at("2026-06-10T07:00") }, currentTheme: "flexoki-light" })
  assert.equal(r.apply, null)
  assert.equal(r.record, false)
})

test("a theme picked by hand stays until the next boundary", () => {
  const state = { lastBoundary: at("2026-06-10T07:00") }
  const during = run({ state, currentTheme: "nord", now: at("2026-06-10T15:00") })
  assert.equal(during.apply, null)
  const after = run({ state, currentTheme: "nord", now: at("2026-06-10T19:00") })
  assert.equal(after.apply, "tokyo-night")
  assert.equal(after.boundary, at("2026-06-10T19:00"))
})

test("resume across several boundaries applies the current period once", () => {
  const state = { lastBoundary: at("2026-06-09T07:00") }
  const r = run({ state, currentTheme: "flexoki-light", now: at("2026-06-10T22:00") })
  assert.equal(r.apply, "tokyo-night")
  assert.equal(r.boundary, at("2026-06-10T19:00"))
  const again = run({ state: { lastBoundary: r.boundary }, currentTheme: "tokyo-night",
    now: at("2026-06-10T22:05") })
  assert.equal(again.apply, null)
})

test("a dark time after midnight works", () => {
  const s = { ...SETTINGS, lightTime: "07:00", darkTime: "01:30" }
  const late = run({ settings: s, now: at("2026-06-10T00:45") })
  assert.equal(late.period, "light")
  assert.deepEqual(late.next, { at: at("2026-06-10T01:30"), period: "dark" })
  const dark = run({ settings: s, now: at("2026-06-10T03:00") })
  assert.equal(dark.period, "dark")
  assert.deepEqual(dark.next, { at: at("2026-06-10T07:00"), period: "light" })
})

test("the theme already being right skips the apply but records the boundary", () => {
  const r = run({ currentTheme: "flexoki-light" })
  assert.equal(r.apply, null)
  assert.equal(r.record, true)
})

test("theme names are compared as slugs", () => {
  assert.equal(themeSlug("Flexoki Light"), "flexoki-light")
  assert.equal(themeSlug("<b>Tokyo Night</b>"), "tokyo-night")
  assert.equal(run({ currentTheme: "flexoki-light\n" }).apply, null)
})

test("a chosen theme that is no longer installed is reported, not applied", () => {
  const r = run({ installedThemes: ["Nord", "Tokyo Night"] })
  assert.equal(r.apply, null)
  assert.equal(r.missing, "Flexoki Light")
  assert.equal(r.record, true)
})

test("paused never applies and does not record the boundary", () => {
  const r = run({ settings: { ...SETTINGS, paused: true } })
  assert.equal(r.apply, null)
  assert.equal(r.record, false)
  assert.equal(r.period, "light")
})

test("spring forward: the next switch is 07:00 on the local clock", () => {
  const r = run({ now: at("2026-03-29T00:30") })
  assert.equal(r.next.at, Date.UTC(2026, 2, 29, 5, 0))
  assert.equal(r.period, "dark")
})

test("fall back: the next switch is 07:00 on the local clock", () => {
  const r = run({ now: at("2026-10-25T00:30") })
  assert.equal(r.next.at, Date.UTC(2026, 9, 25, 6, 0))
})

test("a dark time inside the skipped hour still fires once that day", () => {
  const s = { ...SETTINGS, darkTime: "02:30", lightTime: "07:00" }
  const r = run({ settings: s, now: at("2026-03-29T01:00") })
  assert.equal(r.period, "light")
  assert.equal(r.next.period, "dark")
  assert.ok(r.next.at > at("2026-03-29T01:00") && r.next.at <= Date.UTC(2026, 2, 29, 1, 30))
})
