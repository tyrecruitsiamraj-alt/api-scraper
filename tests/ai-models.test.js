import test from 'node:test';
import assert from 'node:assert/strict';
import { isCloudModel, orderOcrModels, orderTextModels } from '../src/core/ai-models.js';

// รายชื่อโมเดลบนเซิร์ฟเวอร์จริง ณ 30 ต.ค. 2569
const SERVER_NOW = ['deepseek-v4.1-flash:cloud', 'muse-spark-open:cloud', 'beam:cloud', 'glm-5.3:cloud'];

test('รู้ว่าโมเดลไหนเป็น cloud', () => {
  assert.equal(isCloudModel('glm-5.3:cloud'), true);
  assert.equal(isCloudModel('qwen3.5:9b'), false);
  assert.equal(isCloudModel('scb10x/typhoon-ocr1.5-3b:latest'), false);
});

test('แปลงเนื้องาน: โมเดลที่ตั้งไว้หายไป → ใช้ cloud ที่มีอยู่จริง', () => {
  const order = orderTextModels(SERVER_NOW, ['qwen3.5:9b']);
  assert.deepEqual(order, SERVER_NOW);
});

test('แปลงเนื้องาน: ที่ตั้งไว้ก่อน แล้วในบริษัท แล้ว cloud · ไม่เอาโมเดล OCR/embedding', () => {
  const available = ['glm-5.3:cloud', 'llama3:8b', 'scb10x/typhoon-ocr1.5-3b:latest', 'nomic-embed-text', 'qwen3.5:9b'];
  assert.deepEqual(orderTextModels(available, ['qwen3.5:9b']), ['qwen3.5:9b', 'llama3:8b', 'glm-5.3:cloud']);
});

test('OCR: ห้ามใช้ cloud — เซิร์ฟเวอร์ตอนนี้ไม่มีโมเดลให้ใช้', () => {
  assert.deepEqual(orderOcrModels(SERVER_NOW, ['scb10x/typhoon-ocr1.5-3b:latest']), []);
  assert.deepEqual(orderOcrModels(['ocr-model:cloud'], []), []);
});

test('OCR: ที่ตั้งไว้ก่อน แล้วโมเดลในบริษัทที่ชื่อมี ocr', () => {
  const available = ['glm-5.3:cloud', 'other-ocr:2b', 'scb10x/typhoon-ocr1.5-3b:latest', 'llama3:8b'];
  assert.deepEqual(orderOcrModels(available, ['scb10x/typhoon-ocr1.5-3b:latest']), ['scb10x/typhoon-ocr1.5-3b:latest', 'other-ocr:2b']);
});

test('แปลงเนื้องาน: โมเดลที่ตอบ 402 ข้ามไปตัวถัดไปโดยไม่นับรอบ จนเจอตัวที่ใช้ได้', async () => {
  const { withTextModel } = await import('../src/core/ai-models.js');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ models: SERVER_NOW.map((name) => ({ name })) }) });
  process.env.OLLAMA_HOST = 'http://ai.test';
  try {
    const tried = [];
    const out = await withTextModel(async (model) => {
      tried.push(model);
      if (model !== 'beam:cloud') throw new Error('ollama HTTP 402');
      return model;
    });
    assert.equal(out, 'beam:cloud');
    assert.deepEqual(tried, ['deepseek-v4.1-flash:cloud', 'muse-spark-open:cloud', 'beam:cloud']);
    // รอบถัดไปไม่ลองตัวที่ตอบ 402 แล้ว
    const again = [];
    await withTextModel(async (model) => { again.push(model); return model; });
    assert.deepEqual(again, ['beam:cloud']);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.OLLAMA_HOST;
  }
});

test('แปลงเนื้องาน: ล้มแบบช้า/ตอบผิดรูป ลองไม่เกิน 3 ตัว', async () => {
  const { orderTextModels } = await import('../src/core/ai-models.js');
  const { withTextModel } = await import('../src/core/ai-models.js?slow');
  const realFetch = globalThis.fetch;
  const five = ['a:cloud', 'b:cloud', 'c:cloud', 'd:cloud', 'e:cloud'];
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ models: five.map((name) => ({ name })) }) });
  process.env.OLLAMA_HOST = 'http://ai2.test';
  try {
    const tried = [];
    await assert.rejects(withTextModel(async (model) => { tried.push(model); throw new Error('ollama ตอบไม่ใช่ JSON'); }));
    assert.deepEqual(tried, orderTextModels(five, []).slice(0, 3));
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.OLLAMA_HOST;
  }
});
