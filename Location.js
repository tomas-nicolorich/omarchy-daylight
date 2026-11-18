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
// Returns { name, latitude, longitude } or null.
function parseGeoResponse(raw) {
  var parsed = parseWeatherFile(raw)
  if (parsed.latitude === null) return null
  if (Math.abs(parsed.latitude) > 90 || Math.abs(parsed.longitude) > 180) return null
  return parsed
}

// Omarchy treats a missing file, or one with neither name nor coordinates, as
// "auto-detect".
function isAuto(weather) {
  return weather.name === "" && weather.latitude === null
}

// What the scheduler should do about location.
//   { location, lookup }
// `location` is { latitude, longitude, name } or null; `lookup` is true when
// the scheduler should request geo.omarchy.org (auto-detect and nothing cached).
// A configured name without coordinates yields no location and no lookup:
// Daylight has no geocoder.
function resolveLocation(weather, cached) {
  if (weather.latitude !== null) {
    return { location: { latitude: weather.latitude, longitude: weather.longitude, name: weather.name }, lookup: false }
  }
  if (!isAuto(weather)) return { location: null, lookup: false }
  if (cached && typeof cached.latitude === "number" && typeof cached.longitude === "number") {
    return { location: { latitude: cached.latitude, longitude: cached.longitude, name: cached.name || "" }, lookup: false }
  }
  return { location: null, lookup: true }
}
