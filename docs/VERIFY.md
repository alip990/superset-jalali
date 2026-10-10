# Verify on real Superset before releasing or upgrading

Use an existing Superset 6.1.x with the built package installed and
`init_jalali(globals())`. This repository deliberately contains no demo stack,
sample data, browser automation, or host application. Unit tests and source
inspection cannot establish these runtime results.

Record Superset version, plugin version, date, browser, server/database timezones,
URL prefix, CSP settings, and the result of each check. Initial runtime
verification is **pending**; do not label a release runtime-verified until this
checklist has been completed.

- [ ] `/superset-jalali/health` returns `ok: true` with a hashed bundle. Logged-in
  `GET /dynamic-plugins/api/read` returns 200 and one plugin; logged-out requests
  return 200 and `{"result": []}`. Repeat under `APPLICATION_ROOT` if used.
- [ ] A dashboard Time range native filter shows the Persian RTL picker, with
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
- [ ] Temporarily rename the built bundle, reload with cache disabled, and confirm
  dashboards load with the stock picker. Health reports `ok: false`; discovery
  returns `[]`. Restore the bundle. Also simulate an HTTP bundle-import failure
  (rather than a missing local file) and check Superset releases loading.
- [ ] Set `JALALI = {"datefilter_enabled": False}`, restart, and fully reload.
  Discovery returns `[]` and the stock picker is back. Saved ranges remain valid.
- [ ] Submit each rolling expression to `/api/v1/time_range/` through the normal
  authenticated Superset client. Confirm today, yesterday and 7/30/90 days
  evaluate correctly, including the final day. Superset's `today` follows the
  server timezone; recommend `TZ=Asia/Tehran`. Calendar presets are fixed ranges.
- [ ] With template processing explicitly enabled, run a PostgreSQL virtual
  dataset using both macros. Verify Nowruz, leap Esfand, all 13 columns, Saturday
  week starts, NULL dates, out-of-window dates and Persian digit formatting.

Release only after all applicable checks pass. Update the README compatibility
status with the tested patch version and verification date.
