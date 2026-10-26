from flask import Flask
import pytest
from superset_jalali import cli, superset_ops
from superset_jalali.blueprint import blueprint
from superset_jalali.columns import ConflictError


@pytest.fixture
def run(monkeypatch):
    calls = []
    monkeypatch.setattr(cli, '_user', lambda username: username or 'first-admin')
    def add(dataset_id, column, fields, prefix, tz, *, user):
        calls.append(('add', dataset_id, column, fields, prefix, tz, user))
        if column == 'taken':
            raise ConflictError('Columns already exist and were not created by superset-jalali: jalali_year')
        return {'created': ['jalali_year'], 'updated': []}
    def remove(dataset_id, column, *, user):
        calls.append(('remove', dataset_id, column, user))
        return {'removed': ['jalali_year', 'jalali_month']}
    monkeypatch.setattr(superset_ops, 'add_jalali_columns', add)
    monkeypatch.setattr(superset_ops, 'remove_jalali_columns', remove)
    app = Flask(__name__)
    app.register_blueprint(blueprint)
    runner = app.test_cli_runner()
    return lambda *args: (runner.invoke(args=['jalali', *args]), calls)


def test_add_columns(run):
    result, calls = run('add-columns', '--dataset', '7', '--column', 'occurred_at', '--fields', 'year,month', '--tz', 'Asia/Tehran')
    assert result.exit_code == 0 and result.output == 'created: jalali_year\nupdated: -\n'
    assert calls == [('add', 7, 'occurred_at', ['year', 'month'], 'jalali_', 'Asia/Tehran', 'first-admin')]


def test_remove_columns_as_a_user(run):
    result, calls = run('remove-columns', '--dataset', '7', '--user', 'alice')
    assert result.exit_code == 0 and result.output == 'removed: jalali_year, jalali_month\n'
    assert calls == [('remove', 7, None, 'alice')]


def test_errors_exit_non_zero(run):
    result, _ = run('add-columns', '--dataset', '7', '--column', 'taken')
    assert result.exit_code == 1 and 'Error: Columns already exist' in result.output
    assert run('add-columns', '--dataset', '7')[0].exit_code == 2
