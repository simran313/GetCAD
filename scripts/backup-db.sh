#!/usr/bin/env bash
# =============================================================================
# Weekly ENCRYPTED backup of the production database.
#
# Why: on Supabase's Free plan there is no backup you can restore yourself.
# Until the paid plan (with daily backups) is in place, run this once a week
# and keep the encrypted file somewhere safe (not in the repository).
#
#   bash scripts/backup-db.sh
#
# It asks for two things, neither shown on screen:
#   1. the database connection string: Supabase → Connect → Session pooler →
#      URI, with [YOUR-PASSWORD] replaced by the database password;
#   2. a passphrase to encrypt the file (twice). Keep it in your password
#      manager: without it the backup cannot be opened.
#
# What it saves: the schemas public, app and audit (every table, row,
# function, policy and grant). Not included: files in Storage buckets (CAD
# files, documents), which are not in the database.
#
# Output: .backups/tcp-YYYY-MM-DD_HHMM.dump.enc (git-ignored). The
# unencrypted dump is deleted as soon as the encrypted copy is made. Download
# the .enc file to your computer, then delete it from here.
#
# One-time setup (pg_dump 17 or newer is needed; Codespaces / Ubuntu):
#   sudo apt-get update && sudo apt-get install -y postgresql-common
#   sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
#   sudo apt-get install -y postgresql-client-17
#
# To restore (into a NEW, empty project first, never straight over production):
#   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in FILE.dump.enc -out FILE.dump
#   pg_restore --no-owner --dbname "<new database connection string>" FILE.dump
# One message, "schema \"public\" already exists", is expected and harmless.
# Then see docs/developer-handover/14-troubleshooting-and-disaster-recovery.md.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${BACKUP_DIR:-$ROOT/.backups}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing '$1'. Do the one-time setup at the top of this script first." >&2; exit 1; }; }
need pg_dump; need pg_restore; need psql; need openssl

if [[ -z "${DB_URL:-}" ]]; then
  read -r -s -p "Paste the connection string (Session pooler URI, password filled in), then Enter: " DB_URL; echo
fi
if [[ "$DB_URL" != postgres://* && "$DB_URL" != postgresql://* ]]; then
  echo "That does not look like a connection string (it should start with postgresql://). Nothing was done." >&2; exit 1
fi
if [[ "$DB_URL" == *"[YOUR-PASSWORD]"* ]]; then
  echo "Replace [YOUR-PASSWORD] in the connection string with the real password. Nothing was done." >&2; exit 1
fi

server_major="$(psql "$DB_URL" -Atc 'SHOW server_version_num' | cut -c1-2)"
client_major="$(pg_dump --version | grep -oE '[0-9]+' | head -1)"
if (( client_major < server_major )); then
  echo "pg_dump is version $client_major but the database is $server_major. Install postgresql-client-$server_major (see the top of this script)." >&2; exit 1
fi

umask 077
mkdir -p "$OUT_DIR"
stamp="$(date -u +%Y-%m-%d_%H%M)"
plain="$OUT_DIR/tcp-$stamp.dump"
trap 'rm -f "$plain"' EXIT

echo "Backing up (Postgres $server_major)…"
pg_dump "$DB_URL" --format=custom --no-owner --schema=public --schema=app --schema=audit --file="$plain"

tables="$(pg_restore --list "$plain" | grep -c ' TABLE DATA ' || true)"
if (( tables < 50 )); then
  echo "The backup lists only $tables tables with data; expected about 69. Not encrypting; check the connection string." >&2; exit 1
fi

echo "Encrypting. Choose a passphrase and keep it in your password manager."
if [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "$plain" -out "$plain.enc" -pass env:BACKUP_PASSPHRASE
else
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "$plain" -out "$plain.enc"
fi
rm -f "$plain"
unset DB_URL

size="$(du -h "$plain.enc" | cut -f1)"
echo
echo "Done: $plain.enc ($size, $tables tables)."
echo "Next: download it to your computer (Explorer → .backups → right-click → Download),"
echo "      then delete it here:  rm \"$plain.enc\""
