from flask import Flask
from flask_login import LoginManager, UserMixin
from flask_wtf.csrf import CSRFProtect, generate_csrf
import pytest
from superset_jalali import superset_ops
from superset_jalali.blueprint import blueprint
from superset_jalali.columns import ColumnsError, ConflictError

URL = '/superset-jalali/api/datasets/7/jalali-columns'


class User(UserMixin):
    def __init__(self, name):
        self.id = name
        self.is_guest_user = name == 'guest'


@pytest.fixture
def app():
    app = Flask(__name__)
    app.secret_key = 'test'
    CSRFProtect(app)
    LoginManager(app).request_loader(lambda req: User(req.headers['X-Test-User']) if 'X-Test-User' in req.headers else None)
    app.register_blueprint(blueprint)
    # Stands in for Superset's /api/v1/security/csrf_token/.
    app.add_url_rule('/api/v1/security/csrf_token/', 'csrf_token', lambda: {'result': generate_csrf()})
    return app


@pytest.fixture
def calls(monkeypatch):
    calls = []
    def add(dataset_id, column, fields, prefix, tz, *, user):
        calls.append(('add', dataset_id, column, fields, prefix, tz, user.id))
        if column == 'taken':
            raise ConflictError('Columns already exist and were not created by superset-jalali: jalali_year')
        if column == 'other':
            raise superset_ops.ForbiddenError('You are not allowed to edit dataset t')
        return {'created': ['jalali_year'], 'updated': []}
    def remove(dataset_id, column, *, user):
        calls.append(('remove', dataset_id, column, user.id))
        return {'removed': ['jalali_year']}
    monkeypatch.setattr(superset_ops, 'add_jalali_columns', add)
    monkeypatch.setattr(superset_ops, 'remove_jalali_columns', remove)
    monkeypatch.setattr(superset_ops, 'editable_datasets', lambda: [{'id': 7, 'name': 't'}])
    return calls


def _client(app, user='alice'):
    client = app.test_client()
    client.environ_base['HTTP_X_TEST_USER'] = user
    assert client.get('/superset-jalali/columns/').status_code == 200
    return client, client.get('/api/v1/security/csrf_token/').json['result']


def test_page_renders_token_fields_and_nonce(app):
    client, token = _client(app)
    page = client.get('/superset-jalali/columns/', environ_overrides={'SCRIPT_NAME': '/analytics'})
    assert page.headers['Cache-Control'] == 'no-store' and page.mimetype == 'text/html'
    assert '{{' not in page.text
    assert '"name": "season_key", "type": "VARCHAR", "label": "فصل جلالی (کلید)"' in page.text
    assert 'افزودن ستون‌های جلالی' in page.text and 'حذف ستون‌های جلالی' in page.text
    assert 'src="columns.js" nonce=""' in page.text
    script = client.get('/superset-jalali/columns/columns.js')
    assert script.mimetype == 'text/javascript' and 'X-CSRFToken' in script.text
    assert "'../../api/v1/security/csrf_token/'" in script.text


def test_anonymous_and_guest_users(app, calls):
    client = app.test_client()
    page = client.get('/superset-jalali/columns/')
    assert page.status_code == 302 and page.headers['Location'].endswith('/login/?next=/superset-jalali/columns/')
    assert client.get('/superset-jalali/api/datasets').status_code == 401
    assert client.get('/superset-jalali/api/datasets').json == {'message': 'Login required'}
    guest = app.test_client()
    guest.environ_base['HTTP_X_TEST_USER'] = 'guest'
    assert guest.get('/superset-jalali/columns/').status_code == 403
    response = guest.get('/superset-jalali/api/datasets')
    assert response.status_code == 403 and response.json['message']
    assert calls == []


def test_writes_without_csrf_token_are_rejected(app, calls):
    client, token = _client(app)
    assert client.post(URL, json={'column': 'occurred_at'}).status_code == 400
    assert client.delete(URL + '?column=occurred_at').status_code == 400
    assert client.post(URL, json={'column': 'occurred_at'}, headers={'X-CSRFToken': 'forged'}).status_code == 400
    assert calls == []


def test_happy_paths(app, calls):
    client, token = _client(app)
    headers = {'X-CSRFToken': token}
    datasets = client.get('/superset-jalali/api/datasets')
    assert datasets.json == [{'id': 7, 'name': 't'}] and datasets.headers['Cache-Control'] == 'no-store'
    response = client.post(URL, json={'column': 'occurred_at', 'fields': ['year'], 'tz': 'Asia/Tehran'}, headers=headers)
    assert response.status_code == 200 and response.json == {'created': ['jalali_year'], 'updated': []}
    response = client.delete(URL + '?column=occurred_at', headers=headers)
    assert response.json == {'removed': ['jalali_year']}
    client.delete(URL, headers=headers)
    assert calls == [('add', 7, 'occurred_at', ['year'], 'jalali_', 'Asia/Tehran', 'alice'),
                     ('remove', 7, 'occurred_at', 'alice'), ('remove', 7, None, 'alice')]


@pytest.mark.parametrize('body,status,message', [
    ({'column': 'taken'}, 409, 'jalali_year'),
    ({'column': 'other'}, 403, 'not allowed'),
    ({'fields': ['year']}, 400, '"column"'),
    ([], 400, '"column"'),
])
def test_errors_are_json(app, calls, body, status, message):
    client, token = _client(app)
    response = client.post(URL, json=body, headers={'X-CSRFToken': token})
    assert response.status_code == status and message in response.json['message']


def test_operation_errors_keep_their_status(app, monkeypatch):
    def missing(*args, **kwargs):
        raise superset_ops.NotFoundError('Dataset 7 not found')
    def off():
        raise ColumnsError('ENABLE_TEMPLATE_PROCESSING is off')
    monkeypatch.setattr(superset_ops, 'remove_jalali_columns', missing)
    monkeypatch.setattr(superset_ops, 'editable_datasets', off)
    client, token = _client(app)
    response = client.delete(URL, headers={'X-CSRFToken': token})
    assert response.status_code == 404 and response.json == {'message': 'Dataset 7 not found'}
    assert client.get('/superset-jalali/api/datasets').status_code == 400


def test_columns_ui_can_be_disabled(app, calls):
    client, token = _client(app)
    app.config['JALALI'] = {'columns_ui_enabled': False, 'datefilter_enabled': True}
    for response in [client.get('/superset-jalali/columns/'), client.get('/superset-jalali/columns/columns.js'),
                     client.get('/superset-jalali/api/datasets'), client.delete(URL, headers={'X-CSRFToken': token}),
                     client.post(URL, json={'column': 'occurred_at'}, headers={'X-CSRFToken': token})]:
        assert response.status_code == 404
    assert calls == []
    app.config['JALALI'] = {'datefilter_enabled': False}
    assert client.get('/superset-jalali/api/datasets').status_code == 200  # The picker switch does not apply.
