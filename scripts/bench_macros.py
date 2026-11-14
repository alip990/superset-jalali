"""Time the PostgreSQL Jinja macros on a synthetic table.

Usage:
    pip install -e '.[dev]'
    PG_DSN=postgresql://postgres@127.0.0.1:5432/postgres python scripts/bench_macros.py

The script creates (or reuses, see --keep) the table bench_jalali_events with
--rows random timestamps between 2021-03-21 and 2032-03-19 and an index on
occurred_at, then prints the best of --runs timings for each query. Virtual
dataset queries wrap the dataset SQL in a subquery, as Superset does; the
"calculated" queries put jalali() in SELECT and GROUP BY of the table, as
Superset does for calculated columns of a physical dataset.
Run it on two checkouts to compare macro versions; drop the table afterwards
with --drop.
"""
import argparse
import os
import time
import psycopg
from flask import Flask
from superset_jalali.macros import jalali, jalali_columns, jalali_join

TABLE = 'bench_jalali_events'
MONTH = "occurred_at >= '2024-03-20' AND occurred_at < '2024-04-20'"


def dataset(lo, hi):
    app = Flask(__name__)
    app.config['JALALI'] = {'sql_min_year': lo, 'sql_max_year': hi}
    with app.app_context():
        return (f'SELECT t.*, {jalali_columns("t.occurred_at")}\n'
                f'FROM {TABLE} AS t\n{jalali_join("t.occurred_at")}')


def calculated(field, lo=1390, hi=1420):
    app = Flask(__name__)
    app.config['JALALI'] = {'sql_min_year': lo, 'sql_max_year': hi}
    with app.app_context():
        return jalali('occurred_at', field)


def queries():
    narrow, wide = dataset(1400, 1410), dataset(1390, 1420)
    label, day, year = calculated('month_label'), calculated('date'), calculated('year')
    return [
        ('count, 1-month date filter (1390-1420)',
         f'SELECT count(*) FROM ({wide}) AS v WHERE {MONTH}'),
        ('group by jalali_date, 1-month filter (1390-1420)',
         f'SELECT jalali_date, count(*) FROM ({wide}) AS v WHERE {MONTH} GROUP BY 1'),
        ('group by jalali_month_label, all rows (1400-1410)',
         f'SELECT jalali_month_label, count(*) FROM ({narrow}) AS v GROUP BY 1'),
        ('group by jalali_month_label, all rows (1390-1420)',
         f'SELECT jalali_month_label, count(*) FROM ({wide}) AS v GROUP BY 1'),
        ('count, WHERE jalali_year = 1403 (1390-1420)',
         f'SELECT count(*) FROM ({wide}) AS v WHERE jalali_year = 1403'),
        ('calculated: group by jalali_date, 1-month filter (1390-1420)',
         f'SELECT {day}, count(*) FROM {TABLE} WHERE {MONTH} GROUP BY {day}'),
        ('calculated: group by jalali_month_label, all rows (1400-1410)',
         f"SELECT {calculated('month_label', 1400, 1410)}, count(*) FROM {TABLE} GROUP BY {calculated('month_label', 1400, 1410)}"),
        ('calculated: group by jalali_month_label, all rows (1390-1420)',
         f'SELECT {label}, count(*) FROM {TABLE} GROUP BY {label}'),
        ('calculated: count, WHERE jalali_year = 1403 (1390-1420)',
         f'SELECT count(*) FROM {TABLE} WHERE {year} = 1403'),
        ('plain SQL: group by month, all rows',
         f"SELECT date_trunc('month', occurred_at), count(*) FROM {TABLE} GROUP BY 1"),
    ]


def prepare(conn, rows, keep):
    exists = conn.execute('SELECT to_regclass(%s) IS NOT NULL', (TABLE,)).fetchone()[0]
    if exists and keep:
        count = conn.execute(f'SELECT count(*) FROM {TABLE}').fetchone()[0]
        if count == rows:
            return
    conn.execute(f'DROP TABLE IF EXISTS {TABLE}')
    conn.execute(f'CREATE TABLE {TABLE} (id bigint, occurred_at timestamp)')
    conn.execute(f"""INSERT INTO {TABLE}
        SELECT i, timestamp '2021-03-21' + random() * (timestamp '2032-03-19' - timestamp '2021-03-21')
        FROM generate_series(1, %s) AS i""", (rows,))
    conn.execute(f'CREATE INDEX ON {TABLE} (occurred_at)')
    conn.execute(f'VACUUM ANALYZE {TABLE}')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--dsn', default=os.environ.get('PG_DSN'))
    parser.add_argument('--rows', type=int, default=5_000_000)
    parser.add_argument('--runs', type=int, default=3)
    parser.add_argument('--keep', action='store_true', help='reuse an existing table with --rows rows')
    parser.add_argument('--drop', action='store_true', help='drop the table and exit')
    args = parser.parse_args()
    if not args.dsn:
        parser.error('set PG_DSN or pass --dsn')
    with psycopg.connect(args.dsn, autocommit=True) as conn:
        if args.drop:
            conn.execute(f'DROP TABLE IF EXISTS {TABLE}')
            return
        prepare(conn, args.rows, args.keep)
        print(conn.execute('SELECT version()').fetchone()[0])
        print(f'{args.rows:,} rows, best of {args.runs}')
        for name, sql in queries():
            best = float('inf')
            for _ in range(args.runs):
                start = time.perf_counter()
                conn.execute(sql).fetchall()
                best = min(best, time.perf_counter() - start)
            print(f'{best:8.3f} s  {name}')


if __name__ == '__main__':
    main()
