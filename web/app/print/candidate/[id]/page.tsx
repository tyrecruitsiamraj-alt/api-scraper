import { getServerSession } from 'next-auth';
import { redirect, notFound } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { getCandidate } from '@/lib/repo';
import { AutoPrint } from '@/components/AutoPrint';

export const dynamic = 'force-dynamic';

const PLATFORM: Record<string, string> = { jobbkk: 'JobBKK', jobthai: 'JobThai' };

function txt(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}
function arr(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}
function skills(v: unknown): string[] {
  return arr(v).map((x) => (typeof x === 'string' ? x : txt(x?.name ?? x?.skill ?? x?.language ?? ''))).filter(Boolean);
}
function langLine(x: any): string {
  if (typeof x === 'string') return x;
  return [txt(x?.language ?? x?.name), txt(x?.level ?? x?.proficiency ?? x?.ability)].filter(Boolean).join(' · ');
}
// Some sources store salary already suffixed with "บาท"; don't double it.
function salaryTxt(v: unknown): string {
  const s = txt(v);
  if (!s) return '';
  return /บาท|฿/.test(s) ? s : `${s} บาท`;
}

function Field({ label, value }: { label: string; value?: unknown }) {
  const v = txt(value);
  if (!v) return null;
  return (
    <div className="field">
      <div className="fl">{label}</div>
      <div className="fv">{v}</div>
    </div>
  );
}

export default async function PrintResume({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/');
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  const c: any = await getCandidate(params.id);
  if (!c) notFound();

  const profile = arr(c.assets).find((a: any) => a.kind === 'profile' && a.download_status === 'success');
  const education = arr(c.education);
  const work = arr(c.work_experience);
  const hard = skills(c.hard_skills);
  const soft = skills(c.soft_skills);
  const langs = arr(c.language_skills).map(langLine).filter(Boolean);
  const sources = arr(c.sources).map((s: any) => PLATFORM[txt(s.platform)] ?? txt(s.platform)).filter(Boolean);

  const contacts = [
    c.phone && `โทร: ${txt(c.phone)}`,
    c.email && `อีเมล: ${txt(c.email)}`,
    c.line_id && `LINE: ${txt(c.line_id)}`,
    c.facebook && `FB: ${txt(c.facebook)}`,
  ].filter(Boolean) as string[];

  return (
    <>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <AutoPrint />
      <div className="sheet">
        <header className="head">
          {profile ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="avatar" src={`/api/assets/${profile.id}`} alt={txt(c.full_name) || 'profile'} />
          ) : null}
          <div className="head-main">
            <h1 className="name">{txt(c.full_name) || '(ไม่ระบุชื่อ)'}</h1>
            {txt(c.desired_positions) ? <div className="role">{txt(c.desired_positions)}</div> : null}
            {contacts.length ? <div className="contacts">{contacts.join('  ·  ')}</div> : null}
            {sources.length ? <div className="sources">แหล่งข้อมูล: {sources.join(', ')}</div> : null}
          </div>
        </header>

        {txt(c.intro) ? (
          <section className="sec">
            <h2>แนะนำตัว</h2>
            <p className="para">{txt(c.intro)}</p>
          </section>
        ) : null}

        <section className="sec">
          <h2>ข้อมูลส่วนตัว</h2>
          <div className="grid">
            <Field label="คำนำหน้า" value={c.prefix} />
            <Field label="เพศ" value={c.gender} />
            <Field label="อายุ" value={c.age} />
            <Field label="วันเกิด" value={c.birth_date} />
            <Field label="สัญชาติ" value={c.nationality} />
            <Field label="ศาสนา" value={c.religion} />
            <Field label="ส่วนสูง" value={c.height} />
            <Field label="น้ำหนัก" value={c.weight} />
            <Field label="สถานภาพ" value={c.marital_status} />
            <Field label="สถานะทางทหาร" value={c.military_status} />
            <Field label="ยานพาหนะ" value={c.vehicle} />
            <Field label="ใบขับขี่" value={c.driving_license} />
            <Field label="จังหวัด" value={c.province} />
          </div>
          {txt(c.address) ? (
            <div className="addr">
              <div className="fl">ที่อยู่</div>
              <div className="fv">{txt(c.address)}</div>
            </div>
          ) : null}
        </section>

        <section className="sec">
          <h2>งานที่ต้องการ</h2>
          <div className="grid">
            <Field label="ตำแหน่ง" value={c.desired_positions} />
            <Field label="เงินเดือนที่ต้องการ" value={c.expected_salary} />
            <Field label="พื้นที่ทำงาน" value={c.desired_work_area} />
            <Field label="ประเภทงาน" value={c.job_type} />
            <Field label="เริ่มงานได้" value={c.available_start} />
          </div>
        </section>

        {education.length ? (
          <section className="sec">
            <h2>การศึกษา ({education.length})</h2>
            {education.map((e, i) => (
              <div key={i} className="entry">
                <div className="et">{txt(e.institution) || '—'}</div>
                <div className="em">
                  {[txt(e.degree), txt(e.faculty), txt(e.major), txt(e.gpa) && `GPA ${txt(e.gpa)}`, txt(e.graduation_year)].filter(Boolean).join(' · ')}
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {work.length ? (
          <section className="sec">
            <h2>ประสบการณ์ทำงาน ({work.length})</h2>
            {work.map((w, i) => (
              <div key={i} className="entry">
                <div className="et">{[txt(w.position), txt(w.company)].filter(Boolean).join(' — ') || '—'}</div>
                <div className="em">
                  {[txt(w.period) || txt(w.year), salaryTxt(w.salary), txt(w.business_type)].filter(Boolean).join(' · ')}
                </div>
                {txt(w.responsibilities) ? <p className="para">{txt(w.responsibilities)}</p> : null}
              </div>
            ))}
          </section>
        ) : null}

        {(hard.length || soft.length || langs.length) ? (
          <section className="sec">
            <h2>ทักษะและภาษา</h2>
            {hard.length ? <div className="skl"><span className="fl">ทักษะเฉพาะทาง</span><div className="chips">{hard.map((x, i) => <span key={i} className="chip">{x}</span>)}</div></div> : null}
            {soft.length ? <div className="skl"><span className="fl">ทักษะทั่วไป</span><div className="chips">{soft.map((x, i) => <span key={i} className="chip">{x}</span>)}</div></div> : null}
            {langs.length ? <div className="skl"><span className="fl">ภาษา</span><div className="chips">{langs.map((x, i) => <span key={i} className="chip">{x}</span>)}</div></div> : null}
          </section>
        ) : null}

        <footer className="foot">สร้างโดย SO Recruitment · {txt(c.full_name)}</footer>
      </div>
    </>
  );
}

const CSS = `
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
html, body { background: #f3f4f6; margin: 0; }
.sheet {
  max-width: 800px; margin: 24px auto; background: #fff; color: #1a1a1a;
  padding: 40px 44px; border-radius: 8px; box-shadow: 0 1px 8px rgba(0,0,0,.08);
  font-size: 13px; line-height: 1.5;
}
.head { display: flex; gap: 18px; align-items: flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 18px; }
.avatar { width: 84px; height: 84px; border-radius: 10px; object-fit: cover; border: 1px solid #e5e7eb; flex-shrink: 0; }
.head-main { flex: 1; min-width: 0; }
.name { font-size: 26px; font-weight: 700; margin: 0; letter-spacing: -.3px; }
.role { color: #1d4ed8; font-size: 15px; margin-top: 3px; }
.contacts { color: #4b5563; font-size: 12.5px; margin-top: 7px; }
.sources { color: #6b7280; font-size: 11px; margin-top: 4px; }
.sec { margin-bottom: 16px; break-inside: avoid; }
.sec h2 { font-size: 12px; font-weight: 700; color: #1d4ed8; text-transform: uppercase; letter-spacing: .6px; margin: 0 0 9px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px 18px; }
.field, .addr { min-width: 0; }
.addr { margin-top: 9px; }
.fl { font-size: 10px; color: #6b7280; margin-bottom: 1px; }
.fv { font-size: 13px; }
.entry { padding-left: 11px; border-left: 2px solid #e5e7eb; margin-bottom: 10px; break-inside: avoid; }
.et { font-weight: 700; font-size: 13px; }
.em { color: #6b7280; font-size: 11.5px; margin-top: 1px; }
.para { color: #374151; font-size: 12.5px; margin: 4px 0 0; white-space: pre-line; }
.skl { margin-bottom: 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
.chip { background: #eef2ff; color: #1d4ed8; font-size: 11.5px; padding: 2px 8px; border-radius: 5px; }
.foot { margin-top: 20px; padding-top: 8px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 10px; text-align: center; }
@media print {
  html, body { background: #fff; }
  .sheet { margin: 0; max-width: none; box-shadow: none; border-radius: 0; padding: 0; }
  .no-print { display: none !important; }
  .chip { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sec h2, .role { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;
