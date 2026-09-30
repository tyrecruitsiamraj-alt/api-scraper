/**
 * Fail-closed completeness for scraped resumes.
 * Desk rows must always carry usable body fields; incomplete snapshots are skipped.
 */
import {
  hasUsefulEducation,
  hasUsefulWorkExperience,
} from '../providers/jobbkk/parser.js';

function clean(value) {
  return value == null ? '' : String(value).replace(/\s+/g, ' ').trim();
}

/**
 * Required body fields that every saved candidate row must have.
 * Contacts (phone/email) are checked separately after enrich — JobBKK may mask them.
 */
export function resumeBodyGaps(record = {}) {
  const gaps = [];
  if (!clean(record.name) && !clean(record.full_name)) gaps.push('name');
  if (!clean(record.gender)) gaps.push('gender');
  if (!clean(record.age) && !clean(record.birth_date)) gaps.push('age');
  if (!clean(record.address) && !clean(record.province) && !clean(record.desired_work_area)) {
    gaps.push('address');
  }
  if (!hasUsefulEducation(record.education)) gaps.push('education');
  if (!hasUsefulWorkExperience(record.work_experience)) gaps.push('work_experience');
  return gaps;
}

export function resumeContactGaps(record = {}) {
  const gaps = [];
  if (!clean(record.phone) && !clean(record.email)) gaps.push('contact');
  return gaps;
}

export function isResumeBodyComplete(record = {}) {
  return resumeBodyGaps(record).length === 0;
}

/** Delivery-complete = body + at least one contact channel. */
export function isResumeDeliveryComplete(record = {}) {
  return isResumeBodyComplete(record) && resumeContactGaps(record).length === 0;
}
