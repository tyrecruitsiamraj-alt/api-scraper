// Options for the scrape-task filter form. Values are Thai strings that the
// JobBKK premium-search automation matches against the site's own popovers
// (see src/providers/jobbkk/browser/resume-premium-search.js). Matching is
// fuzzy (includes both ways) so these labels don't need to be pixel-exact.

export const GENDERS = ['ไม่ระบุ', 'ชาย', 'หญิง'] as const;

// Minimum education level. The scraper treats this as the lower bound and
// searches up to the highest degree.
export const EDUCATION_LEVELS = [
  'ไม่ระบุ',
  'มัธยมศึกษาตอนต้น',
  'มัธยมศึกษาตอนปลาย',
  'ปวช.',
  'ปวส./อนุปริญญา',
  'ปริญญาตรี',
  'ปริญญาโท',
  'ปริญญาเอก',
] as const;

// Common JobBKK salary brackets (baht/month). Matched by value on the site.
export const SALARY_STEPS = [
  '10000',
  '15000',
  '20000',
  '25000',
  '30000',
  '35000',
  '40000',
  '50000',
  '60000',
  '70000',
  '80000',
  '100000',
] as const;

export const SALARY_LABELS: Record<string, string> = {
  '10000': '10,000',
  '15000': '15,000',
  '20000': '20,000',
  '25000': '25,000',
  '30000': '30,000',
  '35000': '35,000',
  '40000': '40,000',
  '50000': '50,000',
  '60000': '60,000',
  '70000': '70,000',
  '80000': '80,000',
  '100000': '100,000+',
};

// All 77 Thai provinces (from src/providers/jobbkk/provinces.json). Used for a
// datalist so the user can pick or type; the scraper resolves the name.
export const PROVINCES = [
  'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี',
  'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด',
  'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี',
  'นราธิวาส', 'น่าน', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์', 'ปราจีนบุรี', 'ปัตตานี',
  'พระนครศรีอยุธยา', 'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์',
  'แพร่', 'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร', 'ยะลา', 'ร้อยเอ็ด', 'ระนอง',
  'ระยอง', 'ราชบุรี', 'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล',
  'สมุทรปราการ', 'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย',
  'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู', 'อ่างทอง', 'อำนาจเจริญ',
  'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี', 'บึงกาฬ',
] as const;
