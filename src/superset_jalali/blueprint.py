"""Same-origin dynamic plugin discovery and immutable assets."""
from importlib.metadata import version
import json
from pathlib import Path
import re
from flask import Blueprint, current_app, jsonify, request, send_from_directory
from flask_login import current_user

STATIC_DIR = Path(__file__).with_name('static')
blueprint = Blueprint('superset_jalali', __name__)


def _manifest_bundle():
    name = json.loads((STATIC_DIR / 'manifest.json').read_text())['bundle']
    if not isinstance(name, str) or not re.fullmatch(r'jalali-[A-Za-z0-9_-]+\.js', name):
        raise ValueError('Invalid bundle manifest')
    if not (STATIC_DIR / name).is_file():
        raise FileNotFoundError('Jalali bundle missing; run npm run build before packaging')
    return name


def _bundle_url():
    root = request.script_root or current_app.config.get('APPLICATION_ROOT', '')
    return root.rstrip('/') + '/superset-jalali/static/' + _manifest_bundle()


def _enabled():
    return current_app.config.get('JALALI', {}).get('datefilter_enabled', True)


def _nostore(response):
    response.headers['Cache-Control'] = 'no-store'
    return response


def plugin_list():
    try:
        if not current_user.is_authenticated or not _enabled():
            return _nostore(jsonify(result=[]))
        return _nostore(jsonify(result=[dict(id=1, name='Jalali date filter', key='superset-jalali', bundle_url=_bundle_url())]))
    except Exception:
        current_app.logger.exception('superset-jalali: plugin list failed')
        return _nostore(jsonify(result=[]))


@blueprint.record
def _register_discovery(state):
    if any(rule.rule == '/dynamic-plugins/api/read' for rule in state.app.url_map.iter_rules()):
        state.app.logger.warning('superset-jalali: existing dynamic plugin discovery route preserved; configure it to include this bundle')
    else:
        state.add_url_rule('/dynamic-plugins/api/read', 'plugin_list', plugin_list)


@blueprint.route('/superset-jalali/static/<path:filename>')
def bundle(filename):
    if not re.fullmatch(r'jalali-[A-Za-z0-9_-]+\.js(?:\.map)?', filename):
        from flask import abort
        abort(404)
    response = send_from_directory(STATIC_DIR, filename, mimetype='text/javascript' if filename.endswith('.js') else 'application/json', max_age=31536000)
    response.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    return response


@blueprint.route('/superset-jalali/health')
def health():
    try:
        name = _manifest_bundle()
        ok = True
    except Exception:
        name, ok = None, False
    return _nostore(jsonify(ok=ok, version=version('superset-jalali'), bundle=name))
