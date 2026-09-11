import test from 'node:test';
import assert from 'node:assert/strict';
import { isEmployerSessionUrl, isSessionTakeoverPrompt } from '../src/providers/jobbkk/session.js';

test('JobBKK ยอมรับเฉพาะ URL ฝั่ง Employer ที่ Login จริง', () => {
  assert.equal(isEmployerSessionUrl('https://www.jobbkk.com/employer/dashboard'), true);
  assert.equal(isEmployerSessionUrl('https://www.jobbkk.com/dashboard/employer'), true);
  assert.equal(isEmployerSessionUrl('https://www.jobbkk.com/employer/jobs'), true);
  assert.equal(isEmployerSessionUrl('https://www.jobbkk.com/home'), false);
  assert.equal(isEmployerSessionUrl('https://www.jobbkk.com/login/employer_login'), false);
  assert.equal(isEmployerSessionUrl('https://www.jobbkk.com/employer/noLogIn'), false);
});


test('JobBKK แย่ง session เมื่อบัญชีล็อกอินที่อื่น — กดยืนยันเสมอ', () => {
  assert.equal(isSessionTakeoverPrompt('รหัสผู้ใช้งานนี้ได้ถูกใช้งานอยู่ในระบบ กรุณากดปุ่มยืนยัน'), true);
  assert.equal(isSessionTakeoverPrompt('logged in elsewhere'), true);
  assert.equal(isSessionTakeoverPrompt('ค้นหาผู้สมัคร'), false);
});
