/**
 * Converts a verified job specification into a non-negotiable visual contract.
 * The image model may choose lighting and composition, but may not change the role.
 */
const ROLE_PROFILES = [
  {
    match: /(?:พนักงาน)?ขับรถ|driver|chauffeur|valet/i,
    key: 'driver',
    subject: 'a Thai professional driver in a neat company uniform beside a clean passenger vehicle',
    props: ['passenger vehicle', 'driver seat', 'steering wheel'],
    forbidden: ['nurse uniform', 'medical scrubs', 'stethoscope', 'hospital ward', 'doctor', 'medical clinic'],
  },
  {
    match: /พยาบาล|nurse/i,
    key: 'nurse',
    subject: 'a Thai professional nurse in an appropriate clinical uniform in a clean healthcare setting',
    props: ['clinical uniform', 'healthcare setting'],
    forbidden: ['steering wheel', 'driver uniform', 'taxi'],
  },
  {
    match: /รปภ|รักษาความปลอดภัย|security/i,
    key: 'security',
    subject: 'a Thai security guard in a professional security uniform at a building entrance',
    props: ['security uniform', 'building entrance'],
    forbidden: ['medical scrubs', 'stethoscope', 'chef uniform'],
  },
  {
    match: /ช่าง|technician|electrician|maintenance/i,
    key: 'technician',
    subject: 'a Thai maintenance technician wearing appropriate safety PPE at a real work site',
    props: ['safety PPE', 'tools appropriate to the role'],
    forbidden: ['medical scrubs', 'stethoscope', 'driver seat'],
  },
];

function textOf(spec = {}) {
  return [spec.position, spec.title, spec.familyLabel, spec.family].filter(Boolean).join(' ');
}

export function buildVisualBrief(spec = {}, { style = '', feedback = '' } = {}) {
  const role = ROLE_PROFILES.find((profile) => profile.match.test(textOf(spec))) ?? {
    key: 'generic-workplace',
    subject: `a Thai worker performing the verified role: ${String(spec.position || spec.title || 'worker')}`,
    props: ['realistic workplace relevant to the verified role'],
    forbidden: ['medical scrubs', 'stethoscope', 'unrelated occupation uniform'],
  };
  return {
    version: 1,
    role: role.key,
    verified_position: String(spec.position || spec.title || '').trim(),
    subject: role.subject,
    required_elements: role.props,
    forbidden_elements: role.forbidden,
    composition: 'single full-body subject, portrait on the right side, leave clean negative space on the left for the poster text',
    constraints: ['Thai person', 'photorealistic', 'no text, letters, logos, labels, signage, or QR codes'],
    style: String(style).trim(),
    feedback: String(feedback).trim(),
  };
}

export function composeVisualPrompt(brief, modelSuggestion = '') {
  const sections = [
    `Create exactly this verified recruitment visual. Role: ${brief.verified_position || brief.role}.`,
    `Subject: ${brief.subject}.`,
    `Required visible elements: ${brief.required_elements.join(', ')}.`,
    `Composition: ${brief.composition}.`,
    `Never show: ${brief.forbidden_elements.join(', ')}.`,
    `Constraints: ${brief.constraints.join(', ')}.`,
    brief.style ? `Art direction: ${brief.style}.` : '',
    brief.feedback ? `Revision feedback to obey: ${brief.feedback}.` : '',
    modelSuggestion ? `Optional aesthetic suggestion (must never override the verified role): ${modelSuggestion}.` : '',
  ];
  return sections.filter(Boolean).join(' ');
}
