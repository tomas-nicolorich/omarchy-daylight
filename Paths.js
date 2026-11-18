// The plugin id and the files Service.qml and BarWidget.qml both read, in one
// place. Pure: the QML side passes HOME and XDG_STATE_HOME in.
.pragma library

var PLUGIN_ID = "tomas.daylight"

// Writes $2 to the file $1 through a temp file, creating the directory. Never
// aimed inside the plugin directory: the shell reloads a plugin on any write
// there.
var WRITE_FILE_SCRIPT = 'mkdir -p "$(dirname "$1")" && printf %s "$2" > "$1.tmp" && mv "$1.tmp" "$1"'

function paths(home, xdgStateHome) {
  var stateHome = xdgStateHome || (home + "/.local/state")
  return {
    shellJson: home + "/.config/omarchy/shell.json",
    stateFile: stateHome + "/omarchy/daylight-state.json",
    themeNameFile: stateHome + "/omarchy/current/theme.name",
    weatherFile: stateHome + "/omarchy/settings/weather.json"
  }
}
