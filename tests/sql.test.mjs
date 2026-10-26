import {test} from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import {executeSQL} from '../src/sql-engine.mjs';
const SQL = await initSqlJs();
test('SQL executes multiple statements and isolates each database', () => {
  assert.equal(executeSQL('CREATE TABLE n(x); INSERT INTO n VALUES(6); SELECT x*7 FROM n;',SQL).stdout,'42\n');
  assert.equal(executeSQL('SELECT * FROM n;',SQL).status,'error');
  assert.equal(executeSQL('SELECT 7*8;',SQL).stdout,'56\n');
});
test('SQL bounds output and recovers after syntax errors', () => {
  assert.equal(executeSQL("WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<100000) SELECT x FROM n;",SQL).status,'output-limit');
  assert.equal(executeSQL('SELECT FROM;',SQL).status,'error');
  assert.equal(executeSQL('SELECT 42;',SQL).stdout,'42\n');
});
