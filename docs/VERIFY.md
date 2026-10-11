# Verify on real Superset before releasing or upgrading

Use an existing Superset 6.1.x with the built package installed and
`init_jalali(globals())`. This repository deliberately contains no demo stack,
sample data, browser automation, or host application. Unit tests and source
inspection cannot establish these runtime results.

Record Superset version, plugin version, date, browser, server/database timezones,
URL prefix, CSP settings, and the result of each check. Initial runtime
verification is **pending**; do not label a release runtime-verified until this
checklist has been completed.
Report results in a [GitHub issue](https://github.com/alip990/superset-jalali/issues/new),
including failures and any checks skipped with their reasons. Do not include
guest tokens or other credentials.

- [ ] `/superset-jalali/health` returns `ok: true` with a hashed bundle. Logged-in
  `GET /dynamic-plugins/api/read` returns 200 and one plugin; logged-out requests
  return 200 and `{"result": []}`. Repeat under `APPLICATION_ROOT` if used.
- [ ] Health responses use HTTP 200 and `Cache-Control: no-store`, and include
  the installed `version` and hashed `bundle` when `ok: true`. A missing bundle
  or missing/invalid manifest yields `ok: false` and `bundle: null`. Restore
  assets after testing; health checks local files, not browser import success.
- [ ] As an admin, a dashboard Time range native filter shows the Persian RTL picker, with
  Saturday first. Pick 1403/07/01–1403/07/30. The saved value is
  `2024-09-22T00:00:00 : 2024-10-22T00:00:00`. Charts with a temporal date-column
  time pill update, including records late on the final day and excluding the
  following midnight. Check scope and save/reload the filter.
- [ ] Repeat in an embedded dashboard using a guest token. Inspect the discovery
  request's guest-token header and ensure the guest only sees authorized charts.
- [ ] Console: `window.__SUPERSET_JALALI__` contains the package version; no
  runtime or CSP errors with Talisman enabled. Check both module shapes if your
  build differs. Exercise keyboard navigation, Escape, outside click, popover
  callbacks, text inputs with Persian/Arabic/Latin digits, and overflow filter bars.
- [ ] In the dashboard's **filter-settings modal**, make an unsaved change and
  open the picker. Press Escape inside the popover: only the picker closes,
  `onClosePopover` fires once, focus returns to its trigger and the settings
  modal stays open with the unsaved change intact. Reopen and verify Tab and
  Shift+Tab cycle inside the picker and handled calendar arrow keys do not
  trigger parent-dialog actions.
- [ ] Check light and dark host themes, including an OS-driven dark theme if
  used. The trigger inherits the filter bar's colours and font; the popover
  uses the host theme font (for example Vazirmatn), readable text and distinct
  selected, today and Friday states. Change the host theme/font while the picker
  is closed and reopen to confirm it re-detects both; verify the centred panel
  in an overflowing filter bar too.
- [ ] Switch tabs with only از or only تا filled, with invalid dates and with
  reversed dates: the tab changes, partial inputs and errors clear, and no
  change is applied. Two valid dates remain in the draft. After arrow navigation,
  change month/year using the controls and confirm focus stays on the control;
  typing several characters into either date input keeps focus there.
- [ ] Temporarily rename the built bundle, reload with cache disabled, and confirm
  dashboards load with the stock picker. Health reports `ok: false`; discovery
  returns `[]`. Restore the bundle. Also simulate an HTTP bundle-import failure
  (rather than a missing local file) and check Superset releases loading.
- [ ] Set `JALALI = {"datefilter_enabled": False}`, restart, and fully reload.
  Discovery returns `[]` and the stock picker is back. Saved ranges remain valid.
  Health still reports `ok: true` when the bundle exists: it indicates asset
  availability, not whether the picker is enabled.
- [ ] On a verification instance, temporarily remove only the Jalali blueprint
  from `BLUEPRINTS` **after** calling `init_jalali(globals())`, leaving
  `DYNAMIC_PLUGINS=True` and the chained `FLASK_APP_MUTATOR` in place. Restart:
  startup logs an ERROR naming the missing `/dynamic-plugins/api/read` route,
  warning that dashboards will hang and instructing you to call
  `init_jalali(globals())` at the very end of `superset_config.py`; the check does
  not raise or repair the configuration. The package's health route is also
  absent when its blueprint is absent. Restore the configuration, restart and
  confirm the discovery route exists and that startup ERROR is gone. An existing
  mutator must still run first.
- [ ] Submit each rolling expression to `/api/v1/time_range/` through the normal
  authenticated Superset client. Confirm today, yesterday and 7/30/90 days
  evaluate correctly, including the final day. Superset's `today` follows the
  server timezone; recommend `TZ=Asia/Tehran`. Calendar presets are fixed ranges.
- [ ] With template processing explicitly enabled, run a PostgreSQL virtual
  dataset using both macros. Verify Nowruz, leap Esfand, all 13 columns, Saturday
  week starts, NULL dates, out-of-window dates and Persian digit formatting.
- [ ] With a UTC PostgreSQL session and `sql_timezone` unset, test `timestamptz`
  values around Tehran midnight using **both** macros with `tz='Asia/Tehran'`:
  `2025-03-20 20:29:59+00` yields `1403/12/30`, while
  `2025-03-20 20:30:00+00` and `2025-03-20 21:00:00+00` yield `1404/01/01`.
  Without `tz`, all three yield `1403/12/30` in that UTC session. Check the year,
  month, weekday and Saturday week-start columns as well. The join and columns
  must share the timezone; do not set it on plain `timestamp` or `date` columns.

Release only after all applicable checks pass. Update the README compatibility
status with the tested patch version and verification date.
