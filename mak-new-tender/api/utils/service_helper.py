from django.db import connection

import hashlib
import secrets

def run_service(query, params=None):
    
    result = {
        "retType": 0,
        "retMsg": "",
        "retData": []
    }

    try:
        with connection.cursor() as cursor:
            cursor.execute(query, params or [])

            # Only fetch results if there are any
            if cursor.description:  # SELECT queries have description
                columns = [col[0] for col in cursor.description]
                result["retData"] = [dict(zip(columns, row)) for row in cursor.fetchall()]

    except Exception as ex:
        result["retType"] = 1
        result["retMsg"] = str(ex)

    return result


def generate_salt():
    return secrets.token_hex(16)

def hash_password(password, salt, pepper, iterations=3):
    value = password + salt + pepper
    for _ in range(iterations):
        value = hashlib.sha256(value.encode()).hexdigest()
    return value

def compute_hash(self, password, salt, pepper, iterations=3):
    value = password + salt + pepper
    for _ in range(iterations):
        value = hashlib.sha256(value.encode()).hexdigest()
    return value