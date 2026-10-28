# Codiruno

Browser-based code editor at https://codiruno.dev. No account or local compiler installation required.

## Development

Requires Node.js 20 or later.

```sh
npm ci
npm run dev
npm test
npm run build
npx vite preview
```

Deploy only the contents of `dist/` to Cloudflare Workers static assets. The build creates all language routes. No API keys are required; do not upload source, node_modules, environment files or Git history as site assets.

## Execution

- JavaScript and TypeScript run in isolated QuickJS WebAssembly runtimes.
- Python uses Skulpt inside QuickJS; it is not full CPython.
- SQL runs locally using SQLite WebAssembly in a fresh Worker and database per run.
- HTML/CSS renders in a sandboxed preview with scripts and network disabled.
- C, C++, Java, C#, Go, Rust, Scala, R, Ruby, PHP and Swift use Wandbox's independent public API. Code and input are sent to that provider and may be logged. Never submit secrets.
- Kotlin and Dart execution are not connected. Swift's provider currently fails to start; no successful execution is claimed.

Codiruno does not impose fixed source or input size caps. Local execution retains time, memory and output safeguards; browser storage and external providers have their own limits. Remote speed, availability and isolation depend on Wandbox. No simulated results are used. See [execution details](docs/WANDBOX.md) and [performance checks](docs/PERFORMANCE.md).

The compiler/editor layout references Programiz. Codiruno is independent and does not use Programiz's backend. See [asset attribution](docs/ASSETS.md) for third-party assets and [logo](docs/BRAND.md) for the original Codiruno mark.
