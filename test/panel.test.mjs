// Tests for PanelModel.js, what the bar widget and panel show.
//
// Seam: the model's functions (theme options, summary, switch target, time
// editing, mode view, cursor rows), each a pure function of settings and the
// schedule's output. The QML only binds them to components.

import { test } from "node:test"
import assert from "node:assert/strict"
import { load } from "./load.mjs"

const Panel = load("PanelModel.js")
const { plainText } = load("Util.js")

const S = { lightTheme: "Flexoki Light", darkTheme: "Tokyo Night" }

test("switch now in the light period targets the dark theme", () => {
  assert.equal(Panel.switchTarget("light", S, ["Flexoki Light", "Tokyo Night"]), "tokyo-night")
})

test("switch now in the dark period targets the light theme", () => {
  assert.equal(Panel.switchTarget("dark", S, ["Flexoki Light", "Tokyo Night"]), "flexoki-light")
})

test("switch now has no target when the other theme is unset or not installed", () => {
  assert.equal(Panel.switchTarget("light", { lightTheme: "A" }, ["A"]), null)
  assert.equal(Panel.switchTarget("light", S, ["Flexoki Light"]), null)
})

test("markup in a theme name is neutralised in the picker labels but kept in the value", () => {
  const [option] = Panel.themeOptions(['<img src="https://example.invalid/t.png">Evil'], undefined)
  assert.equal(option.label, "Evil")
  assert.doesNotMatch(option.label, /[<>]/)
  assert.equal(option.value, "evil")
})

test("the cursor moves one row at a time and stops at the ends", () => {
  assert.equal(Panel.moveRow(Panel.ROW.lightTheme, -1, true), Panel.ROW.lightTheme)
  assert.equal(Panel.moveRow(Panel.ROW.lightTheme, 1, true), Panel.ROW.darkTheme)
  assert.equal(Panel.moveRow(Panel.ROW.pause, 1, true), Panel.ROW.pause)
})

test("the cursor visits Refresh location only when it is shown", () => {
  assert.equal(Panel.moveRow(Panel.ROW.darkEdge, 1, true), Panel.ROW.refreshLocation)
  assert.equal(Panel.moveRow(Panel.ROW.darkEdge, 1, false), Panel.ROW.switchNow)
  assert.equal(Panel.moveRow(Panel.ROW.switchNow, -1, false), Panel.ROW.darkEdge)
  assert.equal(Panel.moveRow(Panel.ROW.switchNow, -1, true), Panel.ROW.refreshLocation)
})

test("each cursor row has its own number", () => {
  const rows = Object.values(Panel.ROW)
  assert.equal(new Set(rows).size, rows.length)
})

test("the hour and minute of a time are read back for the number fields", () => {
  assert.equal(Panel.timePart("07:30", "hour"), 7)
  assert.equal(Panel.timePart("07:30", "minute"), 30)
})

test("theme options list the installed themes with plain labels", () => {
  assert.deepEqual(Panel.themeOptions(["Nord", "<i>Tokyo</i> Night"], undefined), [
    { value: "nord", label: "Nord" },
    { value: "tokyo-night", label: "Tokyo Night" },
  ])
})

test("a saved theme that is no longer installed stays selectable", () => {
  assert.deepEqual(Panel.themeOptions(["Nord"], "Gone"), [
    { value: "Gone", label: "Gone" },
    { value: "nord", label: "Nord" },
  ])
})

test("a saved theme matching an installed one by slug is not duplicated", () => {
  assert.equal(Panel.themeOptions(["Flexoki Light"], "flexoki-light").length, 1)
})

test("a saved slug shows as the installed display name", () => {
  assert.equal(Panel.displayName(["Catppuccin Latte", "Nord"], "catppuccin-latte"), "Catppuccin Latte")
})

test("a slug that is not installed shows as saved, without markup", () => {
  assert.equal(Panel.displayName(["Nord"], "gone-theme"), "gone-theme")
  assert.equal(Panel.displayName(null, "<b>x</b>"), "x")
  assert.equal(Panel.displayName(["Nord"], undefined), "")
})

test("the picker saves slugs and shows display names", () => {
  assert.deepEqual(Panel.themeOptions(["Catppuccin Latte"], "catppuccin-latte"),
    [{ value: "catppuccin-latte", label: "Catppuccin Latte" }])
})

test("the summary's next theme is the display name when installed", () => {
  const result = { period: "light", next: { at: 1, period: "dark" } }
  const s = { lightTheme: "flexoki-light", darkTheme: "catppuccin-latte" }
  assert.equal(Panel.summary(result, s, ["Catppuccin Latte"]).nextTheme, "Catppuccin Latte")
})

test("refresh location shows in sun mode with a geo-lookup location only", () => {
  assert.equal(Panel.refreshVisible({ mode: "sun" }, true), true)
  assert.equal(Panel.refreshVisible({ mode: "fixed" }, true), false)
  assert.equal(Panel.refreshVisible({ mode: "sun" }, false), false)
})

test("the cursor skips Refresh location in fixed mode", () => {
  const visible = Panel.refreshVisible({ mode: "fixed" }, true)
  assert.equal(Panel.moveRow(Panel.ROW.darkEdge, 1, visible), Panel.ROW.switchNow)
  assert.equal(Panel.moveRow(Panel.ROW.switchNow, -1, visible), Panel.ROW.darkEdge)
})

test("the panel asks for themes until both are chosen", () => {
  assert.equal(Panel.needsThemes({}), true)
  assert.equal(Panel.needsThemes({ lightTheme: "A" }), true)
  assert.equal(Panel.needsThemes({ lightTheme: "A", darkTheme: "B" }), false)
})

test("the summary names the next switch and its target theme", () => {
  const settings = { lightTheme: "Day", darkTheme: "Night" }
  const result = { period: "light", next: { at: 1000, period: "dark" } }
  assert.deepEqual(Panel.summary(result, settings),
    { period: "light", nextAt: 1000, nextPeriod: "dark", nextTheme: "Night" })
})

test("the summary has no target theme when none is chosen", () => {
  const result = { period: "dark", next: { at: 5, period: "light" } }
  assert.equal(Panel.summary(result, {}).nextTheme, "")
})

test("editing the hour or minute of a time keeps the other part", () => {
  assert.equal(Panel.withTimePart("07:30", "hour", 9), "09:30")
  assert.equal(Panel.withTimePart("07:30", "minute", 5), "07:05")
})

// Mode section (sun or fixed).
test("sun mode with a location shows offsets and today's sun times", () => {
  const v = Panel.modeView({ fallback: null, sun: { state: "normal", sunrise: 100, sunset: 200 } }, { mode: "sun" })
  assert.deepEqual(v, { mode: "sun", showOffsets: true, showTimes: false, noLocation: false,
    sunState: "normal", sunrise: 100, sunset: 200 })
})

test("fixed mode shows the light and dark times and no sun times", () => {
  const v = Panel.modeView({ fallback: null, sun: null }, { mode: "fixed" })
  assert.deepEqual(v, { mode: "fixed", showOffsets: false, showTimes: true, noLocation: false,
    sunState: null, sunrise: null, sunset: null })
})

test("sun mode with no location reports the fallback and shows the fixed times", () => {
  const v = Panel.modeView({ fallback: "noLocation", sun: null }, { mode: "sun" })
  assert.equal(v.noLocation, true)
  assert.equal(v.showTimes, true)
  assert.equal(v.showOffsets, false)
  assert.equal(v.sunrise, null)
})

test("polar days carry their state and no times", () => {
  const v = Panel.modeView({ fallback: null, sun: { state: "polarNight", sunrise: null, sunset: null } }, { mode: "sun" })
  assert.equal(v.sunState, "polarNight")
  assert.equal(v.sunrise, null)
})
