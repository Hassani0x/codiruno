# Latency audit and free improvement plan — 2026-10-26

## Verified causes

1. **Remote execution is outside Cloudflare.** C/C++/Java/C#/Go/Rust/Scala/R/Ruby/PHP/Swift POST directly to Wandbox. Cloudflare serves static files, not these compilers. A new domain, frontend rewrite, or extra proxy cannot remove provider work.
2. **Remote latency varies substantially.** Fresh curl measurements: C TLS ready 0.683 s, first response byte 27.138 s, complete 27.141 s; Java TLS ready 0.286 s, first byte 12.135 s, complete 12.136 s. Earlier simple programs were C 3.5 s and Java 9.1 s. A subsequent Go request returned HTTP 504. These single observations demonstrate variability, not typical or percentile latency. They include network effects; the provider does not expose enough telemetry to split queue, container startup, compilation and program execution. Output transfer itself was about 2 ms for these tiny programs.
3. **Python initialization was repeated on each Run.** Five local engine measurements were 221/156/147/147/148 ms for print(42); initializing Skulpt and its standard library alone took roughly 136–225 ms. Python is translated by Skulpt and runs inside QuickJS/WASM, which also imposes computational overhead compared with native CPython. Heavy programs remain slower even after initialization improvements.
4. **First use downloads runtimes.** Uncompressed build sizes: TypeScript compiler 3.59 MB, Python runtime/stdlib about 980 KB, QuickJS WASM 503 KB, SQL WASM 660 KB. Network throughput, browser compilation and device CPU affect cold startup. Dependencies are lazy loaded/prepared on language selection; the first immediate click can still wait.
5. **Per-run isolation has a cost.** We must reset guest state, bound memory/output/time, and prevent host access. Used interpreters cannot simply be shared between programs.
6. **Toolchain startup differs by language.** JVM/Scala initialization, compilation and Go toolchain work are possible remote cost contributors, but their exact shares are unmeasured here. Unsupported Kotlin/Dart and broken Swift infrastructure are availability problems, not optimization opportunities in frontend code.
7. **Program complexity matters.** Input size, imports, loops, large output and visualization add work. A Hello World measurement cannot guarantee every program is instant.

No access to Programiz's internal infrastructure or timing telemetry was obtained; its queue, caching and compiler setup must not be stated as fact. A fair comparison requires identical source/input, language versions, device, connection and repeated cold/warm runs.

## Implemented free improvement

Python now maintains one initialized, pristine interpreter before Run. It is consumed exactly once and disposed after execution. The next pristine interpreter is prepared in the background. This does not cache program output or reuse modified user state. Five engine checks after preparation: 7/7/7/7/14 ms. Browser click-to-result check: 57 ms. Cold startup and immediate consecutive runs can still pay preparation cost. All 31 tests passed, including new single-use, cross-run module mutation, error recovery and infinite-loop checks. Python visualization also passed browser verification.

## Remaining options, ordered by practicality

| Option | Benefit | Cost / constraint |
| --- | --- | --- |
| Retain local JS/TS/SQL/HTML paths | Avoid remote queue entirely | Already implemented; device-dependent |
| Better cold-load caching/preparation | Faster repeat visits and first Run | Cache only versioned trusted runtime assets; never guest output; larger background downloads use bandwidth |
| Dedicated SQL worker without QuickJS dependency | Avoid unrelated WASM startup/download | Small next optimization; SQL already about 0.1 s |
| Smaller TypeScript transpiler, or bounded last-source transpilation cache | Reduce download/transpile work | Requires syntax/diagnostic compatibility tests; esbuild WASM itself has startup/download cost; no assumed win |
| Python WASM runtime such as Pyodide | Better CPython compatibility, potentially faster heavy code | Larger cold download; JS bridge/network isolation and interrupt design must be rebuilt; not a drop-in safe speed fix |
| Browser WASM compilers for more languages | Remove server queue for supported workloads | Significant language-specific work, large downloads, filesystem/library limitations; benchmark cold and warm before rollout |
| Faster public execution provider | Potential remote improvement | Must verify acceptable use, CORS or secure server adapter, isolation, quotas, privacy and actual latency; free shared capacity gives no guarantee |
| Self-host on an existing machine or eligible free VM | Control warm toolchains, locality and queue | Requires available hardware/free capacity, maintenance and hardened sandboxing; no always-available free VM assumed |
| Warm isolated execution pool | Removes repeated VM/container/toolchain startup from click path | Generally requires paid always-running capacity unless user already has hardware; never reuse contaminated guest state |
| Cache trusted compiler artifacts, standard libraries and immutable builds | Avoid repeated compilation when source/toolchain matches | Cache keys need source, flags, compiler version and dependencies; rerun executable with current stdin; no output caching |
| Stream output from execution service | Show first output sooner | Does not reduce compilation time; backend must support streaming |
| Region placement, keep-alive, sufficient CPU/RAM and queue limits | Reduce network and contention | Needs backend control; static CDN changes alone are insufficient |

Do not fake speed with saved outputs, disable isolation, race duplicate jobs against free providers, or claim an instant guarantee. Free-only prioritization: local execution and pristine prewarming now; evaluate browser runtimes per language next; remote compiled languages remain best-effort until suitable execution capacity is available.

## Primary references

- Wandbox API and service policy: https://github.com/melpon/wandbox
- Wandbox sandbox implementation: https://github.com/melpon/wandbox/blob/develop/feline/src/jail.rs
- Cloudflare container lifecycle and cold starts: https://developers.cloudflare.com/containers/concepts/architecture/
- Cloudflare container configuration: https://developers.cloudflare.com/containers/api/container-class/
- Browser TypeScript transform alternative: https://esbuild.github.io/api/#in-the-browser
- Pyodide usage and Workers: https://pyodide.org/en/stable/usage/index.html

Cloudflare documents typical container cold starts of 1–3 seconds, varying with image/startup work. Moving compilers to cold-starting containers alone therefore does not guarantee instant execution.
