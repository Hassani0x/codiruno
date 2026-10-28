export function executeSQL(code, SQL) {
  const started = performance.now();
  if (typeof code !== 'string') throw new Error('SQL source must be text.');
  const db = new SQL.Database();
  let stdout = '', status = 'success', stderr = '';
  try {
    db.run('PRAGMA hard_heap_limit=67108864; PRAGMA max_page_count=8192; PRAGMA temp_store=MEMORY;');
    for (const statement of db.iterateStatements(code)) {
      try {
        while (statement.step()) {
          const row = statement.get().map(value => value === null ? '' : String(value)).join('|') + '\n';
          const remaining = 32768 - stdout.length;
          stdout += row.slice(0, remaining);
          if (row.length > remaining) { status = 'output-limit'; break; }
          if (performance.now() - started > 5000) { status = 'timeout'; break; }
        }
      } finally { statement.free(); }
      if (status !== 'success') break;
    }
  } catch (error) { status = 'error'; stderr = error.message; }
  finally { db.close(); }
  return {stdout, stderr, status, exitCode: status === 'success' ? 0 : 1, duration: Math.round(performance.now() - started)};
}
