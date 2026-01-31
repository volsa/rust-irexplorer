.PHONY: run

# Run the development server (opens browser automatically)
run:
	@open http://127.0.0.1:3000 &
	cargo run
