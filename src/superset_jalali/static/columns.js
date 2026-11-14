'use strict';
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var csrf = null;
  var fields = JSON.parse($('field-list').textContent);
  var datasets = [];

  function show(kind, text) {
    $('result').className = kind;
    $('result').textContent = text;
  }

  function json(response) {
    return response.json().catch(function () { return {}; }).then(function (data) {
      if (!response.ok) throw new Error(data.message || ('خطای ' + response.status));
      return data;
    });
  }

  function token() {
    // Superset's own token for the session cookie; sent back as X-CSRFToken on POST and DELETE.
    if (csrf) return Promise.resolve(csrf);
    return fetch('../../api/v1/security/csrf_token/', {credentials: 'same-origin', headers: {'Accept': 'application/json'}})
      .then(json).then(function (data) { csrf = data.result; return csrf; });
  }

  function request(method, url, body) {
    return (method === 'GET' ? Promise.resolve(null) : token()).then(function (csrfToken) {
      var options = {method: method, credentials: 'same-origin', headers: {'Accept': 'application/json'}};
      if (csrfToken) options.headers['X-CSRFToken'] = csrfToken;
      if (body !== undefined) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
      }
      return fetch(url, options).then(json);
    });
  }

  function option(value, text) {
    var element = document.createElement('option');
    element.value = value;
    element.textContent = text;
    return element;
  }

  function selected() {
    return datasets.filter(function (d) { return String(d.id) === $('dataset').value; })[0];
  }

  function showDataset() {
    var dataset = selected();
    var column = $('column');
    column.replaceChildren();
    (dataset ? dataset.temporal_columns : []).forEach(function (name) { column.appendChild(option(name, name)); });
    if (dataset && !dataset.temporal_columns.length) column.appendChild(option('', 'ستون تاریخ ندارد'));
    $('existing').textContent = dataset && dataset.jalali_columns.length
      ? 'ستون‌های جلالی موجود: ' + dataset.jalali_columns.join('، ') : '';
    var ready = Boolean(dataset && dataset.temporal_columns.length);
    $('add').disabled = $('remove').disabled = !ready;
  }

  function load(keep) {
    return request('GET', '../api/datasets').then(function (data) {
      datasets = data;
      var select = $('dataset');
      var previous = keep ? select.value : '';
      select.replaceChildren(option('', datasets.length ? 'یک دیتاست انتخاب کنید' : 'دیتاست PostgreSQL قابل ویرایشی نیست'));
      datasets.forEach(function (d) {
        select.appendChild(option(d.id, (d.schema ? d.schema + '.' : '') + d.name + ' — ' + d.database));
      });
      select.value = previous;
      var column = $('column').value;
      showDataset();
      if (keep) $('column').value = column;
    });
  }

  function names(list) { return list.length ? list.join('، ') : '—'; }

  function add() {
    var dataset = selected();
    var chosen = fields.filter(function (f) { return $('field-' + f.name).checked; }).map(function (f) { return f.name; });
    if (!chosen.length) return show('error', 'دست‌کم یک ستون را انتخاب کنید.');
    show('ok', 'در حال افزودن…');
    request('POST', '../api/datasets/' + dataset.id + '/jalali-columns', {
      column: $('column').value, fields: chosen, prefix: $('prefix').value, tz: $('tz').value || null
    }).then(function (data) {
      show('ok', 'ساخته شد: ' + names(data.created) + '\nبه‌روز شد: ' + names(data.updated) +
        '\n\nستون‌ها اضافه شد. در Explore از ستون‌های jalali_* برای گروه‌بندی استفاده کنید؛ فیلتر تاریخ را روی ستون اصلی بگذارید.');
      return load(true);
    }).catch(function (error) { show('error', error.message); });
  }

  function remove() {
    var dataset = selected();
    var column = $('column').value;
    if (!window.confirm('ستون‌های جلالیِ ساخته‌شده از «' + column + '» حذف شوند؟')) return;
    request('DELETE', '../api/datasets/' + dataset.id + '/jalali-columns?column=' + encodeURIComponent(column))
      .then(function (data) {
        show('ok', 'حذف شد: ' + names(data.removed));
        return load(true);
      }).catch(function (error) { show('error', error.message); });
  }

  fields.forEach(function (f) {
    var label = document.createElement('label');
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.id = 'field-' + f.name;
    box.checked = true;
    var name = document.createElement('span');
    name.className = 'ltr hint';
    name.textContent = f.name;
    label.append(box, f.label + ' ', name);
    $('fields').appendChild(label);
  });
  $('dataset').addEventListener('change', showDataset);
  $('add').addEventListener('click', add);
  $('remove').addEventListener('click', remove);
  load(false).catch(function (error) { show('error', error.message); });
}());
