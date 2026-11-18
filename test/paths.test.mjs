// Tests for Paths.js, the plugin id and file paths Service.qml and
// BarWidget.qml share.
//
// Seam: `paths(env)`, a pure function of HOME and XDG_STATE_HOME.

import { test } from "node:test"
import assert from "node:assert/strict"
import { load } from "./load.mjs"

const { PLUGIN_ID, paths } = load("Paths.js")

test("the plugin id matches the manifest", async () => {
  const { readFileSync } = await import("node:fs")
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"))
  assert.equal(PLUGIN_ID, manifest.id)
})

test("paths follow XDG_STATE_HOME when it is set", () => {
  const p = paths("/home/u", "/state")
  assert.equal(p.stateFile, "/state/omarchy/daylight-state.json")
  assert.equal(p.themeNameFile, "/state/omarchy/current/theme.name")
  assert.equal(p.weatherFile, "/state/omarchy/settings/weather.json")
  assert.equal(p.shellJson, "/home/u/.config/omarchy/shell.json")
})

test("paths fall back to ~/.local/state without XDG_STATE_HOME", () => {
  const p = paths("/home/u", "")
  assert.equal(p.stateFile, "/home/u/.local/state/omarchy/daylight-state.json")
  assert.equal(paths("/home/u", undefined).weatherFile, "/home/u/.local/state/omarchy/settings/weather.json")
})
