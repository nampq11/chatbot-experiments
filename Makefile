SHELL := /bin/bash
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c

ifneq (,$(wildcard .env))
include .env
export
endif

PNPM ?= pnpm
HOST ?= 0.0.0.0
PORT ?= 8080
SERVER_HEALTH_URL ?= http://127.0.0.1:$(PORT)/health
WEB_PORT ?= 3000
DB_HOST ?= 127.0.0.1
DB_PORT ?= 3306
DB_USER ?= root
DB_PASSWORD ?= password
DB_NAME ?= dentaltrip
LEGACY_MYSQL_CONTAINER ?= dentaltrip-ai-mysql-$(DB_PORT)
MYSQL_IMAGE ?= mysql:8.0
DATABASE_URL ?= mysql://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)
DOCKER_COMPOSE ?= docker compose
MYSQL_SERVICE ?= mysql
ZENSICAL_VERSION ?= 0.0.46

ifeq ($(DEVCONTAINER),true)
DB_HOST := mysql
DATABASE_URL := mysql://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)
DOCKER_COMPOSE := env DB_HOST=127.0.0.1 $(DOCKER_COMPOSE)
endif

.PHONY: help dev setup start stop server build cli docs check-docs serve-docs db-up db-down db-reset ensure-env wait-for-db cleanup-legacy-db migrate-gen migrate-up migrate-down install

help:
	@printf '%s\n' \
	  'Targets:' \
	  '  make dev         Install deps, ensure env, start MySQL, then launch server + web' \
	  '  make setup       Install deps, ensure env, start MySQL' \
	  '  make start       Launch server + web' \
	  '  make stop        Stop server + web processes started by this checkout' \
	  '  make server      Run the Express server only' \
	  '  make build       Build server and CLI packages' \
	  '  make cli         Run the DentalTrip AI CLI REPL' \
	  '  make docs        Build documentation site (Zensical)' \
	  '  make check-docs  Validate documentation site (Zensical)' \
	  '  make serve-docs  Serve documentation locally (Zensical)' \
	  '  make db-up       Start the local MySQL container' \
	  '  make db-down     Stop the local MySQL container' \
	  '  make db-reset    Drop and recreate the app database' \
	  '  make migrate-*   Drizzle migration commands'

install:
	@$(PNPM) install --frozen-lockfile

ensure-env:
	@mkdir -p packages/server
	@if [ ! -s packages/server/.env ]; then \
	  printf 'HOST=%s\nPORT=%s\nDATABASE_URL=%s\n' '$(HOST)' '$(PORT)' '$(DATABASE_URL)' > packages/server/.env; \
	fi

wait-for-db:
	@until MYSQL_PWD='$(DB_PASSWORD)' $(DOCKER_COMPOSE) exec -T $(MYSQL_SERVICE) mysqladmin ping -uroot --silent >/dev/null 2>&1; do \
	  sleep 1; \
	done

cleanup-legacy-db:
	@if docker inspect $(LEGACY_MYSQL_CONTAINER) >/dev/null 2>&1; then \
	  echo "Removing legacy MySQL container $(LEGACY_MYSQL_CONTAINER) to avoid docker-compose port conflicts..."; \
	  docker rm -f $(LEGACY_MYSQL_CONTAINER) >/dev/null; \
	fi

setup: install ensure-env db-up

dev: setup
	@trap 'kill "$$server_pid" "$${web_pid:-}" >/dev/null 2>&1 || true' INT TERM EXIT; \
	  DATABASE_URL='$(DATABASE_URL)' HOST='$(HOST)' PORT='$(PORT)' $(PNPM) --filter @dentaltrip-ai/server dev & \
	  server_pid=$$!; \
	  for _ in {1..120}; do \
	    if curl -fsS '$(SERVER_HEALTH_URL)' >/dev/null 2>&1; then break; fi; \
	    if ! kill -0 "$$server_pid" >/dev/null 2>&1; then wait "$$server_pid"; exit $$?; fi; \
	    sleep 1; \
	  done; \
	  curl -fsS '$(SERVER_HEALTH_URL)' >/dev/null; \
	  if ! kill -0 "$$server_pid" >/dev/null 2>&1; then wait "$$server_pid"; exit $$?; fi; \
	  env -u PORT $(PNPM) --dir apps/web exec next dev --port $(WEB_PORT) & \
	  web_pid=$$!; \
	  wait

start: ensure-env db-up
	@trap 'kill "$$server_pid" "$${web_pid:-}" >/dev/null 2>&1 || true' INT TERM EXIT; \
	  DATABASE_URL='$(DATABASE_URL)' HOST='$(HOST)' PORT='$(PORT)' $(PNPM) --filter @dentaltrip-ai/server dev & \
	  server_pid=$$!; \
	  for _ in {1..120}; do \
	    if curl -fsS '$(SERVER_HEALTH_URL)' >/dev/null 2>&1; then break; fi; \
	    if ! kill -0 "$$server_pid" >/dev/null 2>&1; then wait "$$server_pid"; exit $$?; fi; \
	    sleep 1; \
	  done; \
	  curl -fsS '$(SERVER_HEALTH_URL)' >/dev/null; \
	  if ! kill -0 "$$server_pid" >/dev/null 2>&1; then wait "$$server_pid"; exit $$?; fi; \
	  env -u PORT $(PNPM) --dir apps/web exec next dev --port $(WEB_PORT) & \
	  web_pid=$$!; \
	  wait

stop:
	@pkill -f "[t]sx.*src/main.ts" >/dev/null 2>&1 || true
	@pkill -f "[t]sx.*cmd/server/main.ts" >/dev/null 2>&1 || true
	@pkill -f "[p]npm --filter @dentaltrip-ai/server dev" >/dev/null 2>&1 || true
	@pkill -f "[n]ode .*next/dist/bin/next dev --port $(WEB_PORT)" >/dev/null 2>&1 || true

server: ensure-env db-up
	@DATABASE_URL='$(DATABASE_URL)' HOST='$(HOST)' PORT='$(PORT)' $(PNPM) --filter @dentaltrip-ai/server dev

build:
	@$(PNPM) --filter @dentaltrip-ai/server build
	@$(PNPM) --filter @dentaltrip-ai/cli build

cli:
	@DATABASE_URL='$(DATABASE_URL)' $(PNPM) --filter @dentaltrip-ai/cli cli $(ARGS)

docs: check-docs
	@touch site/.nojekyll

check-docs:
	@uvx --from "zensical==$(ZENSICAL_VERSION)" zensical build

serve-docs:
	@uvx --from "zensical==$(ZENSICAL_VERSION)" zensical serve

db-up: cleanup-legacy-db
	@DB_PASSWORD='$(DB_PASSWORD)' DB_NAME='$(DB_NAME)' $(DOCKER_COMPOSE) up -d $(MYSQL_SERVICE) >/dev/null
	@until MYSQL_PWD='$(DB_PASSWORD)' $(DOCKER_COMPOSE) exec -T $(MYSQL_SERVICE) mysqladmin ping -uroot --silent >/dev/null 2>&1; do \
	  sleep 1; \
	done

db-down:
	@$(DOCKER_COMPOSE) stop $(MYSQL_SERVICE) >/dev/null 2>&1 || true

db-reset: db-up
	@MYSQL_PWD='$(DB_PASSWORD)' $(DOCKER_COMPOSE) exec -T $(MYSQL_SERVICE) mysql -uroot -e "DROP DATABASE IF EXISTS \`$(DB_NAME)\`; CREATE DATABASE \`$(DB_NAME)\`;"

migrate-gen:
	@cd packages/server && $(PNPM) dlx drizzle-kit@0.31.10 generate --config drizzle.config.ts

migrate-up:
	@DATABASE_URL='$(DATABASE_URL)' $(PNPM) --filter @dentaltrip-ai/cli migrate up

migrate-down:
	@DATABASE_URL='$(DATABASE_URL)' $(PNPM) --filter @dentaltrip-ai/cli migrate down
