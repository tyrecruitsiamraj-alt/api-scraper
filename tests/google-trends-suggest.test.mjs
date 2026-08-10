import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGoogleTrendsSuggestions, pickRelevantSuggestions } from '../src/core/google-trends-suggest.js';

test('parses Google Trends XSSI autocomplete response and removes duplicates', () => {
  const items = parseGoogleTrendsSuggestions(")]}'\n{\"default\":{\"topics\":[{\"title\":\"พนักงานขับรถ\",\"type\":\"ข้อความค้นหา\"},{\"title\":\"พนักงานขับรถยก\",\"type\":\"วิชาชีพ\"},{\"title\":\"พนักงานขับรถ\",\"type\":\"ข้อความค้นหา\"}]}}");
  assert.deepEqual(items.map((x) => x.keyword), ['พนักงานขับรถ', 'พนักงานขับรถยก']);
  assert.equal(items[1].rank, 2);
});

test('keeps only job-family suggestions and blocks obvious noise', () => {
  const items = pickRelevantSuggestions([
    { keyword: 'พนักงานขับรถยก' }, { keyword: 'รถบัส เกมออฟโร้ด' }, { keyword: 'พนักงานขับรถพยาบาล' }, { keyword: 'บริการพนักงานขับรถ' }, { keyword: 'สโตนเฮนจ์และบาธ เที่ยวชมพร้อมคนขับรถส่วนตัว' },
  ], { include: ['ขับรถ', 'คนขับ', 'รถ'], exclude: ['เกม', 'ออฟโร้ด', 'พยาบาล', 'สโตนเฮนจ์', 'เที่ยว'] });
  assert.deepEqual(items.map((x) => x.keyword), ['พนักงานขับรถยก', 'บริการพนักงานขับรถ']);
});

test('requires a position phrase, not merely a broad family word', () => {
  const items = pickRelevantSuggestions([
    { keyword: 'ค้อนช่างไฟฟ้า น้ำหนักหัว 18 ออนซ์' }, { keyword: 'ช่างไฟฟ้ารถยนต์' }, { keyword: 'คู่มือช่างไฟฟ้า' },
  ], { include: ['ช่างไฟฟ้า', 'ช่างซ่อมบำรุง'], exclude: ['ค้อน', 'เครื่องมือ', 'คู่มือ'] });
  assert.deepEqual(items.map((x) => x.keyword), ['ช่างไฟฟ้ารถยนต์']);
});
