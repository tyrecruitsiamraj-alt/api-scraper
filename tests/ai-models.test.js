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
