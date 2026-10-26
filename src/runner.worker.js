import { execute, preparePython } from './engine.mjs';
import { newVariant, newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import RELEASE_SYNC from '@jitl/quickjs-wasmfile-release-sync';
import wasmLocation from '@jitl/quickjs-wasmfile-release-sync/wasm?url';
import {executeSQL} from './sql-engine.mjs';
import sqlWasmLocation from 'sql.js/dist/sql-wasm.wasm?url';

// Reuse trusted compiled WASM, never a guest runtime or context.
const quickJSPromise = newQuickJSWASMModuleFromVariant(newVariant(RELEASE_SYNC, {wasmLocation}));
let pythonPromise, typescriptPromise, sqlPromise, preparedPython;
async function dependencies(language) {
  if (language === 'sql') {
    sqlPromise ||= import('sql.js').then(({default: init}) => init({locateFile: () => sqlWasmLocation}));
    return {SQL: await sqlPromise};
  }
  const quickJS = await quickJSPromise;
  if (language === 'python') {
    pythonPromise ||= Promise.all([import('skulpt/dist/skulpt.min.js?raw'), import('skulpt/dist/skulpt-stdlib.js?raw')]);
    const [python, stdlib] = await pythonPromise;
    return {quickJS, python:python.default, stdlib:stdlib.default};
  }
  if (language !== 'typescript') return {quickJS};
  typescriptPromise ||= import('typescript');
  const ts = (await typescriptPromise).default;
  return {quickJS, transpile:code => {
    const result = ts.transpileModule(code, {compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None},reportDiagnostics:true});
    const errors = result.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error)||[];
    if(errors.length) throw new Error(errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
    return result.outputText;
  }};
}
quickJSPromise.then(()=>self.postMessage({type:'ready'})).catch(e=>self.postMessage({type:'initialization-error',message:e.message}));
self.onmessage = async ({ data }) => {
  try {
    const deps = await dependencies(data.language);
    if(data.type==='prepare') {
      if(data.language==='python' && !preparedPython) preparedPython=preparePython(deps);
      return;
    }
    if(data.language==='python') { deps.preparedPython=preparedPython; preparedPython=null; }
    const result = data.language === 'sql' ? executeSQL(data.code, deps.SQL) : await execute(data, deps);
    self.postMessage({ type: 'result', result });
    if(data.language==='python') {
      try { preparedPython=preparePython(deps); } catch { /* next run can initialize normally */ }
    }
  } catch (e) { self.postMessage({ type: 'result', result: {status:'error',stdout:'',stderr:e.message,exitCode:1,duration:0} }); }
};
