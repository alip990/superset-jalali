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
- [ ] Tick «با ساعت», enter 1403/07/01 ۰۸:۰۰ to 1403/07/01 17:00 and apply on
  a `timestamp` column: **View query** has `>= '2024-09-22 08:00:00'` and
  `< '2024-09-22 17:00:00'`. Equal start and end times show a Persian error.
  Tab and Shift+Tab cycle through the time inputs and the checkbox without
  leaving the popover; reopening shows the times; switching to «پیشرفته»
  shows the same expression. «۱ ساعت اخیر» and «۲۴ ساعت اخیر» apply.
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
  dataset using both macros. Verify Nowruz, leap Esfand, all 12 columns, Saturday
  week starts (`jalali_week_start_date` is Jalali; 1403/01/01 → 1402/12/26), NULL dates, out-of-window dates and Persian digit formatting.
- [ ] `jalali_columns('t.d', fields=['weekday_num', 'month_name'])` in a virtual
  dataset adds exactly those two columns; `fields=['nope']` fails with the list
  of valid names.
- [ ] With a UTC PostgreSQL session and `sql_timezone` unset, test `timestamptz`
  values around Tehran midnight using **both** macros with `tz='Asia/Tehran'`:
  `2025-03-20 20:29:59+00` yields `1403/12/30`, while
  `2025-03-20 20:30:00+00` and `2025-03-20 21:00:00+00` yield `1404/01/01`.
  Without `tz`, all three yield `1403/12/30` in that UTC session. Check the year,
  month, weekday and Saturday week-start columns as well. The join and columns
  must share the timezone; do not set it on plain `timestamp` or `date` columns.

## Jalali dates in charts

- [ ] ECharts Heatmap, X `hour_of_day` (calculated `EXTRACT(HOUR FROM ...)`),
  Y `jalali_date`, both axes *Axis ascending*: rows in Jalali date order.
- [ ] Heatmap X `jalali_weekday_num`, Y `jalali_month_num`: Saturday (1) first.
- [ ] Heatmap on the real date column with Time format `jalali_date`: Jalali
  labels. Same for a Table.
- [ ] `JALALI["jalali_smart_date"] = True`, restart: the discovery response's
  `bundle_url` ends in `?smart_date=1`; an untouched time-series chart shows
  Jalali axis labels and tooltips, on a dashboard and an embedded dashboard.
- [ ] With no setting (`jalali_calendar_heatmap` is on by default) an existing
  Calendar Heatmap (domain month, subdomain day) shows Jalali month cards, right
  to left, with weekday letters, a gradient legend and a ring on today, on a
  dashboard, an embedded dashboard and in Explore, with Jalali tooltips; domain
  year too. Domain week or subdomain week shows Superset's original chart.
  `JALALI["jalali_calendar_heatmap"] = False`, restart: the discovery response's
  `bundle_url` ends in `?cal_heatmap=0` and the chart is Superset's Gregorian one.
- [ ] Explore with cache disabled: if a chart first shows `jalali_date`
  literally, Run fixes it (documented load-order limitation).

## Jalali calculated columns

Use a PostgreSQL table with a `timestamp` column, with
`ENABLE_TEMPLATE_PROCESSING` on and `superset init` run after installing.

- [ ] **Physical dataset.** Datasets → + Dataset → pick the table.
- [ ] **Add.** Open **Settings → Data → Jalali columns** (or
  `/superset-jalali/columns/`), choose the dataset and date column, click
  «افزودن ستون‌های جلالی». Edit dataset → Calculated columns shows 12
  columns with Persian labels (`week_start` without the `jalali_` prefix); no
  browser console or CSP errors.
- [ ] **Upgrade.** On a dataset that has columns from an older version, add the
  columns again: the result lists `removed` columns (`jalali_month`,
  `jalali_month_label`, `jalali_season_key`, `jalali_weekday_key`,
  `jalali_week_start`) and the dataset keeps `jalali_weekday_num` (now 1 for
  Saturday) and the new `jalali_week_of_year` and `week_start`.
- [ ] **Weekly chart.** Bar chart on `week_start`, sorted ascending: every bar's
  label is its Saturday; there are no labels like `Thu 13` between bars.
- [ ] **Explore.** Bar chart, X-axis `jalali_month_name`, metric `COUNT(*)`,
  sorted by `jalali_month_num`. Values match the same chart on a virtual dataset of
  the same table built with `jalali_columns` + `jalali_join`; the generated SQL
  has no join and filters the real date column.
- [ ] **Dashboard.** Add the chart to a dashboard with a Jalali Time range
  filter on the real date column; picking a Jalali month filters it correctly.
- [ ] **Embedded.** An embedded dashboard (guest token) on that dataset renders
  the calculated columns.
- [ ] **Permissions.** A non-owner Gamma (or Alpha) user gets 403 from add and
  remove and sees no datasets on the page; a guest token cannot open the page
  or its API (403).
- [ ] **Conflict.** Create a manual calculated column `jalali_year` first; the
  page reports a 409 listing it and changes nothing.
- [ ] **Remove.** «حذف ستون‌های جلالی» removes only the plugin's columns; the
  manual column stays.
- [ ] **CLI.** `superset jalali add-columns --dataset <schema.table> --column <col>`
  and `superset jalali remove-columns ...` on the same dataset print the
  created/updated/removed names.
- [ ] **Switches.** `JALALI["columns_ui_enabled"] = False` returns 404 for the
  page and API and hides the menu link; with template processing off, adding
  is refused with a message.

Release only after all applicable checks pass. Update the README compatibility
status with the tested patch version and verification date.
