#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE"
  echo "Create .env from .env.example, or run 'make worktree-env' and use .env.worktree."
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-password}"
DB_NAME="${DB_NAME:-chatbot_experiments}"
DATABASE_URL="${DATABASE_URL:-}"

export MYSQL_PWD="$DB_PASSWORD"

db_host=""
db_port="$DB_PORT"
db_user="$DB_USER"
db_password="$DB_PASSWORD"
db_name="$DB_NAME"

parse_database_url() {
  local rest authority userinfo hostport path

  rest="${DATABASE_URL#*://}"
  rest="${rest%%\?*}"
  authority="${rest%%/*}"
  path="${rest#*/}"

  if [ "$authority" = "$rest" ]; then
    path=""
  fi

  userinfo=""
  hostport="$authority"

  if [[ "$authority" == *"@"* ]]; then
    userinfo="${authority%@*}"
    hostport="${authority##*@}"

    db_user="${userinfo%%:*}"
    if [[ "$userinfo" == *":"* ]]; then
      db_password="${userinfo#*:}"
    fi
  fi

  db_host="${hostport%%:*}"
  if [[ "$hostport" == *:* ]] && [ -n "${hostport##*:}" ]; then
    db_port="${hostport##*:}"
  fi

  if [ -n "$path" ]; then
    db_name="${path%%/*}"
  fi
}

if [ -n "$DATABASE_URL" ]; then
  parse_database_url
fi

validate_db_name() {
  if [[ ! "$db_name" =~ ^[A-Za-z0-9_]{1,64}$ ]]; then
    echo "Unsafe database name: $db_name"
    echo "Use only letters, numbers, and underscores (1-64 characters)."
    exit 1
  fi
}

is_local() {
  [ -z "$DATABASE_URL" ] || [ "$db_host" = "localhost" ] || [ "$db_host" = "127.0.0.1" ] || [ "$db_host" = "::1" ]
}

if is_local; then
  validate_db_name

  # ---------- Local: use Docker ----------
  legacy_container="chatbot-experiments-mysql-${db_port}"

  if docker inspect "$legacy_container" > /dev/null 2>&1; then
    echo "==> Removing legacy MySQL container '$legacy_container' to avoid docker-compose port conflicts..."
    docker rm -f "$legacy_container" > /dev/null
  fi

  echo "==> Ensuring shared MySQL container is running on ${db_host:-127.0.0.1}:$db_port..."
  docker compose up -d mysql

  echo "==> Waiting for MySQL to be ready..."
  until docker compose exec -T mysql mysqladmin ping -u"$db_user" -p"$db_password" --silent > /dev/null 2>&1; do
    sleep 1
  done

  echo "==> Ensuring database '$db_name' exists..."
  db_exists="$(docker compose exec -T mysql \
    mysql -u"$db_user" -p"$db_password" -e "SELECT 1 FROM information_schema.schemata WHERE schema_name = '$db_name'" --silent --skip-column-names 2>/dev/null)"

  if [ "$db_exists" != "1" ]; then
    docker compose exec -T mysql \
      mysql -u"$db_user" -p"$db_password" -e "CREATE DATABASE \`$db_name\`" \
      > /dev/null
  fi

  echo "✓ MySQL ready (local Docker). Database: $db_name"
else
  # ---------- Remote: skip Docker, verify connectivity ----------
  echo "==> Remote database detected (host: $db_host). Skipping Docker."
  if command -v mysqladmin > /dev/null 2>&1; then
    echo "==> Waiting for MySQL at $db_host:$db_port to be ready..."
    until mysqladmin ping -h "$db_host" -P "$db_port" --silent > /dev/null 2>&1; do
      sleep 1
    done
    echo "✓ MySQL ready (remote: $db_host:$db_port). Database: $db_name"
  else
    echo "==> mysqladmin not found. Skipping remote connectivity preflight."
    echo "✓ MySQL configured (remote: $db_host:$db_port). Database: $db_name"
  fi
fi
