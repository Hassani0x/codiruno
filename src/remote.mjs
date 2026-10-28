export const COMPILER_IDS = Object.freeze({
  c: 'gcc-13.2.0-c', cpp: 'gcc-13.2.0', java: 'openjdk-jdk-22+36',
  csharp: 'mono-6.12.0.199', python: 'cpython-3.14.0', javascript: 'nodejs-20.17.0',
  typescript: 'typescript-5.6.2', swift: 'swift-6.0.1', go: 'go-1.23.2',
  rust: 'rust-1.82.0', php: 'php-8.3.12', r: 'r-4.4.1', ruby: 'ruby-4.0.2', sql: 'sqlite-3.46.1', scala: 'scala-2.13.15',
});
export const REMOTE_LIMITS = Object.freeze({ output: 32768, requestMs: 90000 });
const encoder = new TextEncoder();

export async function executeRemote({ compiler, code, stdin = '' }, signal) {
  if (!Object.values(COMPILER_IDS).includes(compiler)) throw new Error('Unsupported remote compiler.');
  if (typeof code !== 'string' || typeof stdin !== 'string') throw new Error('Code and input must be text.');
  const started = performance.now();
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; cancel(); }, REMOTE_LIMITS.requestMs);
  const finish = (result) => ({ ...result, duration: Math.round(performance.now() - started) });
  try {
    const response = await fetch('https://wandbox.org/api/compile.json', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
      referrerPolicy: 'no-referrer', signal: controller.signal,
      body: JSON.stringify({ compiler, code, stdin, save: false }),
    });
    if (response.status === 429) throw new Error('The compiler service is busy: request limit reached. Please wait a minute and try again.');
    if (!response.ok) throw new Error(`Compiler service unavailable (HTTP ${response.status}). Please try again.`);
    const result = await response.json();
    if (!result || typeof result !== 'object' || (!('status' in result) && !('signal' in result))) throw new Error('The compiler service returned an invalid result.');
    let remaining = REMOTE_LIMITS.output, truncated = false;
    const cap = (value) => {
      const text = typeof value === 'string' ? value : '';
      const bytes = encoder.encode(text);
      const accepted = Math.min(remaining, bytes.length);
      remaining -= accepted;
      if (accepted < bytes.length) truncated = true;
      // Streaming decode drops an incomplete final UTF-8 character at the cap.
      return new TextDecoder().decode(bytes.subarray(0, accepted), { stream: accepted < bytes.length });
    };
    const stdout = cap((result.compiler_output || '') + (result.program_output || ''));
    const stderr = cap((result.compiler_error || '') + (result.program_error || ''));
    const parsedExit = Number.parseInt(result.status, 10);
    const exitCode = Number.isFinite(parsedExit) ? parsedExit : 1;
    const status = truncated ? 'output-limit' : result.signal || exitCode !== 0 ? 'error' : 'success';
    return finish({ stdout, stderr, status, exitCode, signal: result.signal || '', truncated });
  } catch (error) {
    const status = controller.signal.aborted ? timedOut ? 'timeout' : 'cancelled' : 'error';
    const stderr = timedOut ? 'Compiler request timed out after 90 seconds. The remote job may still be finishing.'
      : status === 'cancelled' ? 'Request cancelled. The remote job may still be finishing.'
      : error instanceof TypeError ? 'Could not connect to the compiler service. Check your connection and try again.' : error.message;
    return finish({ stdout: '', stderr, status, exitCode: 1 });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
