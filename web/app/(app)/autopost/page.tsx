import { redirect } from 'next/navigation';

// tab "Auto-Post" ก้อนเดียวถูกยุบแล้ว — ฟีเจอร์ย้ายออกมาเป็นหน้าแยก (jobs/posting/collect/reports)
// คงเส้นทางเดิมไว้ให้ redirect ไปหน้าแรกของโหมด Auto-Post
export default function AutopostIndexRedirect() {
  redirect('/autopost/jobs');
}
