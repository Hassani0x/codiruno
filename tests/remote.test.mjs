import test from 'node:test';
import assert from 'node:assert/strict';
import { executeRemote, COMPILER_IDS } from '../src/remote.mjs';

const input = { compiler: COMPILER_IDS.c, code: 'int main(){}', stdin: 'hello' };
test('remote request excludes credentials and public saving, preserves actual output', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://wandbox.org/api/compile.json');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.referrerPolicy, 'no-referrer');
    assert.deepEqual(JSON.parse(options.body), { ...input, save: false });
    return { ok: true, json: async () => ({ status: '0', signal: '', program_output: '42\n', program_error: '' }) };
  });
  const result = await executeRemote(input);
  assert.equal(result.stdout, '42\n'); assert.equal(result.status, 'success'); assert.equal(result.exitCode, 0);
  assert.ok(result.duration >= 0);
});
test('remote compile errors and rate limits stay actionable', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ status: '1', compiler_error: 'syntax error' }) }));
  assert.equal((await executeRemote(input)).stderr, 'syntax error');
  mock.mock.mockImplementation(async () => ({ ok: false, status: 429 }));
  const result = await executeRemote(input);
  assert.equal(result.status, 'error'); assert.match(result.stderr, /wait a minute/);
});
test('remote output cap bounds combined UTF-8 output without corrupting characters', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ status: '0', program_output: '😀'.repeat(9000), program_error: 'also limited' }) }));
  const result = await executeRemote(input);
  assert.equal(result.status, 'output-limit'); assert.equal(result.truncated, true);
  assert.ok(new TextEncoder().encode(result.stdout + result.stderr).length <= 32768);
  assert.ok(!result.stdout.includes('�'));
});
test('rejects oversized source and input before any network request', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', () => { throw new Error('must not fetch'); });
  await assert.rejects(executeRemote({ ...input, code: 'é'.repeat(32769) }), /64 KB/);
  await assert.rejects(executeRemote({ ...input, stdin: 'x'.repeat(16385) }), /16 KB/);
  assert.equal(mock.mock.callCount(), 0);
});
test('cancelled request and malformed provider response do not report success', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async (_url, options) => {
    if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return { ok: true, json: async () => ({ error: 'unavailable' }) };
  });
  assert.equal((await executeRemote(input)).status, 'error');
  const controller = new AbortController(); controller.abort();
  assert.equal((await executeRemote(input, controller.signal)).status, 'cancelled');
});
