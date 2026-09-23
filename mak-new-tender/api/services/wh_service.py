from django.db import connection
from rest_framework.response import Response
from rest_framework import status
from datetime import datetime
from django.db import transaction
from django.utils import timezone
from django.db.models import F
from api.models import Tblorderlineallocate, Tblpurchaseorderline , Tbltransitorderline, Tblconsumeorderline

class WHService:
    def get_doing_list_service(self):
        try:
            query = """
            select 'receipt' as type, orderid, ordernumber as name,
                sum(actualqty - receiptqty) as qty,
                round(sum(actualqty - receiptqty) * 100 / sum(productquantity), 2) as percent,
                max(date_) as created
            from TBLPURCHASEORDERLINE
            group by orderid, ordernumber
            having sum(actualqty - receiptqty) > 0

            union all

            select 'transit' as type, transitid as orderid, transitname as name,
                sum(actualqty - transqty) as qty,
                round(sum(actualqty - transqty) * 100 / sum(quantity), 2) as percent,
                max(date_) as created
            from TBLTRANSITORDERLINE
            group by transitid, transitname
            having sum(actualqty - transqty) > 0

            union all

            select 'issue' as type, consumeid as orderid, consumename as name,
                sum(actualqty - issueqty) as qty,
                round(sum(actualqty - issueqty) * 100 / sum(quantity), 2) as percent,
                max(date_) as created
            from TBLCONSUMEORDERLINE
            group by consumeid, consumename
            having sum(actualqty - issueqty) > 0
            """

            with connection.cursor() as cursor:
                cursor.execute(query)

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()

                data = [
                    dict(zip(columns, row))
                    for row in rows
                ]

            return Response(
                {"success": 1, "data": data},
                status=status.HTTP_200_OK
            )

        except Exception as e:
            print(f"[get_doing_list_service] Error: {e}")

            return Response(
                {"success": 0, "message": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            ) 

    @staticmethod
    def get_order_list_service():
        try:
            query = """
                SELECT orderid, SUM(receiptqty) AS receiptqty
                FROM TBLPURCHASEORDERLINE
                GROUP BY orderid
                HAVING SUM(receiptqty) > 0
            """

            with connection.cursor() as cursor:
                cursor.execute(query)

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()

                data = [
                    dict(zip(columns, row))
                    for row in rows
                ]

            return Response(
                {"success": 1, "data": data},
                status=status.HTTP_200_OK
            )

        except Exception as e:
            print(f"[get_order_list_service] Error: {e}")

            return Response(
                {"success": 0, "message": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @staticmethod
    def get_trans_list_service():
        try:
            query = """
                SELECT transitid, purchaseorderid, SUM(transqty) AS transqty
                FROM TBLTRANSITORDERLINE
                GROUP BY transitid, purchaseorderid
                HAVING SUM(transqty) > 0
            """

            with connection.cursor() as cursor:
                cursor.execute(query)

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()

                data = [
                    dict(zip(columns, row))
                    for row in rows
                ]

            return Response(
                {"success": 1, "data": data},
                status=status.HTTP_200_OK
            )

        except Exception as e:
            print(f"[get_trans_list_service] Error: {e}")

            return Response(
                {"success": 0, "message": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @staticmethod
    def get_consume_list_service():
        try:
            query = """
                SELECT expenseid, consumeid, SUM(issueqty) AS issueqty
                FROM TBLCONSUMEORDERLINE
                GROUP BY expenseid, consumeid
                HAVING SUM(issueqty) > 0
            """

            with connection.cursor() as cursor:
                cursor.execute(query)

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()

                data = [
                    dict(zip(columns, row))
                    for row in rows
                ]

            return Response(
                {"success": 1, "data": data},
                status=status.HTTP_200_OK
            )

        except Exception as e:
            print(f"[get_consume_list_service] Error: {e}")

            return Response(
                {"success": 0, "message": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @staticmethod
    def get_purchase_order_line_service(orderid):
        try:

            with connection.cursor() as cursor:

                # QUERY 1
                query1 = """
                SELECT *
                FROM TBLPURCHASEORDERLINE
                WHERE status = 0 AND orderid = %s
                """
                cursor.execute(query1, [orderid])

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()

                data1 = [dict(zip(columns, row)) for row in rows]


                # QUERY 2
                query2 = """
                SELECT TBLORDERLINEALLOCATE.*, productname
                FROM TBLORDERLINEALLOCATE
                INNER JOIN TBLPURCHASEORDERLINE
                ON TBLPURCHASEORDERLINE.id = TBLORDERLINEALLOCATE.tmpid
                AND TBLORDERLINEALLOCATE.productid = TBLPURCHASEORDERLINE.productid
                WHERE TBLORDERLINEALLOCATE.orderid = %s
                ORDER BY TBLORDERLINEALLOCATE.productid DESC
                """
                cursor.execute(query2, [orderid])

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()

                data2 = [dict(zip(columns, row)) for row in rows]


                # QUERY 3
                query3 = """
                SELECT DISTINCT orderid, towarehouseid
                FROM TBLORDERLINEALLOCATE
                WHERE orderid = %s
                """
                cursor.execute(query3, [orderid])

                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()

                data3 = [dict(zip(columns, row)) for row in rows]


            return Response(
                {
                    "success": 1,
                    "data": [
                        data1,
                        data2,
                        data3
                    ]
                },
                status=status.HTTP_200_OK
            )

        except Exception as e:
            print(f"[get_purchase_order_line_service] Error: {e}")

            return Response(
                {"success": 0, "message": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @staticmethod
    def save_purchase_order_line_service(lines):

        try:
            with connection.cursor() as cursor:

                for r in lines:

                    # INSERT
                    if r.get("id", 0) == 0:

                        query = """
                        INSERT INTO TBLPURCHASEORDERLINE
                        (lineid, orderid, ordername, ordernumber, productid,
                         productuom, productname, productquantity, actualqty,
                         productbarcode, priceunit,
                         locationid, locationbarcode, locationname,
                         warehouseid, istemp, date_)
                        VALUES
                        (%s, %s, %s, %s, %s,
                         %s, %s, %s, %s,
                         %s, %s,
                         %s, %s, %s,
                         %s, %s, %s)
                        """

                        cursor.execute(query, [
                            r.get("lineid"),
                            r.get("orderid"),
                            r.get("ordername"),
                            r.get("ordernumber"),
                            r.get("productid"),
                            r.get("productuom"),
                            r.get("productname"),
                            r.get("productquantity"),
                            r.get("actualqty"),
                            r.get("productbarcode"),
                            r.get("priceunit"),
                            r.get("locationid"),
                            r.get("locationbarcode"),
                            r.get("locationname"),
                            r.get("warehouseid"),
                            r.get("istemp"),
                            datetime.now()
                        ])

                    # UPDATE
                    else:

                        query = """
                        UPDATE TBLPURCHASEORDERLINE
                        SET actualqty = %s,
                            date_ = %s
                        WHERE id = %s
                        """

                        cursor.execute(query, [
                            r.get("actualqty"),
                            datetime.now(),
                            r.get("id")
                        ])

            return Response(
                {"success": 1, "message": "Saved successfully"},
                status=status.HTTP_200_OK
            )

        except Exception as e:
            print(f"[save_purchase_order_line_service] Error: {e}")

            return Response(
                {"success": 0, "message": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @staticmethod
    def save_order_line_allocate(param):

        if not param:
            return {"ret_type": 1, "ret_msg": "Empty data"}

        first = param[0]

        try:
            with transaction.atomic():

                # 1 Delete old allocations
                Tblorderlineallocate.objects.filter(
                    tmpid=first["tmpid"]
                ).delete()

                # 2 Find tmpid
                pol = Tblpurchaseorderline.objects.filter(
                    orderid=first["orderid"],
                    lineid=first["lineid"],
                    productid=first["productid"]
                ).first()

                tmpid = pol.id if pol else 0

                # 3 Insert allocations
                objs = []

                for r in param:
                    if r.get("id", 0) == 0:
                        objs.append(
                            Tblorderlineallocate(
                                lineid=r["lineid"],
                                orderid=r["orderid"],
                                tmpid=tmpid,
                                fromwarehouseid=r["fromwarehouseid"],
                                towarehouseid=r["towarehouseid"],
                                towarehousename=r["towarehousename"],
                                productid=r["productid"],
                                quantity=r["quantity"]
                            )
                        )

                Tblorderlineallocate.objects.bulk_create(objs)

                # 4 Query allocation list
                allocation_list = list(
                    Tblorderlineallocate.objects
                    .filter(orderid=first["orderid"])
                    .select_related()
                    .values(
                        "id",
                        "lineid",
                        "orderid",
                        "tmpid",
                        "productid",
                        "quantity",
                        "towarehouseid",
                        "towarehousename"
                    )
                    .order_by("-productid")
                )

                # 5 Query warehouse list
                warehouse_list = list(
                    Tblorderlineallocate.objects
                    .filter(orderid=first["orderid"])
                    .values("orderid", "towarehouseid")
                    .distinct()
                )

                return {
                    "ret_type": 0,
                    "ret_data": [allocation_list, warehouse_list]
                }

        except Exception as e:
            return {
                "ret_type": 1,
                "ret_msg": str(e)
            }

    @staticmethod
    def delete_purchase_order_line(lineid, orderid):
        try:
            with transaction.atomic():

                # 1 Delete purchase order line
                Tblpurchaseorderline.objects.filter(
                    lineid=lineid
                ).delete()

                # 2 Delete allocation rows
                Tblorderlineallocate.objects.filter(
                    lineid=lineid
                ).delete()

                # 3 Get distinct warehouses
                warehouse_list = list(
                    Tblorderlineallocate.objects
                    .filter(orderid=orderid)
                    .values("orderid", "towarehouseid")
                    .distinct()
                )

                return {
                    "ret_type": 0,
                    "ret_data": warehouse_list
                }

        except Exception as e:
            return {
                "ret_type": 1,
                "ret_msg": str(e)
            }

    @staticmethod
    def save_receipt(param):

        try:
            with transaction.atomic():

                ids = [r["id"] for r in param]

                rows = Tblpurchaseorderline.objects.filter(id__in=ids)

                row_map = {r["id"]: r["actualqty"] for r in param}

                for row in rows:
                    row.receiptqty = row_map[row.id]

                Tblpurchaseorderline.objects.bulk_update(rows, ["receiptqty"])

            return {"ret_type": 0}

        except Exception as e:
            return {"ret_type": 1, "ret_msg": str(e)}

    @staticmethod
    def get_transit_order_line(transitid):
        try:
            rows = list(
                Tbltransitorderline.objects.filter(
                    status=0,
                    transitid=transitid
                ).values()
            )
            return {
                "ret_type": 0,
                "ret_data": rows
            }
        except Exception as e:
            return {
                "ret_type": 1,
                "ret_msg": str(e)
            }

    @staticmethod
    def save_transit_order_line(param):

        try:
            with transaction.atomic():
                now = timezone.now()
                objs_to_create = []

                for r in param:

                    if r.get("id", 0) == 0:
                        # Prepare new object for bulk_create
                        objs_to_create.append(
                            Tbltransitorderline(
                                transitid=r["transitid"],
                                transitname=r["transitname"],
                                purchaseorderid=r["purchaseorderid"],
                                productid=r["productid"],
                                quantity=r["quantity"],
                                actualqty=r["actualqty"],
                                productbarcode=r["productbarcode"],
                                productname=r["productname"],
                                date_=now
                            )
                        )
                    else:
                        # Update existing row
                        Tbltransitorderline.objects.filter(id=r["id"]).update(
                            actualqty=F("actualqty") + r["actualqty"],
                            date_=now
                        )

                # Bulk insert all new rows
                if objs_to_create:
                    Tbltransitorderline.objects.bulk_create(objs_to_create)

            return {"ret_type": 0}

        except Exception as e:
            return {"ret_type": 1, "ret_msg": str(e)}

    @staticmethod
    def delete_transit_order_line(param):
        try:
            with transaction.atomic():
                Tbltransitorderline.objects.filter(
                    transitid=param["transitid"],
                    productid=param["productid"],
                    productname=param["productname"]
                ).delete()

            return {"ret_type": 0}

        except Exception as e:
            return {"ret_type": 1, "ret_msg": str(e)}
    @staticmethod
    def save_transit(param):
        try:
            with transaction.atomic():
                for r in param:
                    Tbltransitorderline.objects.filter(id=r["id"]).update(
                        transqty=r["actualqty"]
                    )

            return {"ret_type": 0}

        except Exception as e:
            return {"ret_type": 1, "ret_msg": str(e)}

    @staticmethod
    def get_consume_order_line(consumeid):
        try:
            rows = list(
                Tblconsumeorderline.objects.filter(
                    status=0,
                    consumeid=consumeid
                ).values()
            )
            return {
                "ret_type": 0,
                "ret_data": rows
            }

        except Exception as e:
            return {
                "ret_type": 1,
                "ret_msg": str(e)
            }

    @staticmethod
    def save_consume_order_line(param):
        try:
            with transaction.atomic():
                now = timezone.now()
                objs_to_create = []

                for r in param:
                    if r.get("id", 0) == 0:
                        # Prepare new object for bulk insert
                        objs_to_create.append(
                            Tblconsumeorderline(
                                expenseid=r["expenseid"],
                                consumeid=r["consumeid"],
                                consumename=r["consumename"],
                                lineid=r["lineid"],
                                warehouseid=r["warehouseid"],
                                locationid=r["locationid"],
                                productid=r["productid"],
                                quantity=r["quantity"],
                                actualqty=r["actualqty"],
                                productbarcode=r["productbarcode"],
                                productname=r["productname"],
                                date_=now
                            )
                        )
                    else:
                        # Update existing row
                        Tblconsumeorderline.objects.filter(id=r["id"]).update(
                            actualqty=r["actualqty"],
                            date_=now
                        )

                # Bulk insert all new rows
                if objs_to_create:
                    Tblconsumeorderline.objects.bulk_create(objs_to_create)

            return {"ret_type": 0}

        except Exception as e:
            return {"ret_type": 1, "ret_msg": str(e)}

    @staticmethod
    def delete_consume_order_line(lineid):
        try:
            with transaction.atomic():
                Tblconsumeorderline.objects.filter(lineid=lineid).delete()

            return {"ret_type": 0}

        except Exception as e:
            return {"ret_type": 1, "ret_msg": str(e)}

    @staticmethod
    def save_issue(param):
        try:
            with transaction.atomic():
                for r in param:
                    Tblconsumeorderline.objects.filter(id=r["id"]).update(issueqty=r["actualqty"])

            return {"ret_type": 0}

        except Exception as e:
            return {"ret_type": 1, "ret_msg": str(e)}


wh_service = WHService()
