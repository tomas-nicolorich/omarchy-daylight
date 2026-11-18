// Tests for Location.js, Daylight's location handling.
//
// Seam: `resolveLocation(weather, state, ctx)` says which location to use and
// whether the scheduler should ask geo.omarchy.org; the state helpers
// (withFetched, withFailure, refreshRequest) build the saved state that
// decision reads back. All pure: the scheduler only feeds inputs and runs curl.

import { test } from "node:test"
import assert from "node:assert/strict"
import { load } from "./load.mjs"

const { parseWeatherFile, parseGeoResponse, resolveLocation, isAuto,
  withFetched, withFailure, refreshRequest } = load("Location.js")

const CACHED = { latitude: 39.56939, longitude: 2.65024, name: "Palma" }
const AUTO = parseWeatherFile("")
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 5, 10, 12)
const ctx = (over) => ({ zone: "Europe/Madrid", now: NOW, ...over })

test("a weather file with coordinates is used and never looked up", () => {
  const w = parseWeatherFile('{"name":"Malibu","latitude":34.03,"longitude":-118.69}')
  assert.deepEqual(resolveLocation(w, null),
    { location: { latitude: 34.03, longitude: -118.69, name: "Malibu" }, lookup: false })
})

test("string coordinates are parsed like Omarchy does", () => {
  const w = parseWeatherFile('{"name":"X","latitude":"10.5","longitude":"-20"}')
  assert.equal(resolveLocation(w, null).location.latitude, 10.5)
})

test("a name without coordinates gives no location and no lookup", () => {
  const w = parseWeatherFile('{"name":"Malibu"}')
  assert.deepEqual(resolveLocation(w, { location: CACHED }), { location: null, lookup: false })
})

test("auto-detect with a cached location reuses it without a lookup", () => {
  assert.deepEqual(resolveLocation(AUTO, { location: CACHED }), { location: CACHED, lookup: false })
})

test("auto-detect with nothing cached asks for one lookup", () => {
  assert.deepEqual(resolveLocation(parseWeatherFile("{}"), null), { location: null, lookup: true })
  assert.deepEqual(resolveLocation(parseWeatherFile("not json"), { location: {} }), { location: null, lookup: true })
})

test("a configured location wins over the cache", () => {
  const w = parseWeatherFile('{"latitude":1,"longitude":2}')
  assert.equal(resolveLocation(w, { location: CACHED }).location.latitude, 1)
})

test("only an unset weather location uses the lookup", () => {
  assert.equal(isAuto(AUTO), true)
  assert.equal(isAuto(parseWeatherFile('{"name":"Malibu"}')), false)
  assert.equal(isAuto(parseWeatherFile('{"latitude":1,"longitude":2}')), false)
})

// ---- geo response ----
test("the geo response is parsed and bad ones are rejected", () => {
  const ok = parseGeoResponse('{"name":"Palma","latitude":39.56939,"longitude":2.65024,"country":"ES"}')
  assert.deepEqual(ok, { name: "Palma", latitude: 39.56939, longitude: 2.65024 })
  assert.equal(parseGeoResponse("<html>"), null)
  assert.equal(parseGeoResponse('{"name":"x"}'), null)
  assert.equal(parseGeoResponse('{"latitude":99,"longitude":0}'), null)
})

test("a long location name is capped", () => {
  const long = "A".repeat(5000)
  const parsed = parseGeoResponse(JSON.stringify({ name: long, latitude: 1, longitude: 2 }))
  assert.equal(parsed.name.length, 100)
  assert.equal(parsed.latitude, 1)
})

// ---- failed lookups back off ----
test("a failed lookup is not retried for a day", () => {
  const state = withFailure({}, "Europe/Madrid", NOW)
  assert.deepEqual(resolveLocation(AUTO, state, ctx({ now: NOW + 5 * 60000 })), { location: null, lookup: false })
  assert.equal(resolveLocation(AUTO, state, ctx({ now: NOW + DAY - 1 })).lookup, false)
})

test("a failed lookup is retried after a day", () => {
  const state = withFailure({}, "Europe/Madrid", NOW)
  assert.equal(resolveLocation(AUTO, state, ctx({ now: NOW + DAY })).lookup, true)
})

test("a failed lookup is retried at once after a time zone change", () => {
  const state = withFailure({}, "Europe/Madrid", NOW)
  assert.equal(resolveLocation(AUTO, state, ctx({ zone: "America/New_York", now: NOW + 60000 })).lookup, true)
})

// ---- the cache follows the time zone ----
test("a location fetched in this time zone is kept", () => {
  const state = withFetched({}, CACHED, "Europe/Madrid", NOW)
  const r = resolveLocation(AUTO, state, ctx({ now: NOW + 7 * DAY }))
  assert.equal(r.lookup, false)
  assert.equal(r.location.name, "Palma")
})

test("a time zone change refreshes the cached location and keeps using it until then", () => {
  const state = withFetched({}, CACHED, "Europe/Madrid", NOW)
  const r = resolveLocation(AUTO, state, ctx({ zone: "America/New_York", now: NOW + DAY }))
  assert.equal(r.lookup, true)
  assert.equal(r.location.name, "Palma")
})

test("an unknown time zone never triggers a refresh", () => {
  const state = withFetched({}, CACHED, "Europe/Madrid", NOW)
  assert.equal(resolveLocation(AUTO, state, ctx({ zone: "" })).lookup, false)
})

test("a refresh that fails after a time zone change backs off, keeping the old location", () => {
  const fetched = withFetched({}, CACHED, "Europe/Madrid", NOW)
  const failed = withFailure(fetched, "America/New_York", NOW + 1000)
  const r = resolveLocation(AUTO, failed, ctx({ zone: "America/New_York", now: NOW + 60000 }))
  assert.equal(r.lookup, false)
  assert.equal(r.location.name, "Palma")
})

test("a stored lookup holds the zone and clears an earlier failure", () => {
  const state = withFetched(withFailure({ keep: 1 }, "Europe/Madrid", NOW), CACHED, "Europe/Madrid", NOW + 5)
  assert.equal(state.keep, 1)
  assert.equal(state.geoFailure, undefined)
  assert.deepEqual(state.location, { ...CACHED, zone: "Europe/Madrid", at: NOW + 5 })
})

// ---- the Refresh location button ----
test("a refresh request makes the next evaluation look up again", () => {
  const fetched = withFetched({}, CACHED, "Europe/Madrid", NOW)
  const asked = refreshRequest(fetched, NOW + 1000)
  const r = resolveLocation(AUTO, asked, ctx({ now: NOW + 2000 }))
  assert.equal(r.lookup, true)
  assert.equal(r.location.name, "Palma")
})

test("a refresh request overrides a backoff", () => {
  const failed = withFailure({}, "Europe/Madrid", NOW)
  const asked = refreshRequest(failed, NOW + 1000)
  assert.equal(resolveLocation(AUTO, asked, ctx({ now: NOW + 2000 })).lookup, true)
})

test("once the refresh succeeds, the lookup stops", () => {
  const asked = refreshRequest(withFetched({}, CACHED, "Europe/Madrid", NOW), NOW + 1000)
  const done = withFetched(asked, { ...CACHED, name: "Madrid" }, "Europe/Madrid", NOW + 3000)
  const r = resolveLocation(AUTO, done, ctx({ now: NOW + 4000 }))
  assert.equal(r.lookup, false)
  assert.equal(r.location.name, "Madrid")
})

test("a refresh that fails is not retried until the backoff ends", () => {
  const asked = refreshRequest(withFetched({}, CACHED, "Europe/Madrid", NOW), NOW + 1000)
  const failed = withFailure(asked, "Europe/Madrid", NOW + 3000)
  const r = resolveLocation(AUTO, failed, ctx({ now: NOW + 4000 }))
  assert.equal(r.lookup, false)
  assert.equal(r.location.name, "Palma")
})
