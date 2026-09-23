from django.apps import apps
from django.core.management.base import BaseCommand, CommandError
from django.db import connection


class Command(BaseCommand):
    help = "Validate the restored PostgreSQL schema and optionally synchronize identity sequences."

    def add_arguments(self, parser):
        parser.add_argument(
            "--sync-sequences",
            action="store_true",
            help="Set PostgreSQL sequences to the current maximum primary-key values.",
        )

    def handle(self, *args, **options):
        if connection.vendor != "postgresql":
            raise CommandError(f"PostgreSQL is required; current vendor is {connection.vendor}.")

        with connection.cursor() as cursor:
            cursor.execute("SELECT current_database(), current_user, current_setting('server_version')")
            database_name, database_user, server_version = cursor.fetchone()

            cursor.execute("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
            """)
            existing_tables = {row[0] for row in cursor.fetchall()}

            expected_tables = {
                model._meta.db_table
                for model in apps.get_app_config("api").get_models()
            }
            missing_tables = sorted(expected_tables - existing_tables)

            cursor.execute("""
                SELECT to_regprocedure('date_format(timestamp without time zone,text)'),
                       to_regprocedure('str_to_date(text,text)'),
                       to_regprocedure('datediff(text,text)')
            """)
            compatibility_functions = cursor.fetchone()
            missing_functions = [
                name
                for name, value in zip(
                    ("date_format", "str_to_date", "datediff"),
                    compatibility_functions,
                )
                if value is None
            ]

            cursor.execute("""
                SELECT table_name, column_name,
                       pg_get_serial_sequence(
                           format('%I.%I', table_schema, table_name),
                           column_name
                       )
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND (is_identity = 'YES' OR column_default LIKE 'nextval(%')
                ORDER BY table_name, column_name
            """)
            sequences = [row for row in cursor.fetchall() if row[2]]

            if options["sync_sequences"]:
                for table_name, column_name, sequence_name in sequences:
                    quoted_table = connection.ops.quote_name(table_name)
                    quoted_column = connection.ops.quote_name(column_name)
                    cursor.execute(
                        f"SELECT COALESCE(MAX({quoted_column}), 0) FROM {quoted_table}"
                    )
                    maximum_value = int(cursor.fetchone()[0] or 0)
                    cursor.execute(
                        "SELECT setval(%s::regclass, %s, %s)",
                        [
                            sequence_name,
                            maximum_value if maximum_value > 0 else 1,
                            maximum_value > 0,
                        ],
                    )

        self.stdout.write(f"Database: {database_name}")
        self.stdout.write(f"User: {database_user}")
        self.stdout.write(f"PostgreSQL: {server_version}")
        self.stdout.write(f"Tables: {len(existing_tables)}")
        self.stdout.write(f"Sequences: {len(sequences)}")

        if missing_tables:
            raise CommandError("Missing application tables: " + ", ".join(missing_tables))
        if missing_functions:
            raise CommandError(
                "Run `python manage.py migrate` to install functions: "
                + ", ".join(missing_functions)
            )

        if options["sync_sequences"]:
            self.stdout.write(self.style.SUCCESS("Sequences synchronized."))
        self.stdout.write(self.style.SUCCESS("PostgreSQL restore validation passed."))
