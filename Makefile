.DEFAULT_GOAL := help

.PHONY: setup build test lint fmt check check/okf clean help

##@ Bootstrap

setup: ## Install dependencies
	npm install

##@ Build & Quality

build: ## Compile TypeScript to dist/
	npm run build

test: ## Run the test suite
	npm test

lint: ## Type-check and check formatting
	npm run lint

fmt: ## Format sources with prettier
	npm run fmt

check: ## Run the full quality gate (okf, lint, test, build)
	npm run check

check/okf: ## Validate the docs OKF bundle
	npm run check-okf

clean: ## Remove build artifacts
	rm -rf dist

##@ Utilities

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} \
	  /^[a-zA-Z0-9_/-]+:.*?##/ { printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2 } \
	  /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) }' $(MAKEFILE_LIST)
