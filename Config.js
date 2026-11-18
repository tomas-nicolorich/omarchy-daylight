// Reading and writing Daylight's settings in shell.json.
//
// Where the shell keeps them depends on how the plugin is placed: a service
// keeps inline settings on its `plugins[]` entry, a bar widget on its
// `bar.layout.<section>[]` entry. updateEntryInline writes the layout entry
// whenever there is one and leaves plugins[] alone, so both are read and the
// layout entry wins. A save sends the keys of that one entry plus the change,
// never the merged config (see settingsToSave).

var MAX_OFFSET_MINUTES = 180

var DEFAULTS = {
  mode: "sun",
  sunriseOffsetMinutes: 0,
  sunsetOffsetMinutes: 0,
  lightTime: "07:00",
  darkTime: "19:00",
  paused: false
}

function copyMatching(entries, id, out) {
  var found = false
  if (!Array.isArray(entries)) return found
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i]
    if (entry && typeof entry === "object" && String(entry.id || "") === id) {
      for (var k in entry) out[k] = entry[k]
      found = true
    }
  }
  return found
}

function copyLayoutEntry(shellJson, id, out) {
  var found = false
  var layout = shellJson.bar && typeof shellJson.bar === "object" ? shellJson.bar.layout : null
  if (layout && typeof layout === "object") {
    for (var section in layout) {
      if (copyMatching(layout[section], id, out)) found = true
    }
  }
  return found
}

// Validators return the cleaned value, or undefined when the value is unusable.
function cleanTheme(v) {
  if (typeof v !== "string") return undefined
  var s = v.trim()
  return s === "" ? undefined : s
}

function cleanMode(v) {
  return v === "sun" || v === "fixed" ? v : undefined
}

function cleanOffset(v) {
  if (typeof v !== "number" || !isFinite(v)) return undefined
  return Math.max(-MAX_OFFSET_MINUTES, Math.min(MAX_OFFSET_MINUTES, Math.round(v)))
}

function cleanTime(v) {
  if (typeof v !== "string") return undefined
  var m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
  if (!m) return undefined
  var h = parseInt(m[1], 10)
  var mi = parseInt(m[2], 10)
  if (h > 23 || mi > 59) return undefined
  return (h < 10 ? "0" : "") + h + ":" + m[2]
}

function cleanBool(v) {
  return typeof v === "boolean" ? v : undefined
}

var CLEANERS = {
  lightTheme: cleanTheme,
  darkTheme: cleanTheme,
  mode: cleanMode,
  sunriseOffsetMinutes: cleanOffset,
  sunsetOffsetMinutes: cleanOffset,
  lightTime: cleanTime,
  darkTime: cleanTime,
  paused: cleanBool
}

// The plugin's settings with defaults applied and invalid values dropped.
// lightTheme and darkTheme are absent when unset.
function pluginSettings(shellJson, id) {
  var raw = {}
  if (shellJson && typeof shellJson === "object") {
    copyMatching(shellJson.plugins, id, raw)
    copyLayoutEntry(shellJson, id, raw)
  }
  var out = {}
  for (var d in DEFAULTS) out[d] = DEFAULTS[d]
  for (var key in CLEANERS) {
    var value = CLEANERS[key](raw[key])
    if (value !== undefined) out[key] = value
  }
  return out
}

// What to hand updateEntryInline to save `patch`: the keys of the one entry the
// shell overwrites plus the change. A patch value of null or undefined deletes
// the key; an invalid value is ignored.
function settingsToSave(shellJson, id, patch) {
  var out = {}
  if (shellJson && typeof shellJson === "object") {
    if (!copyLayoutEntry(shellJson, id, out)) {
      out = {}
      copyMatching(shellJson.plugins, id, out)
    }
  }
  for (var key in patch) {
    if (patch[key] === null || patch[key] === undefined) {
      delete out[key]
    } else if (CLEANERS[key]) {
      var value = CLEANERS[key](patch[key])
      if (value !== undefined) out[key] = value
    } else {
      out[key] = patch[key]
    }
  }
  delete out.id
  return out
}
