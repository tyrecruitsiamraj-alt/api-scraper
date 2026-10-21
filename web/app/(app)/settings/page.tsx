import { SettingsIcon } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

export default function SettingsPage() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon"><SettingsIcon /></EmptyMedia>
        <EmptyTitle>เลือกเมนูตั้งค่าด้านบน</EmptyTitle>
        <EmptyDescription>บัญชีที่ใช้งาน · กลุ่ม Facebook · กระแสที่น่าสนใจ</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
