// Daylight's location handling: pure parsing and choice, no QML and no I/O.
//
// Omarchy keeps a configured location in
// ~/.local/state/omarchy/settings/weather.json as { name, latitude, longitude }.
// With no file (auto-detect), Omarchy's weather plugin holds the detected
// location only in memory, so Daylight asks https://geo.omarchy.org/ itself
// once and caches the answer in its own state file.

function parseCoordinate(value) {
  var n = parseFloat(value)
  return isFinite(n) ? n : null
}

// Mirrors Omarchy's weather plugin: coordinates count only when both parse.
function parseWeatherFile(raw) {
  var empty = { name: "", latitude: null, longitude: null }
  try {
    var data = JSON.parse(raw)
    var lat = parseCoordinate(data.latitude)
    var lon = parseCoordinate(data.longitude)
    var name = typeof data.name === "string" ? data.name.trim() : ""
    if (lat === null || lon === null) return { name: name, latitude: null, longitude: null }
    return { name: name, latitude: lat, longitude: lon }
  } catch (e) {
    return empty
  }
}

// The geo.omarchy.org response: { name, latitude, longitude, ... }.
// Returns { name, latitude, longitude } or null. The name is network data, so
// it is cut to MAX_NAME_LENGTH.
var MAX_NAME_LENGTH = 100

function parseGeoResponse(raw) {
  var parsed = parseWeatherFile(raw)
  if (parsed.latitude === null) return null
  if (Math.abs(parsed.latitude) > 90 || Math.abs(parsed.longitude) > 180) return null
  parsed.name = parsed.name.slice(0, MAX_NAME_LENGTH)
  return parsed
}

// A failed lookup is not retried for this long, unless the time zone changes
// or the user asks for a refresh.
var RETRY_AFTER_FAILURE_MS = 24 * 60 * 60 * 1000

// Omarchy treats a missing file, or one with neither name nor coordinates, as
// "auto-detect".
function isAuto(weather) {
  return weather.name === "" && weather.latitude === null
}

// What the scheduler should do about location.
//   { location, lookup }
// `location` is { latitude, longitude, name } or null; `lookup` is true when
// the scheduler should request geo.omarchy.org. That happens in auto-detect
// when nothing is cached, when the time zone differs from the one the cached
// location was fetched in, or when the user asked for a refresh since. A failed
// lookup backs off (see withFailure) and a stale cached location stays in use
// meanwhile. A configured name without coordinates yields no location and no
// lookup: Daylight has no geocoder.
//
// `state` is the scheduler's saved state ({ location, geoFailure, refreshAt });
// `ctx` is { zone, now }: the time zone id ("" when unknown) and the clock.
function resolveLocation(weather, state, ctx) {
  if (weather.latitude !== null) {
    return { location: { latitude: weather.latitude, longitude: weather.longitude, name: weather.name }, lookup: false }
  }
  if (!isAuto(weather)) return { location: null, lookup: false }

  var saved = state || {}
  var env = ctx || {}
  var c = saved.location
  var cached = c && typeof c.latitude === "number" && typeof c.longitude === "number" ? c : null
  var location = cached ? { latitude: cached.latitude, longitude: cached.longitude, name: cached.name || "" } : null

  var refreshAt = typeof saved.refreshAt === "number" ? saved.refreshAt : 0
  var zoneChanged = !!cached && !!env.zone && cached.zone !== env.zone
  var refreshAsked = !!cached && refreshAt > (typeof cached.at === "number" ? cached.at : 0)
  if (cached && !zoneChanged && !refreshAsked) return { location: location, lookup: false }

  var failure = saved.geoFailure
  var backingOff = !!failure && typeof failure.at === "number" &&
    failure.at >= refreshAt &&
    (!env.zone || failure.zone === env.zone) &&
    typeof env.now === "number" && env.now - failure.at < RETRY_AFTER_FAILURE_MS
  return { location: location, lookup: !backingOff }
}

// The saved state after a successful lookup: the location, stamped with the
// time zone and time it was fetched in, and no failure on record.
function withFetched(state, found, zone, now) {
  var out = {}
  for (var k in state) out[k] = state[k]
  delete out.geoFailure
  out.location = { name: found.name, latitude: found.latitude, longitude: found.longitude, zone: zone || "", at: now }
  return out
}

// The saved state after a failed lookup: it is not retried for a day, unless
// the time zone changes first.
function withFailure(state, zone, now) {
  var out = {}
  for (var k in state) out[k] = state[k]
  out.geoFailure = { at: now, zone: zone || "" }
  return out
}

// The saved state after the user pressed Refresh location: the next
// evaluation looks up again, whatever the cache or a backoff says.
function refreshRequest(state, now) {
  var out = {}
  for (var k in state) out[k] = state[k]
  out.refreshAt = now
  return out
}
