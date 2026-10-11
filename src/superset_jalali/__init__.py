"""Configure Superset without rebuilding its frontend."""
import logging
from .blueprint import blueprint
from .calendar import g2j, j2g
from .macros import jalali_columns, jalali_join

JINJA_ADDONS = {'jalali_columns': jalali_columns, 'jalali_join': jalali_join, 'g2j': g2j, 'j2g': j2g}
__all__ = ['init_jalali', 'JINJA_ADDONS', 'blueprint', 'g2j', 'j2g']


def _check_discovery_route(app):
    try:
        if (app.config.get('FEATURE_FLAGS') or {}).get('DYNAMIC_PLUGINS') and not any(
            rule.rule == '/dynamic-plugins/api/read' for rule in app.url_map.iter_rules()
        ):
            app.logger.error('superset-jalali: DYNAMIC_PLUGINS is enabled but /dynamic-plugins/api/read is missing; dashboards will hang. BLUEPRINTS may have been overwritten after initialization. Call init_jalali(globals()) at the very end of superset_config.py.')
    except Exception:
        app.logger.exception('superset-jalali: startup discovery route check failed')


def init_jalali(config_globals, *, datefilter=True, macros=True):
    """Merge plugin settings into superset_config.py globals; safe to call again."""
    if datefilter:
        blueprints = list(config_globals.get('BLUEPRINTS') or [])
        if blueprint not in blueprints:
            blueprints.append(blueprint)
        config_globals['BLUEPRINTS'] = blueprints
        config_globals['FEATURE_FLAGS'] = {**config_globals.get('FEATURE_FLAGS', {}), 'DYNAMIC_PLUGINS': True}
        existing = config_globals.get('FLASK_APP_MUTATOR')
        if not getattr(existing, '_superset_jalali_mutator', False):
            def mutator(app):
                if existing is not None:
                    existing(app)
                _check_discovery_route(app)
            mutator._superset_jalali_mutator = True
            config_globals['FLASK_APP_MUTATOR'] = mutator
    if macros:
        config_globals['JINJA_CONTEXT_ADDONS'] = {**JINJA_ADDONS, **config_globals.get('JINJA_CONTEXT_ADDONS', {})}
        logging.getLogger(__name__).warning('superset-jalali: Jinja macros require FEATURE_FLAGS["ENABLE_TEMPLATE_PROCESSING"] = True; it is not enabled automatically')
