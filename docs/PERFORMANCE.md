# Performance verification — 2026-10-26

Single default-program measurements from the development machine, including network latency; not service-level guarantees.

| Language | Remote baseline |
| --- | ---: |
| R | 6.5 s |
| SQL | 4.2 s |
| Java | 9.1 s |
| C | 3.5 s |
| C++ | 4.6 s |
| Go | 23.5 s |
| Rust | 4.5 s |
| Ruby | 5.1 s |
| PHP | 3.1 s |

SQL now executes locally: browser end-to-end checks took 104 ms and 59 ms. Cold downloads can take longer. The infinite-query watchdog stopped execution after five seconds and a subsequent SELECT 42 succeeded.

C# dotnet 8 and Scala 3.5.1 failed at the provider. Switching to Mono 6.12 and Scala 2.13.15 produced real successful output (8.0 s and 24.1 s). These versions have different language/library compatibility. Go 1.22 was slower than 1.23, so 1.23 remains selected. Swift 6 and 5.10 both failed in provider infrastructure. Kotlin/Dart are absent from the provider inventory.

Prepared local runtime dependencies are reused for JavaScript/Python/TypeScript, while each run receives a fresh guest runtime. SQL Workers are discarded after every execution to prevent virtual filesystem persistence and prewarmed again. Provider preconnect reduces connection setup where supported. Outputs are never cached or fabricated.

28 automated tests passed, covering computation, stdin, syntax errors, isolation, resource limits, SQL database reset, and Python visualization. Remote unit tests mock transport; the measurements above used real provider calls.

A domain or static host cannot remove external compiler queues or JVM/toolchain startup. Consistently faster Go/Scala execution requires a separately operated isolated execution service; the current public provider has no latency guarantee.
