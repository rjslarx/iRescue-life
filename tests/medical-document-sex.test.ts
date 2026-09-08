import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { db } from '../server/db';
import { generateMedicalHistoryPDF } from '../server/services/medical-history-pdf';
import { generateAdoptionPacketPDF } from '../server/services/adoption-packet-pdf';

test('both medical PDF generators render profile gender rather than Unknown', async (t) => {
  let html = '';
  t.mock.method(puppeteer, 'launch', async () => ({
    newPage: async () => ({
      setContent: async (content: string) => { html = content; },
      pdf: async () => Buffer.from('test-pdf'),
    }),
    close: async () => {},
  }));

  for (const generate of [generateMedicalHistoryPDF, generateAdoptionPacketPDF]) {
    for (const gender of ['Male', 'Female']) {
      let queryIndex = 0;
      const select = t.mock.method(db, 'select', () => {
        const rows = queryIndex++ === 0
          ? [{ id: 'test-animal', name: 'Test Animal', species: 'Dog', sex: null, petfinderGender: gender }]
          : queryIndex === 2 ? [{ name: 'Test Rescue' }] : [];
        const query = Object.assign(Promise.resolve(rows), {
          from: () => query,
          where: () => query,
          limit: () => query,
          orderBy: () => query,
        });
        return query;
      });
      try {
        const pdf = await generate('test-animal', 'test-tenant');
        assert.ok(Buffer.isBuffer(pdf));
        assert.match(html, new RegExp(`<strong>Sex:</strong>\\s*(?:<span>)?${gender}`));
        assert.doesNotMatch(html, /<strong>Sex:<\/strong>\s*(?:<span>)?Unknown/);
      } finally {
        select.mock.restore();
      }
    }
  }
});