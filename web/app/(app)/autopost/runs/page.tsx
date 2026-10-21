import { redirect } from 'next/navigation';

// รายการรอบโพสต์ย้ายไปอยู่ที่หน้า "งานโพสต์" (1 รอบ = 1 งาน)
export default function AutopostRunsPage() {
  redirect('/autopost/jobs');
}
