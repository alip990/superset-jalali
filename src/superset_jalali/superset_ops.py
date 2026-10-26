"""Create and remove the Jalali calculated columns on Superset datasets; Superset is imported lazily."""
from .columns import ColumnsError, is_temporal, plan_columns, remove_plan


class ForbiddenError(ColumnsError):
    status = 403


class NotFoundError(ColumnsError):
    status = 404


def _column(column):
    return dict(id=column.id, column_name=column.column_name, type=column.type, is_dttm=column.is_dttm,
                expression=column.expression, extra=column.extra)


def _can_edit(dataset):
    from superset import security_manager
    from superset.exceptions import SupersetSecurityException
    if security_manager.is_guest_user() or not security_manager.can_access('can_write', 'Dataset'):
        return False
    try:
        security_manager.raise_for_ownership(dataset)
    except SupersetSecurityException:
        return False
    return True


def _dataset(dataset_id):
    from superset import db, is_feature_enabled
    from superset.connectors.sqla.models import SqlaTable
    if not is_feature_enabled('ENABLE_TEMPLATE_PROCESSING'):
        raise ColumnsError('FEATURE_FLAGS["ENABLE_TEMPLATE_PROCESSING"] is off: the Jalali columns would not render. '
                           'Enable it in superset_config.py and restart Superset.')
    dataset = db.session.get(SqlaTable, dataset_id)
    if dataset is None:
        raise NotFoundError(f'Dataset {dataset_id} not found')
    if not _can_edit(dataset):
        raise ForbiddenError(f'You are not allowed to edit dataset {dataset.table_name}')
    if dataset.database.backend != 'postgresql':
        raise ColumnsError(f'Dataset {dataset.table_name} is on {dataset.database.backend}; only PostgreSQL is supported')
    return dataset


def _update(dataset, columns):
    from superset.commands.dataset.exceptions import DatasetForbiddenError, DatasetInvalidError
    from superset.commands.dataset.update import UpdateDatasetCommand
    try:
        UpdateDatasetCommand(dataset.id, {'columns': columns}).run()
    except DatasetForbiddenError as error:
        raise ForbiddenError(str(error)) from None
    except DatasetInvalidError as error:
        raise ColumnsError('; '.join(str(message) for message in error.normalized_messages().values())) from None


def editable_datasets():
    """PostgreSQL datasets the current user may edit, with their date and Jalali columns."""
    from superset import db
    from superset.connectors.sqla.models import SqlaTable
    result = []
    for dataset in db.session.query(SqlaTable).order_by(SqlaTable.table_name):
        if dataset.database.backend != 'postgresql' or not _can_edit(dataset):
            continue
        columns = [_column(column) for column in dataset.columns]
        result.append(dict(id=dataset.id, name=dataset.table_name, schema=dataset.schema,
                           database=dataset.database.database_name,
                           temporal_columns=[column['column_name'] for column in columns
                                             if is_temporal(column) and not column['expression']],
                           jalali_columns=remove_plan(columns)))
    return result


def _as_user(user, action):
    from superset.utils.core import override_user
    with override_user(user):
        return action()


def add_jalali_columns(dataset_id, source_column, fields=None, prefix='jalali_', tz=None, *, user):
    """Create or update the calculated columns; returns {'created': [...], 'updated': [...]}."""
    def action():
        dataset = _dataset(dataset_id)
        existing = {column.column_name: column for column in dataset.columns}
        plan = plan_columns([_column(column) for column in existing.values()], source_column, fields, prefix, tz)
        planned = {column['column_name']: column for column in plan}
        payload = [{'id': column.id, 'column_name': name, **planned.pop(name, {})} for name, column in existing.items()]
        _update(dataset, payload + list(planned.values()))
        names = [column['column_name'] for column in plan]
        return {'created': [name for name in names if name not in existing],
                'updated': [name for name in names if name in existing]}
    return _as_user(user, action)


def remove_jalali_columns(dataset_id, source_column=None, *, user):
    """Delete the plugin's calculated columns; returns {'removed': [...]}."""
    def action():
        dataset = _dataset(dataset_id)
        removed = remove_plan([_column(column) for column in dataset.columns], source_column)
        if removed:
            _update(dataset, [{'id': column.id, 'column_name': column.column_name}
                              for column in dataset.columns if column.column_name not in removed])
        return {'removed': removed}
    return _as_user(user, action)

