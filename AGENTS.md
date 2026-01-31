# AGENTS.md — irexplorer

## Project Overview

Rust web application that explores Rust compiler intermediate representations
(AST, HIR, THIR, MIR, etc.). Users write Rust code in a Monaco Editor and
view the IR output produced by `rustup run nightly rustc -Zunpretty=<ir_type>`.

**Stack:** Rust (edition 2021, stable toolchain) + Axum 0.8 + Tokio + vanilla
JavaScript frontend (Monaco Editor, highlight.js via CDN). No npm, no bundler,
no TypeScript.

## Directory Structure

```
src/
  main.rs        # Entrypoint: Axum router, static file serving, server bind
  api.rs         # POST /api/compile handler, request/response types
  compiler.rs    # Invokes `rustup run nightly rustc` on a temp file
  ir.rs          # IrType enum with validation and rustc flag mapping
static/
  index.html     # Single-page app shell (loads Monaco + highlight.js from CDN)
  app.js         # Frontend logic (~490 lines vanilla JS)
  style.css      # Catppuccin-themed dark/light styles
Cargo.toml       # Dependencies: axum, tokio, tower-http, serde, tempfile
Makefile         # Convenience targets for build/run
rust-toolchain.toml  # Pinned to "stable" channel
```

## Build / Run / Check Commands

```sh
# Build
cargo build          # or: make build

# Run (opens browser + starts server on 127.0.0.1:3000)
make run             # or: cargo run

# Type/borrow check without producing binary
cargo check

# Format code
cargo fmt

# Lint
cargo clippy
cargo clippy -- -D warnings   # treat warnings as errors
```

## Test Commands

No tests exist yet. When adding tests, use standard Rust conventions:

```sh
# Run all tests
cargo test

# Run a single test by name (substring match)
cargo test test_name

# Run tests in a specific module
cargo test module_name::

# Run tests in a specific file (integration tests in tests/ directory)
cargo test --test integration_test_file_name

# Run with output visible
cargo test -- --nocapture

# Run only unit tests (skip integration tests)
cargo test --lib
```

Unit tests go inside source files in a `#[cfg(test)] mod tests { ... }` block.
Integration tests go in a top-level `tests/` directory.

## Runtime Requirement

The application requires `rustup` with the nightly toolchain installed. It
invokes `rustup run nightly rustc` at runtime to produce IR output. The app
itself compiles on stable Rust.

## Code Style Guidelines

### Rust

**Formatting:** Standard `rustfmt` defaults. No `rustfmt.toml` overrides.
Run `cargo fmt` before committing.

**Linting:** Standard `cargo clippy` defaults. No `clippy.toml` overrides.

**Imports:** Follow standard Rust ordering with blank-line separation between
groups:
1. Standard library (`std::`)
2. External crates (`axum::`, `serde::`, `tempfile::`, etc.)
3. Internal crate modules (`crate::`)

```rust
use std::io::Write;
use std::process::Command;

use tempfile::Builder;

use crate::ir::IrType;
```

Each `use` statement is on its own line. Use `{}` grouping only when importing
multiple items from the same path (e.g., `serde::{Deserialize, Serialize}`).

**Naming conventions:** Standard Rust conventions:
- Structs/Enums: `PascalCase` (`CompileRequest`, `IrType`)
- Functions/methods: `snake_case` (`rustc_flag`, `compile`)
- Fields: `snake_case` (`ir_output`, `ir_type`)
- Modules: `snake_case` (`api`, `compiler`, `ir`)
- Constants: `SCREAMING_SNAKE_CASE`

**Error handling:** This project uses explicit match/early-return patterns
instead of the `?` operator, because the compile function returns a result
struct (not `Result<T, E>`) with user-facing error messages:

```rust
let tmp = match Builder::new().suffix(".rs").tempfile() {
    Ok(t) => t,
    Err(e) => {
        return CompileResult {
            success: false,
            ir_output: String::new(),
            messages: format!("Failed to create temp file: {e}"),
        };
    }
};
```

When adding new fallible operations in `compiler.rs`, follow this same pattern:
return `CompileResult` with `success: false` and a descriptive `messages` string.

For server setup code (`main.rs`), `.unwrap()` is acceptable for operations that
should never fail in a correctly configured environment (e.g., binding the
TCP listener).

**Module organization:** Modules are declared in `main.rs` with `mod`:
```rust
mod api;
mod compiler;
mod ir;
```

**Derive macros:** Use `#[derive(Deserialize)]` / `#[derive(Serialize)]` from
serde for API types. Use `#[serde(rename_all = "snake_case")]` on enums that
are serialized to/from JSON.

### JavaScript (static/app.js)

**No build step.** The JS is served as-is from the `static/` directory.

- Use `const` and `let`, never `var`
- Use arrow functions for callbacks
- Use `async/await` for fetch calls
- Use `document.getElementById` / `document.querySelector` for DOM access
- No modules or imports; the file is loaded via a Monaco `require()` callback
- IIFE pattern for self-contained initialization: `(function initX() { ... })()`

### HTML/CSS (static/)

- Single `index.html` file loads all external dependencies from CDNs
- CSS uses CSS custom properties for theming (Catppuccin palette)
- Supports both dark and light themes via `[data-theme]` attribute

## Architecture Notes

Request flow:
1. Browser sends `POST /api/compile` with JSON `{ source, ir_type }` for
   each selected IR type (requests fire in parallel)
2. `api::compile` handler spawns a blocking task via `tokio::task::spawn_blocking`
3. `compiler::compile()` writes source to a temp file, runs
   `rustup run nightly rustc -Zunpretty=<ir_type>`, captures stdout/stderr
4. Returns `CompileResult` as JSON; frontend renders IR with highlight.js
5. IR lines with source spans are hoverable to highlight corresponding source
   lines in the Monaco editor

## Dependencies (Cargo.toml)

| Crate | Purpose |
|-------|---------|
| axum 0.8 | HTTP routing and handlers |
| tokio 1 (full) | Async runtime |
| tower-http 0.6 | Static file serving (`ServeDir`) |
| serde 1 | Serialization/deserialization with derive |
| serde_json 1 | JSON parsing/generation |
| tempfile 3 | Temporary file creation for rustc input |
