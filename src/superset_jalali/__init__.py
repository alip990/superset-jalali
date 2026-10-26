"""Configure Superset without rebuilding its frontend."""
import logging
from .blueprint import blueprint
from . import cli  # noqa: F401  adds `superset jalali ...` commands to the blueprint
from .calendar import g2j, j2g
from .macros import jalali, jalali_columns, jalali_join

JINJA_ADDONS = {'jalali': jalali, 'jalali_columns': jalali_columns, 'jalali_join': jalali_join, 'g2j': g2j, 'j2g': j2g}
__all__ = ['init_jalali', 'JINJA_ADDONS', 'blueprint', 'jalali', 'jalali_columns', 'jalali_join', 'g2j', 'j2g']


def _check_discovery_route(app):
    try:
        if (app.config.get('FEATURE_FLAGS') or {}).get('DYNAMIC_PLUGINS') and not any(
            rule.rule == '/dynamic-plugins/api/read' for rule in app.url_map.iter_rules()
        ):
            app.logger.error('superset-jalali: DYNAMIC_PLUGINS is enabled but /dynamic-plugins/api/read is missing; dashboards will hang. BLUEPRINTS may have been overwritten after initialization. Call init_jalali(globals()) at the very end of superset_config.py.')
    except Exception:
        app.logger.exception('superset-jalali: startup discovery route check failed')


def _add_menu_link(app):
    """Settings → Data → Jalali columns; Superset 6.1 builds its React menu from appbuilder.menu."""
    if not app.config.get('JALALI', {}).get('columns_ui_enabled', True):
        return
    try:
        from flask_babel import lazy_gettext
        from superset.extensions import appbuilder
        root = app.config.get('APPLICATION_ROOT', '/').rstrip('/')
        appbuilder.add_link('Jalali columns', href=root + '/superset-jalali/columns/', category='Data',
                            category_label=lazy_gettext('Data'))
    except Exception:
        app.logger.exception('superset-jalali: could not add the Jalali columns menu link')


def init_jalali(config_globals, *, datefilter=True, macros=True):
    """Merge plugin settings into superset_config.py globals; safe to call again."""
    if datefilter or macros:
        # The blueprint serves the picker and the Jalali columns page.
        blueprints = list(config_globals.get('BLUEPRINTS') or [])
        if blueprint not in blueprints:
            blueprints.append(blueprint)
        config_globals['BLUEPRINTS'] = blueprints
        existing = config_globals.get('FLASK_APP_MUTATOR')
        if not getattr(existing, '_superset_jalali_mutator', False):
            def mutator(app):
                if existing is not None:
                    existing(app)
                if datefilter:
                    _check_discovery_route(app)
                if macros:
                    _add_menu_link(app)
            mutator._superset_jalali_mutator = True
            config_globals['FLASK_APP_MUTATOR'] = mutator
    if datefilter:
        config_globals['FEATURE_FLAGS'] = {**config_globals.get('FEATURE_FLAGS', {}), 'DYNAMIC_PLUGINS': True}
    elif macros:
        config_globals['JALALI'] = {**config_globals.get('JALALI', {}), 'datefilter_enabled': False}
    if macros:
        config_globals['JINJA_CONTEXT_ADDONS'] = {**JINJA_ADDONS, **config_globals.get('JINJA_CONTEXT_ADDONS', {})}
        logging.getLogger(__name__).warning('superset-jalali: Jinja macros require FEATURE_FLAGS["ENABLE_TEMPLATE_PROCESSING"] = True; it is not enabled automatically')
