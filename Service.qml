// Daylight's scheduler. Kept loaded, so switching runs with no bar widget.
//
// All decisions come from Schedule.js and Location.js; this file feeds them
// inputs (settings, saved state, current theme, installed themes, time zone,
// the clock) and carries out the result (apply a theme, notify, save state,
// look up the location).
//
// The state file lives under ~/.local/state, never inside the plugin
// directory: the shell reloads a plugin on any write there.
import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons as Commons
import "Config.js" as Config
import "Schedule.js" as Schedule
import "Location.js" as Location
import "Messages.js" as Messages
import "Paths.js" as Paths
import "Util.js" as Util
import "BarStyle.js" as BarStyle

Item {
  id: root

  // Injected by omarchy-shell.
  property var shell: null
  property var manifest: null

  readonly property var files: Paths.paths(Quickshell.env("HOME"), Quickshell.env("XDG_STATE_HOME"))
  // The longest sleep between evaluations, a backstop for clock jumps and for
  // anything the heartbeat misses.
  readonly property int maxIntervalMs: 5 * 60 * 1000
  // How often the heartbeat compares the wall clock to notice a resume.
  readonly property int heartbeatMs: 30 * 1000

  Commons.Translations {
    id: strings
    directory: Qt.resolvedUrl("i18n")
  }

  property var shellJson: null
  property bool settingsLoaded: false
  property var lastBeat: null
  // Time zone id seen by the last probe, stamped on a fetched location.
  property string zone: ""

  function settings() {
    return Config.pluginSettings(root.shellJson, Paths.PLUGIN_ID)
  }

  function translate(key, fallback) {
    return strings.t(key, fallback)
  }

  // Read state, current theme, weather file, time zone and installed themes in
  // one go, then decide.
  function tick() {
    if (!settingsLoaded || probe.running) return
    probe.running = true
  }

  function parseProbe(text) {
    var parts = text.split("\n@@@\n")
    var state = null
    try { state = JSON.parse(parts[0]) } catch (e) { state = null }
    return {
      state: (state && typeof state === "object") ? state : {},
      currentTheme: (parts[1] || "").trim(),
      weather: Location.parseWeatherFile(parts[2] || ""),
      zone: (parts[3] || "").trim(),
      installedThemes: Util.parseThemeList(parts[4])
    }
  }

  // Everything Daylight remembers, rewritten whole so the boundary and the
  // cached location never overwrite each other.
  property var savedState: ({})

  function saveState() {
    Quickshell.execDetached(["bash", "-c", Paths.WRITE_FILE_SCRIPT,
      "bash", root.files.stateFile, JSON.stringify(root.savedState)])
  }

  function decide(text) {
    var seen = parseProbe(text)
    root.savedState = seen.state
    root.zone = seen.zone
    if (root.barBackgrounds === null) {
      var stored = seen.state.barBackgrounds
      root.barBackgrounds = (stored && typeof stored === "object") ? stored : {}
      checkBar(false)
    } else {
      root.savedState.barBackgrounds = root.barBackgrounds
    }

    // Weather location first; otherwise Omarchy's geo endpoint, cached in the
    // state file. Location.js decides when to ask again.
    var where = Location.resolveLocation(seen.weather, seen.state, { zone: seen.zone, now: Date.now() })
    if (where.lookup && !geo.running) geo.running = true

    var result = Schedule.evaluate({
      settings: settings(),
      location: where.location,
      now: Date.now(),
      state: seen.state,
      currentTheme: seen.currentTheme,
      installedThemes: seen.installedThemes
    })

    if (result.apply) {
      Commons.Util.execArgv(["omarchy", "theme", "set", result.apply])
    } else if (result.missing) {
      Commons.Util.execArgv(["omarchy-notification-send", "-u", "normal", "Daylight",
        Messages.missingThemeNotification(result.missing, root.translate)])
    }
    if (result.record) {
      root.savedState.lastBoundary = result.boundary
      root.savedState.nextAt = result.next.at
      saveState()
    }

    var wait = result.next.at - Date.now() + 500
    timer.interval = Math.max(1000, Math.min(root.maxIntervalMs, wait))
    timer.restart()
  }

  // The bar background remembered per period (BarStyle.js). Kept here as well
  // as in savedState, so a probe that read the state file just before a save
  // cannot lose it. Null until the first probe has read the state file.
  property var barBackgrounds: null
  // The theme the last bar check saw, from theme.name.
  property string barTheme: ""
  // A background Daylight just set that shell.json does not show yet. Until it
  // does, a shell.json reload is not the person changing the background.
  property string pendingBackground: ""

  function checkBar(themeChanged) {
    if (root.barBackgrounds === null || !root.settingsLoaded || root.barTheme === "") return
    var background = BarStyle.backgroundOf(root.shellJson)
    if (root.pendingBackground !== "" && !themeChanged) {
      if (background !== root.pendingBackground) return
      root.pendingBackground = ""
    }
    var result = BarStyle.reconcile({
      period: BarStyle.periodOf(root.barTheme, settings()),
      themeChanged: themeChanged,
      background: background,
      saved: root.barBackgrounds
    })
    if (result.changed) {
      root.barBackgrounds = result.saved
      root.savedState.barBackgrounds = result.saved
      saveState()
    }
    if (result.apply) {
      root.pendingBackground = result.apply
      pendingTimeout.restart()
      Commons.Util.execArgv(["omarchy", "bar", "background", result.apply])
    }
  }

  // Gives up on a background that never reached shell.json (the command
  // failed), so later changes are remembered again.
  Timer {
    id: pendingTimeout
    interval: 15000
    repeat: false
    onTriggered: root.pendingBackground = ""
  }

  // A theme change from anywhere (Daylight, Switch now, the theme menu)
  // restores that period's bar background.
  FileView {
    path: root.files.themeNameFile
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: {
      var name = text().trim()
      var changed = root.barTheme !== "" && name !== root.barTheme
      root.barTheme = name
      root.checkBar(changed)
    }
  }

  // One request to the endpoint Omarchy's own weather widget uses. The size
  // limit bounds what a bad response can cost.
  Process {
    id: geo
    command: ["curl", "-fsS", "--max-time", "4", "--max-filesize", "4096", "https://geo.omarchy.org/"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var found = Location.parseGeoResponse(text)
        root.savedState = found
          ? Location.withFetched(root.savedState, found, root.zone, Date.now())
          : Location.withFailure(root.savedState, root.zone, Date.now())
        root.saveState()
        root.tick()
      }
    }
  }

  Process {
    id: probe
    // `omarchy theme list` runs the way Util.execArgv runs the apply command
    // (a login shell, so `omarchy` resolves identically); the file reads stay
    // outside it so profile output cannot corrupt the state.
    command: ["bash", "-c",
      "cat \"$1\" 2>/dev/null; printf '\\n@@@\\n'; cat \"$2\" 2>/dev/null; printf '\\n@@@\\n'; cat \"$3\" 2>/dev/null; printf '\\n@@@\\n'; readlink -f /etc/localtime 2>/dev/null; printf '\\n@@@\\n'; bash -lc 'exec \"$@\"' bash omarchy theme list 2>/dev/null",
      "bash", root.files.stateFile, root.files.themeNameFile, root.files.weatherFile]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: root.decide(text)
    }
  }

  Timer {
    id: timer
    repeat: false
    onTriggered: root.tick()
  }

  // Timers pause while the machine sleeps, so a wall-clock gap between two
  // beats means it resumed (or the clock jumped): evaluate at once.
  Timer {
    interval: root.heartbeatMs
    running: true
    repeat: true
    onTriggered: {
      var now = Date.now()
      if (Schedule.resumedAfterGap(root.lastBeat, now, root.heartbeatMs)) root.tick()
      root.lastBeat = now
    }
  }

  // Re-evaluate when the weather location, the Refresh location button (which
  // writes the state file) or the system time zone changes.
  FileView {
    path: root.files.weatherFile
    watchChanges: true
    printErrors: false
    onFileChanged: root.tick()
  }

  FileView {
    path: root.files.stateFile
    watchChanges: true
    printErrors: false
    onFileChanged: root.tick()
  }

  FileView {
    path: "/etc/localtime"
    watchChanges: true
    printErrors: false
    onFileChanged: root.tick()
  }

  FileView {
    id: shellFile
    path: root.files.shellJson
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: {
      try { root.shellJson = JSON.parse(text()) } catch (e) { root.shellJson = null }
      root.settingsLoaded = true
      root.checkBar(false)
      root.tick()
    }
    onLoadFailed: {
      root.shellJson = null
      root.settingsLoaded = true
      root.tick()
    }
  }
}
