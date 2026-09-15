import { redirect } from 'next/navigation';

export default function LegacyEmployeeSettingsPage() {
  redirect('/admin/settings');
}
