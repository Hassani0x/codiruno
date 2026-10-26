import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getQuickJS} from 'quickjs-emscripten';
import {execute,preparePython} from '../src/engine.mjs';
const quickJS=await getQuickJS();
const deps={quickJS,python:fs.readFileSync('node_modules/skulpt/dist/skulpt.min.js','utf8'),stdlib:fs.readFileSync('node_modules/skulpt/dist/skulpt-stdlib.js','utf8')};
test('pristine prepared Python computes with input and is single use',async()=>{
 const preparedPython=preparePython(deps);
 const r=await execute({language:'python',code:'print(int(input()) * 7)',stdin:'6'},{...deps,preparedPython});
 assert.equal(r.stdout,'42\n',r.stderr);assert.equal(r.status,'success');
 await assert.rejects(execute({language:'python',code:'print(1)'},{...deps,preparedPython}),/already consumed/);
});
test('prepared Python preserves isolation after mutation and errors',async()=>{
 for(const code of ['import math\nmath.leaked = 42','raise ValueError("bad")']){
  await execute({language:'python',code},{...deps,preparedPython:preparePython(deps)});
  const r=await execute({language:'python',code:'import math\nprint(hasattr(math, "leaked"))\nprint(42)'},{...deps,preparedPython:preparePython(deps)});
  assert.equal(r.stdout,'False\n42\n',r.stderr);
 }
});
test('prepared Python still interrupts infinite loops',async()=>{
 const r=await execute({language:'python',code:'while True: pass'},{...deps,preparedPython:preparePython(deps)});
 assert.equal(r.status,'timeout');
});

