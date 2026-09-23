from django.urls import path
from api.views import admin_views, auth_views, wh_views , maktender_views
from api.views import audit_views
from api.views import workflow_views
from api.services.audit_service import audited_business_view, audit_viewer_required
from api.services.admin_service import database_admin_required

urlpatterns = [
    path('maktender/workflow/', workflow_views.invitation_workflow),
    path('settings/myPermission/', workflow_views.my_permissions),
    path('maktender/evaluationInvitations/', workflow_views.evaluation_invitations),
    path("maktender/savePortalTender/", maktender_views.save_portal_tender_view),
    path("admin/access/", admin_views.access),
    path("audit/access/", audit_views.access),
    path("audit/events/", audit_views.events),
    path("audit/events/<int:event_id>/", audit_views.event_detail),
    path("tenderauth/newUser/", auth_views.new_user),
    path("tenderauth/login/", auth_views.login),
    path("tenderauth/resetPassword/", auth_views.reset_password),
    path("tenderauth/saveResetPwd/", auth_views.save_reset_pwd),
    
    path("makwh/getDoingList/", wh_views.get_doing_list),
    path("makwh/getOrderList/", wh_views.get_order_list),
    path("makwh/getTransList/", wh_views.get_trans_list),
    path("makwh/getConsumeList/", wh_views.get_consume_list),

    path("makwh/getPurchaseOrderLine/<int:orderid>/", wh_views.get_purchase_order_line),
    path("makwh/savePurchaseOrderLine/", wh_views.save_purchase_order_line),
    path("makwh/saveOrderLineAllocate/", wh_views.save_order_line_allocate),
    path("makwh/deletePurchaseOrderLine/", wh_views.delete_purchase_order_line),
    path("makwh/saveReceipt/", wh_views.save_receipt),

    path("makwh/getTransitOrderLine/<int:transitid>/", wh_views.get_transit_order_line),
    path("makwh/saveTransitOrderLine/", wh_views.save_transit_order_line),
    path("makwh/deleteTransitOrderLine/", wh_views.delete_transit_order_line),
    path("makwh/saveTransit/", wh_views.save_transit),

    path("makwh/getConsumeOrderLine/<int:consumeid>/", wh_views.get_consume_order_line),
    path("makwh/saveConsumeOrderLine/", wh_views.save_consume_order_line),
    path("makwh/deleteConsumeOrderLine/<int:lineid>/delete", wh_views.delete_consume_order_line),
    path("makwh/saveIssue/", wh_views.save_issue),

    path("maktender/updateTenderVendorEvaluationStatus/",maktender_views.update_tender_vendor_evaluation_status),
    path("maktender/getTenderVendorEvaluationStatus/", maktender_views.get_tender_vendor_evaluation_status),

    path("maktender/getTenderCounts/", maktender_views.get_tender_counts),
    path("maktender/getTenderCountsForEmp/", maktender_views.get_tender_counts_for_emp),
    path("maktender/getTenderList/", maktender_views.get_tender_list),
    path("maktender/getTenderPlanList/", maktender_views.get_tender_plan_list),
    path("maktender/getTenderListByFilter/", maktender_views.get_tender_list_by_filter),
    path("maktender/getTenderPlanListByFilter/", maktender_views.get_tender_plan_list_by_filter),
    path("maktender/deleteTender/<int:tenderid>/", maktender_views.delete_tender),
    path("maktender/saveTender/", maktender_views.save_tender),
    path("maktender/getTenderInitialData/<int:tenderid>/", maktender_views.get_tender_initial_data),

    path("maktender/saveInvitationHeader/", maktender_views.save_invitation_header),
    path("maktender/saveInvitation/", maktender_views.save_invitation),
    path("maktender/sendNewTenderNotif/", maktender_views.send_new_tender_notification),
    path("maktender/sendNewJoinWorkNotif/", maktender_views.send_new_joinwork_notification),
    path("maktender/delayInvitation/", maktender_views.delay_invitation),
    path("maktender/insertInvitationOfTender/", maktender_views.insert_invitation_of_tender),
    path("maktender/evalueteInvitationOfVendor/", maktender_views.evaluete_invitation_of_vendor),
    path("maktender/finalInvitationOfVendor/", maktender_views.final_evaluation_invitation_of_vendor),
    path("maktender/invitationFirstRound/", maktender_views.evaluate_invitation_first_round_view),
    path("maktender/openInvitationOfVendor/", maktender_views.open_invitation_of_vendor),
    path("maktender/finishInvitation/", maktender_views.finish_invitation),    
    path("maktender/rejectInvitation/", maktender_views.reject_invitation),    
    path("maktender/publishRequestInvitation/", maktender_views.publish_request_inv),    
    path("maktender/rePublishRequestInvitation/", maktender_views.re_publish_request_inv),    
    path("maktender/rePublishInvitation/", maktender_views.re_publish_invitation),    
    path("maktender/updateInvitationOfTender/", maktender_views.update_invitation_of_tender),

    path("maktender/getInvVendorList/", maktender_views.get_invitation_of_vendor_list_view),
    path("maktender/getInvVendorListAll/", maktender_views.get_invitations_vendor_list_all_view),
    path("maktender/getInvVendorListNextRound/", maktender_views.get_invitations_vendor_list_for_next_round_view),
    path("maktender/getInvVendorRound/", maktender_views.get_invitation_of_vendor_round_evaluation_view),
    path("maktender/getInvVendorEvaList/", maktender_views.get_invitations_vendor_evaluation_list_view),
    path("maktender/getInvVendorFirstEvaList/", maktender_views.get_invitations_vendor_first_evaluation_list_view),
    path("maktender/getInvVendorListId/", maktender_views.get_invitation_of_vendor_list_by_id_view),
    path("maktender/getInvVendorFinal/", maktender_views.get_invitation_of_vendors_final_result_view),
    path("maktender/saveInvVendorRoundSelection/", maktender_views.save_invitation_vendor_round_selection_result_view),
    path("maktender/delInvVendor/", maktender_views.delete_invitation_of_vendor_view),
    path("maktender/getInvList/", maktender_views.get_invitation_list_view),
    path("maktender/getInvListOpen/", maktender_views.get_invitation_list_open_view),
    path("maktender/getInvListResult/", maktender_views.get_invitation_list_result_view),
    path("maktender/getInvListVendor/", maktender_views.get_invitation_list_for_vendor_view),
    path("maktender/checkInvVendor/", maktender_views.check_invitation_for_vendor_view),
    path("maktender/getInvListParticipated/", maktender_views.get_invitation_list_participated_view),
    path("maktender/getInvListInvolved/", maktender_views.get_invitation_list_involved_view),
    path("maktender/getInvListFilter/", maktender_views.get_invitation_list_by_filter_view),
    path("maktender/getInvListCountVendor/<int:vendorid>/", maktender_views.get_invitation_count_by_vendor_view),
    path("maktender/invToPdf/", maktender_views.invitation_to_pdf_view),
    path("maktender/invDetail/", maktender_views.invitation_detail_view),

    path("maktender/joinWorkDetail/<int:joinworkid>/", maktender_views.joinwork_detail_view),
    path("maktender/vendorComments/<int:invitationid>/<int:vendorid>/", maktender_views.comments_by_vendor_view),
    
    path("maktender/getTenderDocList/", maktender_views.tender_doc_list_view),
    path("maktender/getTenderDocJoinList/", maktender_views.tender_doc_join_list_view),
    path("maktender/getTenderDocJoinData/", maktender_views.tender_doc_join_data_view),
    path("maktender/getFolderCaseList/", maktender_views.folder_case_list_view),
    path('maktender/getFolderCaseById/', maktender_views.folder_case_by_id_view),
    path('maktender/getJoinWorkDocList/', maktender_views.join_work_doc_list_view),
    path('maktender/saveTenderDoc/', maktender_views.save_tender_doc_view),
    path('maktender/saveJoinWorkDocument/', maktender_views.save_join_work_document_view),
    path('maktender/saveTenderJoinDoc/', maktender_views.save_tender_join_doc_view),
    path('maktender/saveJoinWorkDoc/', maktender_views.save_joinwork_doc_view),
    path('maktender/saveFolderCase/', maktender_views.save_folder_case_view),
    path('maktender/saveTenderDocFile/', maktender_views.save_tender_doc_file_view),
    path('maktender/saveVendorCompanyDoc/', maktender_views.save_vendor_company_doc_view),
    path('maktender/getFilePath/', maktender_views.get_file_path_view),
    path('maktender/uploadTenderJoinDocument/', maktender_views.upload_tender_join_document_view),
    path('maktender/uploadTenderDocument/', maktender_views.upload_tender_document_view),
    path('maktender/saveTenderDraftDetails/', maktender_views.save_tender_draft_details_view),
    path('maktender/saveTenderCommittee/', maktender_views.save_tender_committee_view),
    path('maktender/publishTenderFromPortal/', maktender_views.publish_tender_from_portal_view),
    path('maktender/downloadFile/', maktender_views.download_file_view),
    path('maktender/deleteFile/', maktender_views.delete_file_view),
    path('maktender/getTenderDocInitial/', maktender_views.get_tender_doc_initial_data_view),

    path('criteria/getList/', maktender_views.get_criteria_list_view),
    path('criteria/save/', maktender_views.save_criteria_view),
    path('criteria/delete/<int:criteriaid>/', maktender_views.delete_criteria_view),
    path('criteria/getInitialData/', maktender_views.get_criteria_initial_data_view),

    path('require/getList/', maktender_views.get_require_list_view),
    path('require/save/', maktender_views.save_require_view),
    path('require/delete/<int:requireid>/', maktender_views.delete_require_view),
    path('require/getInitialData/<int:requireid>/', maktender_views.get_require_initial_data_view),

    path('note/getList/', maktender_views.get_note_list_view),
    path('note/save/', maktender_views.save_note_view),
    path('note/delete/<int:noteid>/', maktender_views.delete_note_view),
    path('note/getInitialData/<int:noteid>/', maktender_views.get_note_initial_data_view),

    path('joinwork/saveProductReq/', maktender_views.save_join_work_product_requirement_view),
    path('joinwork/getExpiredWorkList/', maktender_views.get_join_work_list_expired_view),
    path('joinwork/getJoinWorkList/', maktender_views.get_join_work_list_view),
    path('joinwork/getJoinWork/<int:joinworkid>/', maktender_views.get_join_work_by_id_view),
    path('joinwork/delete/<int:joinworkid>/', maktender_views.delete_join_work_view),
    path('joinwork/save/', maktender_views.save_join_work_view),
    path('joinwork/publishInvitation/', maktender_views.publish_join_work_invitation_view),
    path('joinwork/getVendorList/<int:vendorid>/', maktender_views.get_join_work_list_for_vendor_view),
    path('joinwork/getListInvolved/<int:vendorid>/', maktender_views.get_join_work_list_involved_view),
    path('joinwork/sendVendor/', maktender_views.send_join_work_of_vendor_view),
    path('joinwork/getRecievedList/<int:joinworkid>/', maktender_views.get_join_work_list_received_list_view),
    path('joinwork/getInitialData/<int:joinworkid>/', maktender_views.get_join_work_initial_data_view),
    path('joinwork/getTaskList/<int:joinworkid>/', maktender_views.get_join_work_task_list_view),
    path('joinwork/getTask/<int:jointaskid>/', maktender_views.get_join_work_task_view),
    path('joinwork/deleteTask/<int:jointaskid>/', maktender_views.delete_join_work_task_view),
    path('joinwork/saveTask/', maktender_views.save_join_work_task_view),

    path('vendor/save/', maktender_views.save_vendor_view),
    path('vendor/getInfo/<int:vendorid>/', maktender_views.get_vendor_info_view),
    path('vendor/getCategory/<int:vendorid>/', maktender_views.get_vendor_category_view),
    path('vendor/getAllCategory/', maktender_views.get_all_vendors_category_view),
    path('vendor/getVendors/', maktender_views.get_vendors_view),

    path('email/send/', maktender_views.send_email_view),
    path('file/create/', maktender_views.create_file_view),

    path('comment/save/', maktender_views.save_comment_view),
    path('comment/getCounts/<int:invitationid>/', maktender_views.get_comment_count_view),
    path('comment/getComments/<int:invitationid>/<int:vendorid>/', maktender_views.get_comments_view),

    path('quote/getList/<int:invitationid>/<int:vendorid>/', maktender_views.get_qoute_list_view),
    path('quote/getById/<int:qouteid>/<int:tenderid>/', maktender_views.get_qoute_by_id_view),
    path('quote/delete/<int:qouteid>/', maktender_views.delete_qoute_view),
    path('quote/save/', maktender_views.save_qoute_view),

    path('vendorPortal/getList/', maktender_views.get_vendor_list_view),
    path('vendorPortal/getById/<int:vendorid>/', maktender_views.get_vendor_by_id_view),
    path('vendorPortal/getUpdated/', maktender_views.get_vendor_updated_view),

    path('tenderType/getList/', maktender_views.get_tender_type_list_view),
    path('tenderType/save/', maktender_views.save_tender_type_view),
    path('tenderType/delete/<int:tendertypeid>/', maktender_views.delete_tender_type_view),

    path('department/getList/', maktender_views.get_department_list_view),
    path('department/save/', maktender_views.save_department_view),
    path('department/delete/<int:departmentid>/', maktender_views.delete_department_view),

    path('purchaseType/getList/', maktender_views.get_purchase_type_list_view),
    path('purchaseType/save/', maktender_views.save_purchase_type_view),
    path('purchaseType/delete/<int:purchasetypeid>/', maktender_views.delete_purchase_type_view),

    path('requireType/getList/', maktender_views.get_require_type_list_view),
    path('requireType/save/', maktender_views.save_require_type_view),
    path('requireType/delete/<int:id>/', maktender_views.delete_require_type_view),

    path('criteriaType/getList/', maktender_views.get_criteria_type_list_view),
    path('criteriaType/save/', maktender_views.save_criteria_type_view),
    path('criteriaType/delete/<int:criteriatypeid>/', maktender_views.delete_criteria_type_view),

    path('docType/getList/', maktender_views.get_tender_doc_type_list_view),
    path('docType/save/', maktender_views.save_tender_doc_type_view),
    path('docType/delete/<int:doctypeid>/', maktender_views.delete_tender_doc_type_view),

    path('memberType/getList/', maktender_views.get_member_type_list_view),
    path('memberType/save/', maktender_views.save_member_type_view),
    path('memberType/delete/<int:membertypeid>/', maktender_views.delete_member_type_view),

    path('vendorActivity/getList/', maktender_views.get_vendor_activity_list_view),
    path('vendorActivity/save/', database_admin_required(maktender_views.save_vendor_activity_view)),
    path('vendorActivity/delete/<int:activityid>/', database_admin_required(maktender_views.delete_vendor_activity_view)),

    path('vendorSubActivity/getList/', maktender_views.get_vendor_sub_activity_list_view),
    path('vendorSubActivity/save/', maktender_views.save_vendor_sub_activity_view),
    path('vendorSubActivity/delete/<int:subactivityid>/', maktender_views.delete_vendor_sub_activity_view),

    path('email/getList/', maktender_views.email_cc_list_view),
    path('email/save/', maktender_views.save_email_cc_view),
    path('email/delete/<int:email_id>/', maktender_views.delete_email_cc_view),

    path('code/getList/', maktender_views.code_list_view),
    path('code/save/', maktender_views.save_code_view),
    path('code/delete/<int:code_id>/', maktender_views.delete_code_view),

    path('settings/getPermission/<int:empid>/', database_admin_required(maktender_views.permission_view)),
    path('settings/getList/', database_admin_required(maktender_views.settings_view)),
    path('settings/save/', database_admin_required(maktender_views.save_settings_view)),
    path('settings/delete/<int:setting_id>/', database_admin_required(maktender_views.delete_setting_view)),
    path('settings/changePasswordSalt/', maktender_views.change_password_to_salt_view),

    path('tender/openLog/', maktender_views.tender_open_log_view),

    path('erp/getSession/', maktender_views.obtain_erp_session_view),
    path('erp/getVendorCategory/', maktender_views.get_vendor_category_view),
    path('erp/getTenderOpenLog/<int:invitationid>/', maktender_views.get_tender_open_log_view),

    path('evaMembers/getList/', maktender_views.get_members_view),
    path('evaMembers/getById/<int:evaluationid>/', maktender_views.get_member_by_id_view),
    path('evaMembers/delete/<int:evaluationid>/', maktender_views.delete_member_view),
    path('evaMembers/save/', maktender_views.save_members_view),

    path('employees/getList/', maktender_views.get_emp_list_view),
    path('employees/all/', maktender_views.get_employees_view),
    path('notifications/vendor/', maktender_views.get_vendor_notifications_view),

    path('log/all/', audit_viewer_required(maktender_views.get_log_record_list_view)),

    path('vendor/docs/<int:vendorid>/', maktender_views.get_vendor_company_doc_list_view),

    path('masterContract/save/', maktender_views.save_master_contract_requirement_view),
    path('masterContract/getData/', maktender_views.get_master_contract_req_detail_data_view),
    path('masterContract/getList/', maktender_views.get_master_contract_req_list_view),
    path('masterContract/delete/<int:mastercontractreqid>/', maktender_views.delete_master_contract_req_view),
    

]

# Apply the same transaction and attribution rules to raw-SQL and ORM endpoints.
# Login, password operations and ERP synchronization intentionally generate no logs.
workflow_routes = {
    'publishTenderFromPortal': 'publish', 'publishRequestInvitation': 'request_publish',
    'openInvitationOfVendor': 'open', 'finishInvitation': 'finish',
    'rejectInvitation': 'cancel', 'rePublishRequestInvitation': 'request_republish',
    'rePublishInvitation': 'republish', 'finalInvitationOfVendor': 'decide',
    'delayInvitation': 'extend',
}
for pattern in urlpatterns:
    route = str(pattern.pattern)
    endpoint = route.strip('/').split('/')[-1]
    if route.startswith('maktender/') and endpoint in workflow_routes:
        pattern.callback = workflow_views.legacy_transition(workflow_routes[endpoint])
    if endpoint in {'saveInvitation', 'updateInvitationOfTender', 'updateTenderVendorEvaluationStatus'}:
        pattern.callback = workflow_views.retired_status_write
    if pattern.callback.__module__ in {maktender_views.__name__, wh_views.__name__, workflow_views.__name__}:
        if not route.startswith(("erp/", "employees/", "log/")) and route != "settings/changePasswordSalt/":
            pattern.callback = audited_business_view(pattern.callback, route)
