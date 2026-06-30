import test from 'node:test';
import assert from 'node:assert/strict';
import { extractChoiceContent } from '../aiClient.js';

test('extracts text from common OpenAI-compatible response shapes', () => {
  assert.equal(
    extractChoiceContent({ message: { content: '  {"ok":true}  ' } }),
    '{"ok":true}'
  );

  assert.equal(
    extractChoiceContent({ message: { content: [{ type: 'text', text: '{"ok":' }, { content: 'true}' }] } }),
    '{"ok":true}'
  );

  assert.equal(
    extractChoiceContent({ text: '{"ok":true}' }),
    '{"ok":true}'
  );
});

test('returns empty content when the provider sends no usable text', () => {
  assert.equal(extractChoiceContent({ message: { content: null }, finish_reason: 'stop' }), '');
});
