// Tests for Schedule.js, Daylight's schedule model.
//
// Seam: `evaluate(input)`, a pure function of the settings, the location, the
// clock, the scheduler's saved state, the current theme and the installed
// themes. It returns the current period, the next switch, whether to apply a
// theme and what to record. `resumedAfterGap` is the second, small seam: the
// scheduler's wall-clock check for waking from sleep.
//
// Local times are Europe/Madrid, set before anything reads the clock.
process.env.TZ = "Europe/Madrid"

import { test } from "node:test"
import assert from "node:assert/strict"
import { load } from "./load.mjs"

const { evaluate, resumedAfterGap } = load("Schedule.js")
const { slug: themeSlug } = load("Util.js")

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

// ---- sun mode ----
const SUN = { ...SETTINGS, mode: "sun" }
const utc = (s) => Date.parse(s + "Z")
const LONDON = { latitude: 51.5074, longitude: -0.1278 }
const NEWYORK = { latitude: 40.7128, longitude: -74.006 }
const SYDNEY = { latitude: -33.8688, longitude: 151.2093 }
const TROMSO = { latitude: 69.6492, longitude: 18.9553 }
const MADRID = { latitude: 40.4168, longitude: -3.7038 }
const near = (actual, expected, minutes = 2) =>
  assert.ok(Math.abs(actual - expected) <= minutes * 60000,
    `${new Date(actual).toISOString()} vs ${new Date(expected).toISOString()}`)

const sunDay = (location, now, over = {}) =>
  run({ settings: SUN, location, now, ...over })

test("London on the June solstice: sunrise 04:43 and sunset 21:21 BST", () => {
  const r = sunDay(LONDON, at("2026-06-21T12:00"))
  near(r.sun.sunrise, utc("2026-06-21T03:43"))
  near(r.sun.sunset, utc("2026-06-21T20:21"))
})

test("New York on the June solstice: 05:25 and 20:31 EDT", () => {
  const r = sunDay(NEWYORK, at("2026-06-21T18:00"))
  near(r.sun.sunrise, utc("2026-06-21T09:25"))
  near(r.sun.sunset, utc("2026-06-22T00:31"))
})

test("Sydney on the December solstice: 05:41 and 20:05 AEDT", () => {
  const r = sunDay(SYDNEY, at("2026-12-21T00:00"))
  near(r.sun.sunrise, utc("2026-12-20T18:41"))
  near(r.sun.sunset, utc("2026-12-21T09:05"))
})

test("sun mode switches at sunrise and sunset", () => {
  const r = sunDay(LONDON, at("2026-06-21T12:00"))
  assert.equal(r.period, "light")
  assert.equal(r.fallback, null)
  assert.equal(r.next.period, "dark")
  assert.equal(r.next.at, r.sun.sunset)
  const night = sunDay(LONDON, at("2026-06-21T23:30"))
  assert.equal(night.period, "dark")
  assert.equal(night.next.period, "light")
  near(night.next.at, utc("2026-06-22T03:43"))
})

test("offsets shift sunrise later and sunset earlier", () => {
  const base = sunDay(LONDON, at("2026-06-21T12:00"))
  const r = sunDay(LONDON, at("2026-06-21T12:00"),
    { settings: { ...SUN, sunriseOffsetMinutes: 30, sunsetOffsetMinutes: -45 } })
  assert.equal(r.next.at, base.sun.sunset - 45 * 60000)
  const early = sunDay(LONDON, utc("2026-06-21T03:30") + 0)
  assert.equal(early.period, "dark")
  const shifted = sunDay(LONDON, utc("2026-06-21T03:30"),
    { settings: { ...SUN, sunriseOffsetMinutes: -30 } })
  assert.equal(shifted.period, "light")
  const later = sunDay(LONDON, utc("2026-06-21T04:00"),
    { settings: { ...SUN, sunriseOffsetMinutes: 30 } })
  assert.equal(later.period, "dark")
})

test("midnight sun keeps the light period all day", () => {
  const r = sunDay(TROMSO, at("2026-06-21T03:00"))
  assert.equal(r.period, "light")
  assert.equal(r.sun.state, "polarDay")
  assert.equal(r.sun.sunrise, null)
})

test("polar night keeps the dark period all day", () => {
  const r = sunDay(TROMSO, at("2026-12-21T12:00"))
  assert.equal(r.period, "dark")
  assert.equal(r.sun.state, "polarNight")
})

test("sun mode follows the wall clock across the spring DST change", () => {
  const before = sunDay(MADRID, at("2026-03-28T12:00"))
  const after = sunDay(MADRID, at("2026-03-29T12:00"))
  assert.equal(new Date(before.sun.sunrise).getHours(), 7)
  assert.equal(new Date(after.sun.sunrise).getHours(), 8)
})

test("sun mode with no location falls back to the fixed times and says so", () => {
  const r = sunDay(null, at("2026-06-10T12:00"))
  assert.equal(r.fallback, "noLocation")
  assert.equal(r.sun, null)
  assert.deepEqual(r.next, { at: at("2026-06-10T19:00"), period: "dark" })
})

test("fixed mode never reports a fallback or sun times", () => {
  const r = run({ location: LONDON })
  assert.equal(r.fallback, null)
  assert.equal(r.sun, null)
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

test("paused applies nothing, even at a new boundary", () => {
  const r = run({ settings: { ...SETTINGS, paused: true }, state: { lastBoundary: at("2026-06-09T19:00") } })
  assert.equal(r.apply, null)
  assert.equal(r.missing, null)
  assert.equal(r.period, "light")
})

test("paused still records the boundary it crossed", () => {
  const r = run({ settings: { ...SETTINGS, paused: true }, state: { lastBoundary: at("2026-06-09T19:00") } })
  assert.equal(r.record, true)
  assert.equal(r.boundary, at("2026-06-10T07:00"))
})

test("unpausing mid-period does not re-apply the current period's theme", () => {
  const paused = run({ settings: { ...SETTINGS, paused: true }, state: { lastBoundary: at("2026-06-09T19:00") } })
  const after = run({ state: { lastBoundary: paused.boundary } })
  assert.equal(after.apply, null)
  assert.equal(after.record, false)
})

test("after unpausing, the next boundary applies its theme", () => {
  const r = run({ now: at("2026-06-10T19:01"), currentTheme: "flexoki-light", state: { lastBoundary: at("2026-06-10T07:00") } })
  assert.equal(r.apply, "tokyo-night")
})

test("paused with no saved state applies nothing and records the boundary", () => {
  const r = run({ settings: { ...SETTINGS, paused: true } })
  assert.equal(r.apply, null)
  assert.equal(r.record, true)
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

// ---- only the passing of time crosses a boundary ----
const ANCHORED = { lastBoundary: at("2026-06-10T07:00"), nextAt: at("2026-06-10T19:00") }

test("with nothing changed between boundaries, nothing is applied or recorded", () => {
  const r = run({ state: ANCHORED, currentTheme: "nord" })
  assert.equal(r.apply, null)
  assert.equal(r.record, false)
})

test("a settings edit that moves the boundary later re-anchors without applying", () => {
  // Light time 13:00 at 12:00: the current period flips to dark, yet no time passed.
  const r = run({ state: ANCHORED, currentTheme: "flexoki-light",
    settings: { ...SETTINGS, lightTime: "13:00" } })
  assert.equal(r.period, "dark")
  assert.equal(r.apply, null)
  assert.equal(r.record, true)
  assert.equal(r.boundary, at("2026-06-09T19:00"))
  assert.equal(r.next.at, at("2026-06-10T13:00"))
})

test("a settings edit that moves the boundary earlier re-anchors without applying", () => {
  // Light time 11:00 at 12:00: the new current boundary (11:00) is after the recorded one.
  const r = run({ state: ANCHORED, currentTheme: "nord",
    settings: { ...SETTINGS, lightTime: "11:00" } })
  assert.equal(r.apply, null)
  assert.equal(r.record, true)
  assert.equal(r.boundary, at("2026-06-10T11:00"))
})

test("after a re-anchor, the next passing boundary applies its theme", () => {
  const edited = { ...SETTINGS, lightTime: "13:00" }
  const first = run({ state: ANCHORED, settings: edited })
  const state = { lastBoundary: first.boundary, nextAt: first.next.at }
  const later = run({ state, settings: edited, currentTheme: "tokyo-night", now: at("2026-06-10T13:01") })
  assert.equal(later.apply, "flexoki-light")
})

test("a location edit that moves a sun boundary re-anchors without applying", () => {
  const first = sunDay(LONDON, at("2026-06-21T12:00"), { state: null })
  const state = { lastBoundary: first.boundary, nextAt: first.next.at }
  const moved = sunDay(NEWYORK, at("2026-06-21T12:00"), { state, currentTheme: "nord" })
  assert.equal(moved.apply, null)
  assert.equal(moved.missing, null)
})

test("an old state without a next time falls back to comparing boundaries", () => {
  const r = run({ state: { lastBoundary: at("2026-06-09T19:00") }, currentTheme: "tokyo-night" })
  assert.equal(r.apply, "flexoki-light")
})

// ---- an unknown installed list is "can't verify" ----
test("an empty or missing installed list skips the apply without a notification or a record", () => {
  for (const installedThemes of [[], null, undefined]) {
    const r = run({ installedThemes, currentTheme: "nord" })
    assert.equal(r.apply, null)
    assert.equal(r.missing, null)
    assert.equal(r.record, false)
  }
})

test("an unknown installed list retries on the next evaluation and then applies", () => {
  const first = run({ installedThemes: [], currentTheme: "nord" })
  assert.equal(first.record, false)
  const again = run({ installedThemes: THEMES, currentTheme: "nord" })
  assert.equal(again.apply, "flexoki-light")
  assert.equal(again.record, true)
})

test("an unknown installed list still records when the theme is already right", () => {
  const r = run({ installedThemes: null, currentTheme: "flexoki-light" })
  assert.equal(r.apply, null)
  assert.equal(r.record, true)
})

// ---- resume from sleep ----
test("a wall-clock gap well beyond the heartbeat means the machine slept", () => {
  assert.equal(resumedAfterGap(1000, 1000 + 30000, 30000), false)
  assert.equal(resumedAfterGap(1000, 1000 + 65000, 30000), true)
  assert.equal(resumedAfterGap(1000, 1000 + 3600000, 30000), true)
})

test("the clock jumping backwards counts as a resume, and the first beat does not", () => {
  assert.equal(resumedAfterGap(50000, 1000, 30000), true)
  assert.equal(resumedAfterGap(null, 1000, 30000), false)
})

test("a dark time inside the skipped hour still fires once that day", () => {
  const s = { ...SETTINGS, darkTime: "02:30", lightTime: "07:00" }
  const r = run({ settings: s, now: at("2026-03-29T01:00") })
  assert.equal(r.period, "light")
  assert.equal(r.next.period, "dark")
  assert.ok(r.next.at > at("2026-03-29T01:00") && r.next.at <= Date.UTC(2026, 2, 29, 1, 30))
})
