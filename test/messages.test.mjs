// Tests for Messages.js, the text Daylight sends to sinks that may render rich
// text: the bar tooltip and the desktop notification.
//
// Seam: the message builders. They take the translator as a function, so a
// test passes an identity translator and checks the exact text that would
// reach the sink, including markup-shaped input (theme and location names).

import { test } from "node:test"
import assert from "node:assert/strict"
import { load } from "./load.mjs"

const { fill, tooltip, nextSwitch, missingThemeNotification } = load("Messages.js")

const t = (key, fallback) => fallback
const SETTINGS = { lightTheme: "Day", darkTheme: "Night" }
const SUMMARY = { period: "light", nextAt: 0, nextPeriod: "dark", nextTheme: "Night" }

test("fill replaces %1 and %2 in a single pass", () => {
  assert.equal(fill("Switching to %1 at %2", ["Nord", "19:00"]), "Switching to Nord at 19:00")
})

test("fill does not re-expand placeholders found inside an argument", () => {
  assert.equal(fill("To %1 at %2", ["%2", "19:00"]), "To %2 at 19:00")
})

test("the tooltip names the next theme and time", () => {
  assert.equal(tooltip(SETTINGS, SUMMARY, "19:00", t), "Switching to Night at 19:00")
})

test("the tooltip asks for themes until both are chosen", () => {
  assert.equal(tooltip({}, SUMMARY, "19:00", t), "Open Daylight to choose your light and dark themes")
})

test("the paused tooltip says switching is paused and promises no switch", () => {
  const text = tooltip({ ...SETTINGS, paused: true }, SUMMARY, "19:00", t)
  assert.equal(text, "Switching is paused")
  assert.doesNotMatch(text, /19:00|Night|next/i)
})

test("markup in a theme name never reaches the tooltip", () => {
  const evil = { ...SUMMARY, nextTheme: '<img src="https://example.invalid/t.png">Night<b>' }
  const text = tooltip(SETTINGS, evil, "19:00", t)
  assert.equal(text, "Switching to Night at 19:00")
  assert.doesNotMatch(text, /[<>]/)
})

test("markup in a theme name never reaches the panel's next-switch line", () => {
  const evil = { ...SUMMARY, nextTheme: "<b>Night</b>" }
  assert.equal(nextSwitch(SETTINGS, evil, "19:00", t), "Next switch: Night at 19:00")
  assert.equal(nextSwitch({}, evil, "19:00", t), "Choose a light and a dark theme to start switching.")
})

test("markup in a theme name never reaches the missing-theme notification", () => {
  const text = missingThemeNotification('<img src="https://example.invalid/t.png">Gone<b>x</b>', t)
  assert.equal(text, 'Theme "Gonex" is not installed, so Daylight skipped the switch.')
  assert.doesNotMatch(text, /[<>]/)
})
