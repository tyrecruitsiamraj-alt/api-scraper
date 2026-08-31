import test from 'node:test';
import assert from 'node:assert/strict';
import { isEmployerSessionUrl } from '../src/providers/jobbkk/session.js';

test('JobBKK ยอมรับเฉพาะ URL ฝั่ง Employer ที่ Login จริง', () => {
  assert.equal(isEmployerSessionUrl('https://www.jobbkk.com/employer/dashboard'), true);
  assert.equal(isEmployerSessionUrl('https://www.jobbkk.com/employer/jobs'), true);
  assert.equal(isEmployerSessionUrl('https://www.jobbkk.com/home'), false);
  assert.equal(isEmployerSessionUrl('https://www.jobbkk.com/login/employer_login'), false);
  assert.equal(isEmployerSessionUrl('https://www.jobbkk.com/employer/noLogIn'), false);
});
