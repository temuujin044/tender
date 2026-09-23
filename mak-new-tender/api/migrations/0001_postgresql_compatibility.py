from django.db import migrations


POSTGRESQL_COMPATIBILITY_SQL = r"""
CREATE OR REPLACE FUNCTION mysql_datetime_format(format_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
    SELECT replace(
        replace(
            replace(
                replace(
                    replace(
                        replace(format_text, '%Y', 'YYYY'),
                        '%m', 'MM'
                    ),
                    '%d', 'DD'
                ),
                '%H', 'HH24'
            ),
            '%i', 'MI'
        ),
        '%s', 'SS'
    )
$$;

CREATE OR REPLACE FUNCTION date_format(value date, format_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
    SELECT to_char(value, mysql_datetime_format(format_text))
$$;

CREATE OR REPLACE FUNCTION date_format(value timestamp without time zone, format_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
    SELECT to_char(value, mysql_datetime_format(format_text))
$$;

CREATE OR REPLACE FUNCTION date_format(value timestamp with time zone, format_text text)
RETURNS text
LANGUAGE sql
STABLE
STRICT
AS $$
    SELECT to_char(value, mysql_datetime_format(format_text))
$$;

CREATE OR REPLACE FUNCTION str_to_date(value text, format_text text)
RETURNS timestamp without time zone
LANGUAGE sql
STABLE
AS $$
    SELECT to_timestamp(NULLIF(value, ''), mysql_datetime_format(format_text))::timestamp without time zone
$$;

CREATE OR REPLACE FUNCTION sysdate()
RETURNS timestamp without time zone
LANGUAGE sql
VOLATILE
AS $$
    SELECT clock_timestamp()::timestamp without time zone
$$;

CREATE OR REPLACE FUNCTION datediff(left_value text, right_value text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
    SELECT replace(substring(left_value FROM 1 FOR 10), '.', '-')::date
         - replace(substring(right_value FROM 1 FOR 10), '.', '-')::date
$$;

CREATE OR REPLACE FUNCTION datediff(left_value date, right_value date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
    SELECT left_value - right_value
$$;

CREATE OR REPLACE FUNCTION datediff(left_value timestamp without time zone, right_value timestamp without time zone)
RETURNS integer
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
    SELECT left_value::date - right_value::date
$$;

CREATE OR REPLACE FUNCTION datediff(left_value timestamp with time zone, right_value timestamp with time zone)
RETURNS integer
LANGUAGE sql
STABLE
STRICT
AS $$
    SELECT left_value::date - right_value::date
$$;

CREATE OR REPLACE FUNCTION datediff(left_value timestamp without time zone, right_value timestamp with time zone)
RETURNS integer
LANGUAGE sql
STABLE
STRICT
AS $$
    SELECT left_value::date - right_value::date
$$;

CREATE OR REPLACE FUNCTION datediff(left_value timestamp with time zone, right_value timestamp without time zone)
RETURNS integer
LANGUAGE sql
STABLE
STRICT
AS $$
    SELECT left_value::date - right_value::date
$$;
"""


DROP_POSTGRESQL_COMPATIBILITY_SQL = r"""
DROP FUNCTION IF EXISTS datediff(timestamp with time zone, timestamp without time zone);
DROP FUNCTION IF EXISTS datediff(timestamp without time zone, timestamp with time zone);
DROP FUNCTION IF EXISTS datediff(timestamp with time zone, timestamp with time zone);
DROP FUNCTION IF EXISTS datediff(timestamp without time zone, timestamp without time zone);
DROP FUNCTION IF EXISTS datediff(date, date);
DROP FUNCTION IF EXISTS datediff(text, text);
DROP FUNCTION IF EXISTS sysdate();
DROP FUNCTION IF EXISTS str_to_date(text, text);
DROP FUNCTION IF EXISTS date_format(timestamp with time zone, text);
DROP FUNCTION IF EXISTS date_format(timestamp without time zone, text);
DROP FUNCTION IF EXISTS date_format(date, text);
DROP FUNCTION IF EXISTS mysql_datetime_format(text);
"""


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.RunSQL(
            sql=POSTGRESQL_COMPATIBILITY_SQL,
            reverse_sql=DROP_POSTGRESQL_COMPATIBILITY_SQL,
        ),
    ]
