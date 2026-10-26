import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import RELEASE_SYNC from '@jitl/quickjs-wasmfile-release-sync';

export const LIMITS = Object.freeze({ timeMs: 5000, memory: 64 * 1024 * 1024, source: 65536, input: 16384, output: 32768 });
export async function execute({ language, code, stdin = '', visualize = false }, { python = '', stdlib = '', transpile, quickJS } = {}) {
  const started = performance.now();
  if (!['python', 'javascript', 'typescript'].includes(language)) throw new Error('Unsupported language.');
  if (typeof code !== 'string' || typeof stdin !== 'string') throw new Error('Code and input must be text.');
  if (new TextEncoder().encode(code).length > LIMITS.source) throw new Error('Code exceeds the 64 KB limit.');
  if (new TextEncoder().encode(stdin).length > LIMITS.input) throw new Error('Input exceeds the 16 KB limit.');
  const Q = quickJS || await newQuickJSWASMModuleFromVariant(RELEASE_SYNC);
  const runtime = Q.newRuntime();
  runtime.setMemoryLimit(LIMITS.memory);
  runtime.setMaxStackSize(512 * 1024);
  let deadline = Date.now() + 10000;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const vm = runtime.newContext();
  let stdout = '', stderr = '', status = 'success', overflow = false;
  const trace = [];
  let traceTruncated = false;
  const lines = stdin.replace(/\r\n/g, '\n').split('\n');
  if (!stdin.length) lines.length = 0;
  else if (stdin.endsWith('\n')) lines.pop();
  let line = 0;
  const bind = (name, fn) => { const handle = vm.newFunction(name, fn); vm.setProp(vm.global, name, handle); handle.dispose(); };
  bind('__write', (text, error) => {
    const value = vm.getString(text);
    const remaining = LIMITS.output - stdout.length - stderr.length;
    if (value.length > remaining) overflow = true;
    const part = value.slice(0, Math.max(0, remaining));
    if (vm.getNumber(error)) stderr += part; else stdout += part;
    if (overflow) return { error: vm.newError('Output limit exceeded (32,768 characters).') };
    return vm.undefined;
  });
  bind('__read', () => line < lines.length ? vm.newString(lines[line++]) : vm.null);
  bind('__trace', value => {
    if (trace.length >= 200) { traceTruncated = true; return vm.undefined; }
    const step = JSON.parse(vm.getString(value));
    trace.push({ ...step, stdout });
    return vm.undefined;
  });
  const evalText = (source, filename) => {
    const result = vm.evalCode(source, filename);
    if (result.error) {
      const obj = vm.dump(result.error); result.error.dispose();
      throw new Error(typeof obj === 'object' ? `${obj.name || 'Error'}: ${obj.message || ''}${obj.stack ? '\n' + obj.stack : ''}` : String(obj));
    }
    result.value.dispose();
  };
  try {
    evalText(`var global = globalThis;
      const format = x => typeof x === 'string' ? x : typeof x === 'object' ? JSON.stringify(x) : String(x);
      const write = (items, error) => __write(items.map(format).join(' ').slice(0, ${LIMITS.output + 1}) + '\\n', error);
      globalThis.console = Object.freeze({log: (...x) => write(x, 0), info: (...x) => write(x, 0), warn: (...x) => write(x, 1), error: (...x) => write(x, 1)});
      globalThis.readline = () => __read();
      globalThis.input = (prompt = '') => { if(prompt) __write(String(prompt).slice(0, ${LIMITS.output + 1}), 0); return __read(); };
    `, 'codiruno-runtime.js');
    if (language === 'python') {
      if (!python || !stdlib) throw new Error('Python runtime is unavailable. Reload and try again.');
      evalText(python, 'skulpt.js'); evalText(stdlib, 'stdlib.js');
      evalText(`Sk.configure({__future__: Sk.python3, output: text => __write(String(text).slice(0, ${LIMITS.output + 1}), 0),
        read: path => { if (!Object.hasOwn(Sk.builtinFiles.files, path)) throw new Error('Module not available: ' + path); return Sk.builtinFiles.files[path]; },
        inputfun: prompt => { if(prompt) __write(String(prompt).slice(0, ${LIMITS.output + 1}), 0); const v = __read(); if(v === null) throw new Error('End of input. Add a line to Program input.'); return v; }, inputfunTakesPrompt: true,
        debugging: ${!!visualize}, breakpoints: filename => filename === '<stdin>.py',
        execLimit: ${LIMITS.timeMs}, yieldLimit: null});`, 'python-config.js');
      deadline = Date.now() + LIMITS.timeMs;
      if (visualize) {
        // Values come from actual suspended Python frames. Never invoke user __repr__.
        evalText(`
          const traceValue = (v, depth = 0) => {
            if (v === undefined) return '<unassigned>';
            if (v === Sk.builtin.none.none$) return 'None';
            const type = v && v.tp$name;
            if (type === 'str') return JSON.stringify(v.v.slice(0, 180)) + (v.v.length > 180 ? '…' : '');
            if (type === 'bool') return v.v ? 'True' : 'False';
            if (type === 'int' || type === 'float') return String(v.v).slice(0, 200);
            if ((type === 'list' || type === 'tuple') && depth < 2) {
              const parts = v.v.slice(0, 8).map(item => traceValue(item, depth + 1));
              if (v.v.length > 8) parts.push('…');
              return (type === 'list' ? '[' : '(') + parts.join(', ').slice(0, 240) + (type === 'list' ? ']' : ')');
            }
            return '<' + (type || 'value') + '>';
          };
          let traceCount = 0;
          const snapshot = (frame, done = false) => {
            const variables = Object.create(null);
            const source = Object.assign({}, frame.$loc || {}, frame.$tmps || {});
            for (const key of Object.keys(source)) {
              const name = Sk.unfixReserved(key);
              if (name.includes('$') || name.startsWith('__') || source[key] === undefined) continue;
              if (Object.keys(variables).length >= 30) break;
              variables[name] = traceValue(source[key]);
            }
            __trace(JSON.stringify({line: done ? null : frame.$lineno, variables, done}));
          };
          try {
            let result = Sk.importMainWithBody('<stdin>', false, ${JSON.stringify(code)}, true);
            while (result && result.$isSuspension) {
              let frame = result, selected = null;
              while (frame) {
                if (frame.$filename === '<stdin>.py' && frame.$lineno) selected = frame;
                frame = frame.child;
              }
              if (selected && traceCount <= 200) { snapshot(selected); traceCount++; }
              result = result.resume();
            }
            if (traceCount <= 200) snapshot({$loc: result && result.$d}, true);
          } catch(e) { throw new Error(e.toString()); }
        `, 'main.py');
      } else {
        evalText(`try { Sk.importMainWithBody('<stdin>', false, ${JSON.stringify(code)}, false); } catch(e) { throw new Error(e.toString()); }`, 'main.py');
      }
    } else {
      if (language === 'typescript') {
        if (!transpile) throw new Error('TypeScript compiler is unavailable.');
        code = transpile(code);
      }
      deadline = Date.now() + LIMITS.timeMs;
      evalText(code, language === 'typescript' ? 'main.ts' : 'main.js');
      while (runtime.hasPendingJob()) {
        if (Date.now() > deadline) throw new Error('Execution timed out.');
        const job = runtime.executePendingJobs(1);
        if (job.error) { const err = vm.dump(job.error); job.error.dispose(); throw new Error(err.message || 'Async execution failed.'); }
      }
    }
  } catch (e) {
    status = overflow ? 'output-limit' : Date.now() > deadline || /time limit|interrupted|timed out/i.test(e.message) ? 'timeout' : /out of memory/i.test(e.message) ? 'memory-limit' : 'error';
    const message = status === 'timeout' ? 'Execution stopped: five-second time limit exceeded.' : e.message;
    stderr = (stderr + (stderr ? '\n' : '') + message).slice(0, LIMITS.output - stdout.length);
  } finally { vm.dispose(); runtime.dispose(); }
  return { stdout, stderr, status, duration: Math.round(performance.now() - started), exitCode: status === 'success' ? 0 : 1, ...(visualize && language === 'python' ? { trace, traceTruncated } : {}) };
}
