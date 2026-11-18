import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..")
const load = (file, names) =>
  new Function(`${readFileSync(join(REPO, file), "utf8")}\nreturn { ${names} };`)()
const Config = load("Config.js", "pluginSettings, settingsToSave")
const ID = "tomas.daylight"

const DEFAULTS = {
  mode: "sun", sunriseOffsetMinutes: 0, sunsetOffsetMinutes: 0,
  lightTime: "07:00", darkTime: "19:00", paused: false,
}

test("an empty or junk shell.json gives the defaults", () => {
  assert.deepEqual(Config.pluginSettings({}, ID), DEFAULTS)
  assert.deepEqual(Config.pluginSettings(null, ID), DEFAULTS)
  assert.deepEqual(Config.pluginSettings("x", ID), DEFAULTS)
})

test("settings come from the plugins[] entry", () => {
  const json = { plugins: [{ id: ID, lightTheme: "Flexoki Light", mode: "fixed" }] }
  assert.deepEqual(Config.pluginSettings(json, ID),
    { ...DEFAULTS, lightTheme: "Flexoki Light", mode: "fixed" })
})

test("the bar layout entry wins over plugins[]", () => {
  const json = {
    plugins: [{ id: ID, lightTime: "06:00", darkTime: "20:00" }],
    bar: { layout: { right: [{ id: ID, lightTime: "08:30" }] } },
  }
  const s = Config.pluginSettings(json, ID)
  assert.equal(s.lightTime, "08:30")
  assert.equal(s.darkTime, "20:00")
})

test("invalid values fall back to defaults", () => {
  const json = { plugins: [{ id: ID, mode: "moon", lightTime: "25:00", darkTime: "7pm",
    sunriseOffsetMinutes: "abc", paused: "yes", lightTheme: 5, darkTheme: "  " }] }
  assert.deepEqual(Config.pluginSettings(json, ID), DEFAULTS)
})

test("offsets are rounded to integers and clamped", () => {
  const json = { plugins: [{ id: ID, sunriseOffsetMinutes: 12.6, sunsetOffsetMinutes: -9999 }] }
  const s = Config.pluginSettings(json, ID)
  assert.equal(s.sunriseOffsetMinutes, 13)
  assert.equal(s.sunsetOffsetMinutes, -180)
})

test("a time written as H:MM is normalised to HH:MM", () => {
  const s = Config.pluginSettings({ plugins: [{ id: ID, lightTime: "7:05" }] }, ID)
  assert.equal(s.lightTime, "07:05")
})

test("settingsToSave keeps the other keys of the entry and applies the patch", () => {
  const json = { plugins: [{ id: ID, lightTheme: "a", darkTheme: "b" }] }
  assert.deepEqual(Config.settingsToSave(json, ID, { darkTheme: "c", paused: true }),
    { lightTheme: "a", darkTheme: "c", paused: true })
})

test("settingsToSave writes against the layout entry when there is one", () => {
  const json = {
    plugins: [{ id: ID, lightTheme: "x" }],
    bar: { layout: { left: [{ id: ID, darkTheme: "d" }] } },
  }
  assert.deepEqual(Config.settingsToSave(json, ID, { mode: "fixed" }),
    { darkTheme: "d", mode: "fixed" })
})

test("a null patch value deletes the key", () => {
  const json = { plugins: [{ id: ID, lightTheme: "a" }] }
  assert.deepEqual(Config.settingsToSave(json, ID, { lightTheme: null }), {})
})

test("settingsToSave drops invalid patch values", () => {
  assert.deepEqual(Config.settingsToSave({}, ID, { mode: "moon", lightTime: "7:30" }),
    { lightTime: "07:30" })
})
