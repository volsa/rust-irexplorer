.PHONY: run build check fmt clippy clean

# Build the project (debug)
build:
	cargo build

# Build optimized release binary
release:
	cargo build --release

# Run the development server (opens browser automatically)
run:
	@open http://127.0.0.1:3000 &
	cargo run

# Run the release build
run-release:
	@open http://127.0.0.1:3000 &
	cargo run --release

# Type-check without producing a binary
check:
	cargo check

# Format all Rust source files
fmt:
	cargo fmt

# Check formatting without modifying files
fmt-check:
	cargo fmt -- --check

# Run clippy lints
clippy:
	cargo clippy -- -D warnings

# Run all tests
test:
	cargo test

# Remove build artifacts
clean:
	cargo clean

# Run all checks (format, lint, test)
ci: fmt-check clippy test
	@echo "All checks passed."
