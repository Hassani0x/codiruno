import fs from 'node:fs';
import ts from 'typescript';
import {getQuickJS} from 'quickjs-emscripten';
import {execute} from '../src/engine.mjs';
const quickJS=await getQuickJS();
const python=fs.readFileSync('node_modules/skulpt/dist/skulpt.min.js','utf8');
const stdlib=fs.readFileSync('node_modules/skulpt/dist/skulpt-stdlib.js','utf8');
const options={quickJS,python,stdlib,transpile:code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText};
for(const [language,code] of [['javascript','console.log(42)'],['typescript','const x: number = 42; console.log(x)'],['python','print(42)']]){
 const times=[];for(let i=0;i<5;i++){const r=await execute({language,code},options);if(r.stdout!=='42\n'||r.status!=='success')throw Error(JSON.stringify(r));times.push(r.duration);}
 console.log(JSON.stringify({language,ms:times}));
}
const init=[];
for(let i=0;i<5;i++){const vm=quickJS.newContext();const start=performance.now();for(const source of [python,stdlib]){const r=vm.evalCode(source);if(r.error)throw Error('init failed');r.value.dispose();}init.push(Math.round(performance.now()-start));vm.dispose();}
console.log(JSON.stringify({pythonInterpreterInitializationMs:init}));
import {preparePython} from '../src/engine.mjs';
const preparedTimes=[];
for(let i=0;i<5;i++){const preparedPython=preparePython(options);const r=await execute({language:'python',code:'print(42)'},{...options,preparedPython});if(r.stdout!=='42\n')throw Error(r.stderr);preparedTimes.push(r.duration);}
console.log(JSON.stringify({preparedPythonMs:preparedTimes}));
