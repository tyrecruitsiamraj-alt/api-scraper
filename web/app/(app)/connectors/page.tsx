import { redirect } from 'next/navigation';

/** URL เดิมยังใช้ได้ แต่ศูนย์กลาง Connector ย้ายไป Settings แล้ว. */
export default function ConnectorsPage() {
  redirect('/settings/connectors');
}
