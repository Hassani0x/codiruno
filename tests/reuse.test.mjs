import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newQuickJSWASMModule} from 'quickjs-emscripten';
import {execute} from '../src/engine.mjs';
test('cached WASM module preserves fresh runtime isolation after success and failure',async()=>{
 const quickJS=await newQuickJSWASMModule();
 await execute({language:'javascript',code:'globalThis.secret=42;Object.prototype.leak=1;console.log("first")'},{quickJS});
 const next=await execute({language:'javascript',code:'console.log(typeof secret,typeof ({}).leak,typeof fetch)'},{quickJS});
 assert.equal(next.stdout,'undefined undefined undefined\n');
 const error=await execute({language:'javascript',code:'throw new Error("test")'},{quickJS});assert.equal(error.status,'error');
 const recovery=await execute({language:'javascript',code:'console.log(6*7)'},{quickJS});assert.equal(recovery.stdout,'42\n');
});
