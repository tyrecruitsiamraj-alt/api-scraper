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

function attachmentDownloaded(asset) {
  if (!asset || asset.kind !== 'attachment') return false;
  if (!asset.content || !asset.byte_size || asset.byte_size < 32) return false;
  return String(asset.download_status || '') === 'success';
}

function profileDownloaded(asset) {
  if (!asset || asset.kind !== 'profile') return false;
  if (!asset.content || !asset.byte_size || asset.byte_size < 32) return false;
  return String(asset.download_status || '') === 'success';
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

/**
 * Attachment completeness against listed resume links + downloaded assets.
 * Every JobBKK desk row must end with every listed file downloaded successfully
 * and at least one attachment. JobThai has no separate file attachments — profile
 * image is the required binary payload there.
 */
export function resumeAttachmentGaps(record = {}, assets = [], opts = {}) {
  const gaps = [];
  const platform = String(opts.platform || record.platform || record.source || '');
  const listed = Array.isArray(record.attachments) ? record.attachments.filter((a) => a?.source_url) : [];
  const list = Array.isArray(assets) ? assets : [];
  const downloaded = list.filter(attachmentDownloaded);

  if (/jobthai/i.test(platform)) {
    if (clean(record.profile_image_url) && !list.some(profileDownloaded)) gaps.push('profile');
    return gaps;
  }

  if (!listed.length) {
    gaps.push('attachments_missing');
  } else if (downloaded.length < listed.length) {
    gaps.push('attachments_incomplete');
  }

  if (clean(record.profile_image_url) && !list.some(profileDownloaded)) {
    gaps.push('profile');
  }

  return gaps;
}

export function isResumeBodyComplete(record = {}) {
  return resumeBodyGaps(record).length === 0;
}

export function isResumeAttachmentsComplete(record = {}, assets = [], opts = {}) {
  return resumeAttachmentGaps(record, assets, opts).length === 0;
}

/** Delivery-complete = body + contact + attachments. */
export function isResumeDeliveryComplete(record = {}, assets = [], opts = {}) {
  return isResumeBodyComplete(record)
    && resumeContactGaps(record).length === 0
    && isResumeAttachmentsComplete(record, assets, opts);
}
