import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..")
const load = (file, names) =>
  new Function(`${readFileSync(join(REPO, file), "utf8")}\nreturn { ${names} };`)()
const Panel = load("PanelModel.js", "plainText, themeOptions, needsThemes, summary, withTimePart, switchTarget, modeView")

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

test("markup in a theme name is neutralised for display", () => {
  assert.equal(Panel.plainText("<b>Flexoki</b> Light"), "Flexoki Light")
  assert.equal(Panel.plainText(undefined), "")
})

test("theme options list the installed themes with plain labels", () => {
  assert.deepEqual(Panel.themeOptions(["Nord", "<i>Tokyo</i> Night"], undefined), [
    { value: "Nord", label: "Nord" },
    { value: "<i>Tokyo</i> Night", label: "Tokyo Night" },
  ])
})

test("a saved theme that is no longer installed stays selectable", () => {
  assert.deepEqual(Panel.themeOptions(["Nord"], "Gone"), [
    { value: "Gone", label: "Gone" },
    { value: "Nord", label: "Nord" },
  ])
})

test("a saved theme matching an installed one by slug is not duplicated", () => {
  assert.equal(Panel.themeOptions(["Flexoki Light"], "flexoki-light").length, 1)
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
