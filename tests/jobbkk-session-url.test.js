import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isEmployerSessionUrl,
  isSessionTakeoverPrompt,
  htmlHasEmployerLoginForm,
  classifyLoginPageHint,
} from '../src/providers/jobbkk/session.js';

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
  assert.equal(isSessionTakeoverPrompt('บัญชีนี้ถูกใช้งานจากอุปกรณ์อื่น'), true);
  assert.equal(isSessionTakeoverPrompt('logged in elsewhere'), true);
  assert.equal(isSessionTakeoverPrompt('ค้นหาผู้สมัคร'), false);
});

test('JobBKK ตรวจฟอร์มล็อกอินได้ทั้งแบบเก่าและ Ant Design', () => {
  assert.equal(htmlHasEmployerLoginForm('<input name="username_emp" id="username_emp">'), true);
  assert.equal(
    htmlHasEmployerLoginForm('<input id="username" name="username"/><input id="password" name="password"/>'),
    true,
  );
  assert.equal(htmlHasEmployerLoginForm('<h1>employer dashboard</h1>'), false);
});

test('JobBKK แยกข้อความ error บนหน้า login ให้ชัด', () => {
  assert.equal(
    classifyLoginPageHint('ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง'),
    'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
  );
  assert.equal(
    classifyLoginPageHint('รหัสผู้ใช้งานนี้ได้ถูกใช้งานอยู่ในระบบ กรุณากดปุ่มยืนยัน'),
    'บัญชีล็อกอินซ้อน — ต้องกดยืนยันแย่ง session',
  );
  assert.equal(classifyLoginPageHint('ค้นหาผู้สมัคร'), null);
});
