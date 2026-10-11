import importlib
import json
import logging
from flask import Flask
from flask_login import LoginManager, UserMixin
import pytest
from superset_jalali import init_jalali
bp = importlib.import_module('superset_jalali.blueprint')

class User(UserMixin):
    id = '1'

@pytest.fixture
def app(tmp_path, monkeypatch):
    (tmp_path / 'manifest.json').write_text(json.dumps({'bundle': 'jalali-12345678.js'}))
    (tmp_path / 'jalali-12345678.js').write_text('export {};')
    monkeypatch.setattr(bp, 'STATIC_DIR', tmp_path)
    app = Flask(__name__)
    app.secret_key = 'test'
    lm = LoginManager(app)
    lm.user_loader(lambda uid: User())
    lm.request_loader(lambda req: User() if req.headers.get('X-Test-Guest') else None)
    app.register_blueprint(bp.blueprint)
    return app


def test_anonymous_guest_and_cache(app):
    client = app.test_client()
    response = client.get('/dynamic-plugins/api/read')
    assert response.status_code == 200 and response.json == {'result': []}
    assert response.headers['Cache-Control'] == 'no-store'
    response = client.get('/dynamic-plugins/api/read', headers={'X-Test-Guest':'yes'})
    assert response.json['result'][0]['bundle_url'] == '/superset-jalali/static/jalali-12345678.js'
    app.config['JALALI'] = {'datefilter_enabled': False}
    assert client.get('/dynamic-plugins/api/read', headers={'X-Test-Guest':'yes'}).json == {'result': []}


def test_internal_error_and_missing_bundle(app, monkeypatch):
    def fail(): raise RuntimeError('test')
    monkeypatch.setattr(bp, '_bundle_url', fail)
    response = app.test_client().get('/dynamic-plugins/api/read', headers={'X-Test-Guest':'yes'})
    assert response.status_code == 200 and response.json == {'result': []}


def test_root_health_and_static(app):
    app.config['APPLICATION_ROOT'] = '/analytics'
    client = app.test_client()
    result = client.get('/dynamic-plugins/api/read', headers={'X-Test-Guest':'yes'}).json
    assert result['result'][0]['bundle_url'] == '/analytics/superset-jalali/static/jalali-12345678.js'
    assert client.get('/superset-jalali/health').json['ok']
    response = client.get('/superset-jalali/static/jalali-12345678.js')
    assert response.mimetype == 'text/javascript'
    assert 'immutable' in response.headers['Cache-Control']
    assert client.get('/superset-jalali/static/manifest.json').status_code == 404
    assert client.get('/superset-jalali/static/../blueprint.py').status_code == 404
    (bp.STATIC_DIR / 'jalali-12345678.js').unlink()
    assert client.get('/dynamic-plugins/api/read', headers={'X-Test-Guest':'yes'}).json == {'result': []}
    assert not client.get('/superset-jalali/health').json['ok']


def test_existing_route_preserved():
    app = Flask(__name__)
    app.add_url_rule('/dynamic-plugins/api/read', 'existing', lambda: 'existing')
    app.register_blueprint(bp.blueprint)
    assert app.test_client().get('/dynamic-plugins/api/read').text == 'existing'
    assert len([r for r in app.url_map.iter_rules() if r.rule == '/dynamic-plugins/api/read']) == 1


def test_init_idempotent(caplog):
    config = {'FEATURE_FLAGS': {'OTHER':True}, 'JINJA_CONTEXT_ADDONS': {'other':42}, 'BLUEPRINTS': ()}
    init_jalali(config)
    init_jalali(config)
    assert config['BLUEPRINTS'] == [bp.blueprint]
    assert config['FEATURE_FLAGS'] == {'OTHER':True, 'DYNAMIC_PLUGINS':True}
    assert config['JINJA_CONTEXT_ADDONS']['other'] == 42
    config = {}
    init_jalali(config, datefilter=False, macros=False)
    assert 'FEATURE_FLAGS' not in config
    assert 'BLUEPRINTS' not in config
    assert 'FLASK_APP_MUTATOR' not in config


def test_mutator_chaining_is_idempotent(caplog):
    calls = []
    def existing(app):
        calls.append(app)
        app.config['FEATURE_FLAGS'] = {'DYNAMIC_PLUGINS': True}
    config = {'FLASK_APP_MUTATOR': existing}
    init_jalali(config, macros=False)
    mutator = config['FLASK_APP_MUTATOR']
    assert mutator is not existing
    init_jalali(config, macros=False)
    assert config['FLASK_APP_MUTATOR'] is mutator
    app = Flask(__name__)
    app.config['FEATURE_FLAGS'] = {'DYNAMIC_PLUGINS': False}
    with caplog.at_level(logging.ERROR):
        mutator(app)
    assert calls == [app]
    assert len(caplog.records) == 1  # The check runs after the existing mutator.


def test_mutator_logs_overwritten_blueprints(caplog):
    config = {}
    init_jalali(config, macros=False)
    config['BLUEPRINTS'] = []
    config['FEATURE_FLAGS'] = {'DYNAMIC_PLUGINS': True}
    app = Flask(__name__)
    app.config.update(config)
    with caplog.at_level(logging.ERROR):
        config['FLASK_APP_MUTATOR'](app)
    assert len(caplog.records) == 1
    record = caplog.records[0]
    assert record.levelno == logging.ERROR
    message = record.getMessage()
    for text in ('DYNAMIC_PLUGINS', '/dynamic-plugins/api/read', 'dashboards', 'hang',
                 'init_jalali(globals())', 'end', 'superset_config.py'):
        assert text in message


def test_mutator_accepts_route_added_by_existing_mutator(caplog):
    def existing(app):
        app.add_url_rule('/dynamic-plugins/api/read', 'existing', lambda: 'existing')
    config = {'FLASK_APP_MUTATOR': existing}
    init_jalali(config, macros=False)
    app = Flask(__name__)
    app.config.update(config)
    with caplog.at_level(logging.ERROR):
        config['FLASK_APP_MUTATOR'](app)
    assert not caplog.records


@pytest.mark.parametrize('flags', [{}, {'DYNAMIC_PLUGINS': False}])
def test_mutator_ignores_disabled_plugins(flags, caplog):
    config = {}
    init_jalali(config, macros=False)
    app = Flask(__name__)
    app.config['FEATURE_FLAGS'] = flags
    with caplog.at_level(logging.ERROR):
        config['FLASK_APP_MUTATOR'](app)
    assert not caplog.records


def test_mutator_check_never_raises(monkeypatch, caplog):
    config = {}
    init_jalali(config, macros=False)
    app = Flask(__name__)
    app.config.update(config)
    def fail(): raise RuntimeError('test')
    monkeypatch.setattr(app.url_map, 'iter_rules', fail)
    with caplog.at_level(logging.ERROR):
        config['FLASK_APP_MUTATOR'](app)
    assert len(caplog.records) == 1
    assert caplog.records[0].levelno == logging.ERROR


def test_init_preserves_user_helpers():
    existing = lambda: 'user'
    config = {'JINJA_CONTEXT_ADDONS': {'jalali_join': existing}, 'JALALI': {'datefilter_enabled': False}}
    init_jalali(config)
    assert config['JINJA_CONTEXT_ADDONS']['jalali_join'] is existing
    assert config['JALALI'] == {'datefilter_enabled': False}


def test_invalid_manifest_and_script_root(app):
    client = app.test_client()
    response = client.get('/dynamic-plugins/api/read', headers={'X-Test-Guest':'yes'}, environ_overrides={'SCRIPT_NAME':'/prefix'})
    assert response.json['result'][0]['bundle_url'].startswith('/prefix/')
    (bp.STATIC_DIR / 'manifest.json').write_text('{broken')
    assert client.get('/dynamic-plugins/api/read', headers={'X-Test-Guest':'yes'}).json == {'result': []}
    (bp.STATIC_DIR / 'manifest.json').write_text(json.dumps({'bundle':'../outside.js'}))
    assert client.get('/dynamic-plugins/api/read', headers={'X-Test-Guest':'yes'}).json == {'result': []}
