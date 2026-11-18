# Spec: Daylight — automatic light/dark theme switching for Omarchy

Status: ready-for-agent
Plugin id: `tomas.daylight` (working name "Daylight"; rename before publishing if a better one comes up)

## Problem Statement

Tomas uses a light Omarchy theme during the day and a dark one at night, and switches between them by hand. He forgets, or switches at the wrong moment, and nothing in Omarchy does it for him. He wants the desktop to change to his chosen light theme in the morning and his chosen dark theme in the evening, either following the real sunrise and sunset where he is or at times he picks. He also wants to publish the plugin on plugins.omarchy.org, so it has to look and behave like a first-party Omarchy plugin and work for other people with no setup beyond choosing two themes.

## Solution

An Omarchy shell plugin with two parts:

- A **scheduler** that runs inside the shell for the whole session. It knows which theme should be active right now, applies it with `omarchy theme set`, and wakes up at the next switch time. It checks again when the shell starts and when the machine resumes from sleep, so a missed switch is caught up.
- A **bar widget**: a sun or moon icon showing the current period. Clicking it opens a panel where the user picks the light theme and the dark theme, chooses the mode (sun or fixed times), adjusts offsets or times, sees when the next switch happens, and can switch now.

Two modes:

- **Sun mode**: the plugin calculates sunrise and sunset locally from the user's location. The location comes from Omarchy's weather location, so most users configure nothing. An offset per edge lets the user shift the switch, for example "dark 30 minutes before sunset".
- **Fixed times**: the user sets the time to switch to light and the time to switch to dark.

If the user changes the theme by hand, the plugin respects it until the next scheduled switch.

## User Stories

1. As an Omarchy user, I want to choose which installed theme is my light theme, so that the day theme is one I like.
2. As an Omarchy user, I want to choose which installed theme is my dark theme, so that the night theme is one I like.
3. As an Omarchy user, I want the plugin to switch to my light theme at sunrise, so that my desktop matches the daylight without my doing anything.
4. As an Omarchy user, I want the plugin to switch to my dark theme at sunset, so that my screen is easier on my eyes in the evening.
5. As an Omarchy user, I want sunrise and sunset calculated for my own location, so that the switch follows the real sun where I live and through the seasons.
6. As an Omarchy user, I want the plugin to use the location I already set for Omarchy's weather widget, so that I don't enter it twice.
7. As an Omarchy user with no weather location set, I want the plugin to use Omarchy's auto-detected location, so that sun mode works out of the box.
8. As an Omarchy user whose location cannot be determined, I want the panel to tell me and the plugin to fall back to fixed times, so that switching still happens and I know why.
9. As an Omarchy user, I want to shift the sunrise switch earlier or later by a number of minutes, so that light mode starts when I want it to.
10. As an Omarchy user, I want to shift the sunset switch earlier or later by a number of minutes, so that dark mode starts before it actually gets dark.
11. As an Omarchy user, I want a fixed-times mode where I set the light time and the dark time, so that the switch follows my routine instead of the sun.
12. As an Omarchy user, I want to switch between sun mode and fixed-times mode in the panel, so that I can change my mind without editing files.
13. As an Omarchy user, I want the correct theme applied when I log in or the shell restarts, so that I never start the day in the wrong theme.
14. As a laptop user, I want the correct theme applied when my laptop wakes from sleep, so that a switch that happened while it was suspended is not missed.
15. As an Omarchy user, I want the plugin to do nothing when the correct theme is already active, so that it doesn't re-apply the theme and flash the screen.
16. As an Omarchy user, I want a theme I pick by hand to stay until the next scheduled switch, so that the plugin doesn't fight me.
17. As an Omarchy user, I want scheduled switching to resume at the next switch after a manual change, so that I don't have to turn anything back on.
18. As an Omarchy user, I want a sun icon in the bar during the light period and a moon icon during the dark period, so that I can see the state at a glance.
19. As an Omarchy user, I want to click the bar icon to open a panel, so that all the settings are one click away.
20. As an Omarchy user, I want the panel to show when the next switch happens and to which theme, so that I know what to expect.
21. As an Omarchy user, I want the panel to show today's sunrise and sunset times in sun mode, so that I understand when switches will happen.
22. As an Omarchy user, I want a "Switch now" action in the panel, so that I can flip to the other theme immediately.
23. As an Omarchy user, I want to pause automatic switching, so that I can keep one theme for a while (for example while presenting).
24. As an Omarchy user, I want the bar icon to show that switching is paused, so that I don't forget I paused it.
25. As an Omarchy user, I want the panel to look and animate like Omarchy's built-in panels and follow the current theme's colors, so that it feels native.
26. As an Omarchy user, I want the panel to work with the keyboard like other Omarchy panels, so that I don't need the mouse.
27. As an Omarchy user, I want my settings to survive shell restarts and plugin updates, so that I configure it once.
28. As an Omarchy user, I want a notification if my chosen light or dark theme has been removed, so that I know why the switch didn't happen.
29. As an Omarchy user, I want the plugin to keep working when no light or dark theme is chosen yet, by doing nothing and asking me to choose in the panel, so that installing it never changes my theme unexpectedly.
30. As a user far north or south, I want sensible behaviour on days with no sunrise or no sunset, so that the plugin keeps the light theme during midnight sun and the dark theme during polar night.
31. As a user who changes time zone while travelling, I want switch times recalculated for the new local time and location, so that the theme follows where I am.
32. As a user around a daylight-saving change, I want the switch to happen at the right wall-clock time, so that the hour change doesn't break the schedule.
33. As an Omarchy user in another language, I want the panel text in my language when a translation exists, and in English otherwise, so that the plugin follows Omarchy's language setting.
34. As an Omarchy user, I want times shown in my locale's format, so that they read naturally.
35. As a user browsing plugins.omarchy.org, I want a README with a screenshot, install command and settings explanation, so that I can decide whether to install it.
36. As a user installing it with `omarchy plugin add`, I want installing and removing the plugin to be safe and leave no leftovers outside its settings, so that I can try it without risk.
37. As a privacy-conscious user, I want sunrise and sunset calculated on my machine with no network calls by this plugin, so that my location isn't sent anywhere new.

## Implementation Decisions

- **Plugin shape**: a user plugin in its own git repo (published from GitHub, installed with `omarchy plugin add`). The manifest declares the kinds `bar-widget` and a kept-loaded scheduler, so switching runs even when the panel is closed and even if the user removes the bar widget from the bar. Model the layout on Tomas's existing plugins (`tomas.valkiria`, `wallpaper-rotator`) and the first-party `omarchy.weather` and `omarchy.nightlight` plugins; read their source under the Omarchy shell directory for the current contracts. Category for the bar widget: Appearance.
- **Schedule model (pure JS, the main seam)**: one QML `.js` resource holding all decision logic, with no QML or I/O. Its central function takes the settings, the location, the clock time and the scheduler's saved state, and returns:
  - which period is current (`light` or `dark`),
  - the time of the next switch and the period it leads to,
  - whether a theme should be applied now, and which one,
  - today's sunrise and sunset (sun mode) for the panel.
  The QML side only feeds it inputs and carries out the result.
- **Sun calculation**: the standard NOAA sunrise/sunset algorithm (solar zenith 90.833°), implemented inside the model. No network. Days with no sunrise give the dark period all day; days with no sunset give the light period all day.
- **Manual-change rule**: the scheduler stores the time of the last switch boundary it acted on. It applies a theme only when it crosses a new boundary (at the timer, on start-up, or after resume). Between boundaries it never touches the theme, so a hand-picked theme stays until the next boundary. On first start (no saved state) it applies the current period's theme only if both themes are chosen.
- **Idempotence**: before applying, compare against the current theme name (Omarchy keeps it in its current-theme state file). If it already matches, record the boundary and do nothing.
- **Applying a theme**: run `omarchy theme set <name>` detached. Theme names are passed as a separate argument, never interpolated into a shell string. Before applying, check the theme still exists (`omarchy theme list` or `omarchy theme dir`); if not, send a notification and skip.
- **Timer and resume**: one timer set to the next switch time, capped at a short maximum interval (for example 5 minutes) so clock jumps, sleep and time-zone changes are caught by re-evaluation. Re-evaluate on shell start and when the location or settings change.
- **Location**: read Omarchy's weather location file (latitude, longitude, name). If it is unset, use whatever auto-detected location Omarchy's weather plugin exposes; check its source for how it resolves the location rather than adding a new network lookup. If no location is available, sun mode falls back to the fixed times and the panel says so.
- **Settings storage**: in the plugin's entry in `shell.json`, read and written the same way `tomas.valkiria` does (a small config module, tested). Settings: `lightTheme`, `darkTheme`, `mode` (`sun` | `fixed`), `sunriseOffsetMinutes`, `sunsetOffsetMinutes`, `lightTime`, `darkTime` (`HH:MM`), `paused`. Defaults: mode `sun`, offsets 0, fixed times 07:00 and 19:00, themes unset, not paused.
- **Scheduler state**: the last boundary acted on lives in a small state file under the user's local state directory, separate from settings, so it is not synced as configuration.
- **Bar widget**: sun icon in the light period, moon icon in the dark period, a dimmed or paused variant while paused. Tooltip: next switch time and target theme.
- **Panel**: built on Omarchy's `KeyboardPanel` and kit components from `qs.Ui`, colors from the shell theme, motion via `Style.duration` and the Omarchy easing rules. Contents: light and dark theme pickers (from the installed theme list), mode toggle, offsets or times depending on mode, today's sunrise and sunset, next switch, Switch now, Pause.
- **Switch now**: applies the other period's theme and counts as a manual change: the schedule resumes at the next boundary.
- **Translations**: all user-facing strings in `i18n/en.json`, read through `Commons.Translations`; times formatted with `Qt.locale(Commons.I18n.formatLocale)`.
- **Safety**: all displayed dynamic text (theme names, location name) uses `Text.PlainText`. Theme names from settings are validated against the installed theme list before use.
- **Publishing**: MIT license, README with preview image, `manifest.json` at repo root with `schemaVersion`, `id`, `name`, `version`, `author`, `license`, `description`, `kinds`, `entryPoints`, `barWidget`. Must pass `omarchy plugin validate`. Submission is through the GitHub issue form on omacom/omarchy-plugin-marketplace (done by Tomas, not the agent).

## Testing Decisions

- **One main seam**: the schedule model's central function. Tests drive it with settings, a location, a clock time and saved state, and check only its output (current period, next switch, whether to apply and what). They never check internal helpers.
- **Second seam**: the config module that reads and writes the plugin's `shell.json` entry, tested the same way as Valkiria's.
- **Runner**: `node --test` with `.test.mjs` files that evaluate the QML `.js` resource through `new Function(...)`, exactly like `tomas.valkiria/test/brain.test.mjs` and `config.test.mjs`. No build step, no dependencies.
- **Cases to cover**:
  - sunrise and sunset for known places and dates, compared with published NOAA values within a minute or two;
  - offsets in both directions;
  - fixed-times mode, including a dark time after midnight;
  - start-up in each period, with and without saved state;
  - a manual change between boundaries is left alone, and the next boundary applies;
  - resume after sleeping across one or more boundaries applies the current period's theme once;
  - midnight sun and polar night;
  - daylight-saving transitions;
  - no themes chosen and no location available;
  - current theme already correct (no apply).
- **Live check**: in the real shell, set fixed times one or two minutes ahead and watch both switches happen; restart the shell after editing QML before testing (hot reload can run stale QML on this machine).

## Out of Scope

- More than two themes, or per-weekday schedules.
- Switching wallpapers, terminal schemes or apps separately from the Omarchy theme (`omarchy theme set` already covers what the theme covers).
- Gradual transitions or crossfades between themes.
- Changing night light (hyprsunset) behaviour.
- Its own geolocation lookup or manual latitude/longitude entry (rely on Omarchy's weather location).
- Translations beyond English for the first release.
- Submitting the listing to the marketplace.

## Further Notes

- The marketplace had no light/dark or time-based theme plugin as of 2026-11-18.
- Omarchy's weather location format is owned by `omarchy-weather-location`; read that command's source before parsing the file.
- Valkiria (`~/Projects/omarchy-navbar-valkiria`) is the closest prior art for repo layout, tests, README, preview image and LICENSE.
- The repo lives at `~/Projects/omarchy-daylight` and is symlinked to `~/.config/omarchy/plugins/tomas.daylight`, so the shell loads it once `manifest.json` exists. After publishing, replace the symlink with a normal `omarchy plugin add` install.
