"""Configure Superset without rebuilding its frontend."""
import logging
from .blueprint import blueprint
from .calendar import g2j, j2g
from .macros import jalali_columns, jalali_join

JINJA_ADDONS = {'jalali_columns': jalali_columns, 'jalali_join': jalali_join, 'g2j': g2j, 'j2g': j2g}
__all__ = ['init_jalali', 'JINJA_ADDONS', 'blueprint', 'g2j', 'j2g']


def init_jalali(config_globals, *, datefilter=True, macros=True):
    """Merge plugin settings into superset_config.py globals; safe to call again."""
    if datefilter:
        blueprints = list(config_globals.get('BLUEPRINTS') or [])
        if blueprint not in blueprints:
            blueprints.append(blueprint)
        config_globals['BLUEPRINTS'] = blueprints
        config_globals['FEATURE_FLAGS'] = {**config_globals.get('FEATURE_FLAGS', {}), 'DYNAMIC_PLUGINS': True}
    if macros:
        config_globals['JINJA_CONTEXT_ADDONS'] = {**JINJA_ADDONS, **config_globals.get('JINJA_CONTEXT_ADDONS', {})}
        logging.getLogger(__name__).warning('superset-jalali: Jinja macros require FEATURE_FLAGS["ENABLE_TEMPLATE_PROCESSING"] = True; it is not enabled automatically')
