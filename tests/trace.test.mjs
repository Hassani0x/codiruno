import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execute } from '../src/engine.mjs';

const options = { python: fs.readFileSync('node_modules/skulpt/dist/skulpt.min.js','utf8'), stdlib: fs.readFileSync('node_modules/skulpt/dist/skulpt-stdlib.js','utf8') };
const run = (code, stdin = '') => execute({ language: 'python', code, stdin, visualize: true }, options);

test('trace records actual pre-statement state and final output', async () => {
  const r = await run('x = int(input())\nx += 3\nprint(x)', '7');
  assert.equal(r.status, 'success', r.stderr);
  assert.deepEqual(r.trace.map(s => s.line), [1, 2, 3, null]);
  assert.equal(r.trace[1].variables.x, '7');
  assert.equal(r.trace[2].variables.x, '10');
  assert.equal(r.trace[2].stdout, '');
  assert.equal(r.trace.at(-1).stdout, '10\n');
  assert.equal(r.trace.at(-1).done, true);
});

test('trace follows real branches, loops and function-local state', async () => {
  const r = await run('def double(n):\n    answer = n * 2\n    return answer\nfor i in range(2):\n    x = double(i)\n    print(x)\nif False:\n    print("unreachable")');
  assert.equal(r.status, 'success', r.stderr);
  assert.equal(r.stdout, '0\n2\n');
  assert.equal(r.trace.filter(s => s.line === 2).length, 2);
  assert.equal(r.trace.find(s => s.line === 3 && s.variables.n === '1').variables.answer, '2');
  assert.equal(r.trace.some(s => s.line === 8), false);
  assert.equal(r.traceTruncated, false);
});

test('trace cap does not stop program execution or pretend it completed early', async () => {
  const r = await run('total = 0\nfor i in range(300):\n    total += i\nprint(total)');
  assert.equal(r.status, 'success', r.stderr);
  assert.equal(r.stdout, '44850\n');
  assert.equal(r.trace.length, 200);
  assert.equal(r.traceTruncated, true);
  assert.equal(r.trace.some(s => s.done), false);
});

test('trace keeps partial evidence when execution fails', async () => {
  const r = await run('x = 5\nprint(x)\ny = 1 / 0');
  assert.equal(r.status, 'error');
  assert.match(r.stderr, /ZeroDivision/);
  assert.equal(r.trace.at(-1).variables.x, '5');
  assert.equal(r.trace.at(-1).stdout, '5\n');
  assert.equal(r.trace.some(s => s.done), false);
});

test('trace formatting is bounded and never runs user repr', async () => {
  const r = await run('class Trap:\n    def __repr__(self):\n        print("bad repr")\n        return "trap"\nx = Trap()\na = list(range(1000))\ns = "a" * 1000\nprint("finished")');
  assert.equal(r.status, 'success', r.stderr);
  assert.equal(r.stdout, 'finished\n');
  assert.ok(r.trace.at(-1).variables.a.length < 260);
  assert.ok(r.trace.at(-1).variables.s.length < 210);
});

test('visualization remains interruptible after trace cap', async () => {
  const r = await run('while True:\n    pass');
  assert.equal(r.status, 'timeout', r.stderr);
  assert.equal(r.trace.length, 200);
  assert.equal(r.traceTruncated, true);
});
