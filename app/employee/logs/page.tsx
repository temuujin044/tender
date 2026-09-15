import { redirect } from 'next/navigation';

export default function LegacyEmployeeLogsPage() {
  redirect('/admin/logs');
}
