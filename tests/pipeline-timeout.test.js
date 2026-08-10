import test from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout } from '../src/pipeline.js';

test('login timeout aborts the pending operation and reports a human-readable error', async () => {
  let aborted = false;
  await assert.rejects(
    withTimeout(new Promise(() => {}), 10, 'login', { onTimeout: () => { aborted = true; } }),
    (error) => {
      assert.equal(error.code, 'LOGIN_TIMEOUT');
      assert.match(error.message, /เข้าสู่ระบบไม่สำเร็จ/);
      assert.match(error.message, /timeout:login:10ms/);
      return true;
    },
  );
  assert.equal(aborted, true);
});

test('completed operation clears its deadline without calling cleanup', async () => {
  let aborted = false;
  const result = await withTimeout(Promise.resolve('ok'), 50, 'login', { onTimeout: () => { aborted = true; } });
  assert.equal(result, 'ok');
  assert.equal(aborted, false);
});
