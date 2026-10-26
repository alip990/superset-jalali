"""`superset jalali add-columns|remove-columns`: Superset adds blueprint command groups to its CLI."""
import click
from flask import current_app
from . import superset_ops
from .blueprint import blueprint
from .columns import ColumnsError


def _dataset_id(value):
    """A dataset id, or the id of the only dataset named table or schema.table."""
    if value.isdigit():
        return int(value)
    from superset import db
    from superset.connectors.sqla.models import SqlaTable
    schema, _, table = value.rpartition('.')
    query = db.session.query(SqlaTable.id).filter(SqlaTable.table_name == table)
    if schema:
        query = query.filter(SqlaTable.schema == schema)
    ids = [row.id for row in query]
    if len(ids) != 1:
        raise click.ClickException(f'{len(ids)} datasets match {value!r}; pass the dataset id instead')
    return ids[0]


def _user(username):
    from superset import db, security_manager
    if username:
        user = security_manager.find_user(username=username)
    else:
        role = security_manager.role_model
        user = (db.session.query(security_manager.user_model).join(security_manager.user_model.roles)
                .filter(role.name == current_app.config['AUTH_ROLE_ADMIN'])
                .order_by(security_manager.user_model.id).first())
    if user is None:
        raise click.ClickException(f'User {username!r} not found' if username else 'No Admin user found; pass --user')
    return user


def _run(action):
    try:
        result = action()
    except ColumnsError as error:
        raise click.ClickException(str(error)) from None
    for key, names in result.items():
        click.echo(f'{key}: {", ".join(names) or "-"}')


@blueprint.cli.command('add-columns')
@click.option('--dataset', required=True, help='Dataset id, table or schema.table')
@click.option('--column', required=True, help='Source date or timestamp column')
@click.option('--fields', help='Comma-separated fields; default: all 13')
@click.option('--prefix', default='jalali_', show_default=True)
@click.option('--tz', help='Asia/Tehran for timestamptz columns only')
@click.option('--user', help='Username to act as; default: the first Admin')
def add_columns(dataset, column, fields, prefix, tz, user):
    """Create or update the Jalali calculated columns of a dataset."""
    fields = fields.split(',') if fields else None
    _run(lambda: superset_ops.add_jalali_columns(_dataset_id(dataset), column, fields, prefix, tz, user=_user(user)))


@blueprint.cli.command('remove-columns')
@click.option('--dataset', required=True, help='Dataset id, table or schema.table')
@click.option('--column', help='Only columns derived from this source column')
@click.option('--user', help='Username to act as; default: the first Admin')
def remove_columns(dataset, column, user):
    """Remove the Jalali calculated columns created by superset-jalali."""
    _run(lambda: superset_ops.remove_jalali_columns(_dataset_id(dataset), column, user=_user(user)))
