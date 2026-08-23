import assert from 'node:assert/strict';
import test from 'node:test';
import DOMPurify from 'isomorphic-dompurify';

import {
  ensureDriversLicenseSection,
  mergePlaceholders,
} from '../server/services/contract-template';

const PNG_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
const JPEG_DATA_URI = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

test('mergePlaceholders preserves validated raster data URIs for contract images', () => {
  const html = [
    '<img alt="signature" src="{{signature_image_url}}">',
    '<img alt="id" src="{{drivers_license_image_url}}">',
  ].join('');

  const merged = mergePlaceholders(html, {
    signature_image_url: PNG_DATA_URI,
    drivers_license_image_url: JPEG_DATA_URI,
  });

  assert.match(merged, new RegExp(PNG_DATA_URI.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(merged, new RegExp(JPEG_DATA_URI.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('mergePlaceholders continues to block unsafe image sources', () => {
  const html = [
    '<img alt="signature" src="{{signature_image_url}}">',
    '<img alt="id" src="{{drivers_license_image_url}}">',
  ].join('');

  const merged = mergePlaceholders(html, {
    signature_image_url: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    drivers_license_image_url: 'javascript:alert(1)',
  });

  assert.doesNotMatch(merged, /data:image\/svg\+xml/);
  assert.doesNotMatch(merged, /javascript:/);
});

test('ensureDriversLicenseSection appends an ID appendix to legacy templates', () => {
  const legacyTemplate = '<html><body><h1>Agreement</h1></body></html>';
  const updatedTemplate = ensureDriversLicenseSection(legacyTemplate, true);
  const merged = mergePlaceholders(updatedTemplate, {
    drivers_license_image_url: JPEG_DATA_URI,
  });
  const sanitized = DOMPurify.sanitize(merged, {
    ALLOWED_TAGS: ['html', 'head', 'body', 'title', 'meta', 'style', 'link', 'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'u', 'br', 'hr', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'a'],
    ALLOWED_ATTR: ['class', 'id', 'style', 'href', 'src', 'alt', 'title', 'target', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false,
    ADD_DATA_URI_TAGS: ['img'],
  });

  assert.equal((sanitized.match(/class="uploaded-identification"/g) || []).length, 1);
  assert.match(sanitized, /page-break-before:\s*always/);
  assert.match(sanitized, /Uploaded Identification/);
  assert.match(sanitized, /data:image\/jpeg;base64/);
});

test('ensureDriversLicenseSection does not duplicate a tenant-provided ID section', () => {
  const customTemplate = '<img src="{{drivers_license_image_url}}" alt="ID">';
  assert.equal(ensureDriversLicenseSection(customTemplate, true), customTemplate);
  assert.equal(ensureDriversLicenseSection('<p>No ID</p>', false), '<p>No ID</p>');
});