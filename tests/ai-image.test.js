import test from 'node:test';
import assert from 'node:assert/strict';

test('image generation retries one network failure with the same idempotency key', async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.OPENAI_API_KEY;
  const oldModel = process.env.CONTENT_IMAGE_MODEL;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.CONTENT_IMAGE_MODEL = 'gpt-image-2';
  const keys = [];
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    keys.push(options.headers['Idempotency-Key']);
    if (calls === 1) {
      const error = new TypeError('fetch failed');
      error.cause = { code: 'ECONNRESET' };
      throw error;
    }
    return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('image').toString('base64') }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const { generateImage } = await import('../src/core/ai-image.js');
    const result = await generateImage({ prompt: 'verified job visual', strict: true });
    assert.equal(result.bytes.toString(), 'image');
    assert.equal(calls, 2);
    assert.equal(keys[0], keys[1]);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.CONTENT_IMAGE_MODEL; else process.env.CONTENT_IMAGE_MODEL = oldModel;
  }
});
