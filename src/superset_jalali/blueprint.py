"""Same-origin dynamic plugin discovery, immutable assets and the Jalali columns page."""
from importlib.metadata import version
import json
from pathlib import Path
import re
from urllib.parse import quote
from flask import Blueprint, abort, current_app, jsonify, redirect, request, send_from_directory
from flask_login import current_user
from . import superset_ops
from .columns import FIELDS, ColumnsError

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


def _columns_ui():
    if not current_app.config.get('JALALI', {}).get('columns_ui_enabled', True):
        abort(404)


def _user_error():
    """401/403 response for anonymous and guest users, else None."""
    if not current_user.is_authenticated:
        return jsonify(message='Login required'), 401
    if getattr(current_user, 'is_guest_user', False):
        return jsonify(message='Guest users cannot edit datasets'), 403
    return None


def _api(action):
    _columns_ui()
    if error := _user_error():
        return error
    try:
        return _nostore(jsonify(action(current_user._get_current_object())))
    except ColumnsError as error:
        return jsonify(message=str(error)), error.status


@blueprint.route('/superset-jalali/columns/')
def columns_page():
    _columns_ui()
    if not current_user.is_authenticated:
        return redirect(request.script_root + '/login/?next=' + quote(request.script_root + request.path))
    if getattr(current_user, 'is_guest_user', False):
        abort(403)
    # Superset's Talisman CSP only runs scripts that carry the request nonce.
    values = {'csp_nonce': getattr(request, 'csp_nonce', ''),
              'fields': json.dumps([field._asdict() for field in FIELDS], ensure_ascii=False).replace('<', '\\u003c')}
    html = re.sub(r'\{\{(\w+)\}\}', lambda match: values[match[1]], (STATIC_DIR / 'columns.html').read_text())
    return _nostore(current_app.response_class(html, mimetype='text/html'))


@blueprint.route('/superset-jalali/columns/columns.js')
def columns_script():
    _columns_ui()
    response = send_from_directory(STATIC_DIR, 'columns.js', mimetype='text/javascript', max_age=0)
    response.headers['Cache-Control'] = 'no-cache'
    return response


@blueprint.route('/superset-jalali/api/datasets')
def datasets():
    return _api(lambda user: superset_ops.editable_datasets())


@blueprint.route('/superset-jalali/api/datasets/<int:dataset_id>/jalali-columns', methods=['POST'])
def add_columns(dataset_id):
    def action(user):
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or not isinstance(body.get('column'), str):
            raise ColumnsError('The body must be a JSON object with a "column" name')
        return superset_ops.add_jalali_columns(dataset_id, body['column'], body.get('fields'),
                                               body.get('prefix', 'jalali_'), body.get('tz'), user=user)
    return _api(action)


@blueprint.route('/superset-jalali/api/datasets/<int:dataset_id>/jalali-columns', methods=['DELETE'])
def remove_columns(dataset_id):
    return _api(lambda user: superset_ops.remove_jalali_columns(dataset_id, request.args.get('column'), user=user))
