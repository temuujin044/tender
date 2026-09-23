from django.db import connection


def fetch_all_dict(cursor):
    columns = [col[0] for col in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def execute_query(query, params=None):
    with connection.cursor() as cursor:
        cursor.execute(query, params or [])
        return fetch_all_dict(cursor)