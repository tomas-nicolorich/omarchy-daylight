import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..")
const load = (file, names) =>
  new Function(`${readFileSync(join(REPO, file), "utf8")}\nreturn { ${names} };`)()
const { parseWeatherFile, parseGeoResponse, resolveLocation } =
  load("Location.js", "parseWeatherFile, parseGeoResponse, resolveLocation")

const CACHED = { latitude: 39.56939, longitude: 2.65024, name: "Palma" }

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
  assert.deepEqual(resolveLocation(w, CACHED), { location: null, lookup: false })
})

test("auto-detect with a cached location reuses it without a lookup", () => {
  const w = parseWeatherFile("")
  assert.deepEqual(resolveLocation(w, CACHED), { location: CACHED, lookup: false })
})

test("auto-detect with nothing cached asks for one lookup", () => {
  assert.deepEqual(resolveLocation(parseWeatherFile("{}"), null), { location: null, lookup: true })
  assert.deepEqual(resolveLocation(parseWeatherFile("not json"), {}), { location: null, lookup: true })
})

test("a configured location wins over the cache", () => {
  const w = parseWeatherFile('{"latitude":1,"longitude":2}')
  assert.equal(resolveLocation(w, CACHED).location.latitude, 1)
})

test("the geo response is parsed and bad ones are rejected", () => {
  const ok = parseGeoResponse('{"name":"Palma","latitude":39.56939,"longitude":2.65024,"country":"ES"}')
  assert.deepEqual(ok, { name: "Palma", latitude: 39.56939, longitude: 2.65024 })
  assert.equal(parseGeoResponse("<html>"), null)
  assert.equal(parseGeoResponse('{"name":"x"}'), null)
  assert.equal(parseGeoResponse('{"latitude":99,"longitude":0}'), null)
})
