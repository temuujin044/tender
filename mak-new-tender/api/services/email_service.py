from django.core.mail import EmailMessage
from django.conf import settings
import base64

class EmailService:
    def __init__(self):
        self.default_from = settings.DEFAULT_FROM_EMAIL

    def create_email_message(self, mail_data):
        """Internal helper: build EmailMessage"""
        to_list = [addr.strip() for addr in mail_data['To'].split(',')]
        if len(to_list) > 1:
            bcc_list = to_list
            to_list = ['procurement@mak.mn']
        else:
            bcc_list = []

        email_msg = EmailMessage(
            subject=mail_data.get('Subject', ''),
            body=mail_data.get('Content', ''),
            from_email=self.default_from,
            to=to_list,
            bcc=bcc_list
        )

        attachment = mail_data.get('attachmentFile')
        if attachment and attachment.get('filename') and attachment.get('extension') and attachment.get('data'):
            file_bytes = base64.b64decode(attachment['data'])
            file_name = f"{attachment['filename']}.{attachment['extension']}"
            email_msg.attach(file_name, file_bytes, 'application/octet-stream')

        return email_msg

    def send_my_mail(self, mail_data):
        """Internal helper: send the EmailMessage"""
        result = {"RetType": 0, "RetMsg": "Email sent successfully"}
        try:
            email_msg = self.create_email_message(mail_data)
            email_msg.content_subtype = "html"
            email_msg.send(fail_silently=False)
        except Exception as ex:
            result["RetType"] = 1
            result["RetMsg"] = str(ex)
        return result

    def send_email(self, mail_data):
        """Public method called by the view"""
        return self.send_my_mail(mail_data)