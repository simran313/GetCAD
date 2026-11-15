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
# It asks for three things:
#   1. the database connection string, pasted exactly as Supabase shows it
#      (Supabase → Connect → Session pooler → URI, still with [YOUR-PASSWORD]);
#   2. the database password (not shown on screen), which it puts in for you;
#   3. a passphrase to encrypt the file, twice (not shown, 12+ characters).
#      Keep it in your password manager: without it the backup cannot be opened.
#
# What it saves: the schemas public, app and audit (every table, row,
# function, policy and grant). Not included: files in Storage buckets (CAD
# files, documents), which are not in the database.
#
# Output: .backups/tcp-YYYY-MM-DD_HHMM.dump.enc (git-ignored). The data is
# encrypted as it streams out of the database: no unencrypted copy is ever
# written to disk. Download the .enc file to your computer, then delete it here.
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
  read -r -p "Paste the connection string exactly as Supabase shows it (Session pooler URI), then Enter: " DB_URL
fi
if [[ "$DB_URL" != postgres://* && "$DB_URL" != postgresql://* ]]; then
  echo "That does not look like a connection string (it should start with postgresql://). Nothing was done." >&2; exit 1
fi
if [[ "$DB_URL" == *"[YOUR-PASSWORD]"* ]]; then
  # Ask for the password separately, without showing it, and put it in safely encoded.
  read -r -s -p "Database password (not shown), then Enter: " DB_PASSWORD; echo
  if [[ -z "$DB_PASSWORD" ]]; then echo "No password entered. Nothing was done." >&2; exit 1; fi
  encoded="$(DB_PASSWORD="$DB_PASSWORD" node -e 'process.stdout.write(encodeURIComponent(process.env.DB_PASSWORD))')"
  DB_URL="${DB_URL/\[YOUR-PASSWORD\]/$encoded}"
  unset DB_PASSWORD encoded
fi

server_major="$(psql "$DB_URL" -Atc 'SHOW server_version_num' | cut -c1-2)"
client_major="$(pg_dump --version | grep -oE '[0-9]+' | head -1)"
if (( client_major < server_major )); then
  echo "pg_dump is version $client_major but the database is $server_major. Install postgresql-client-$server_major (see the top of this script)." >&2; exit 1
fi

umask 077
mkdir -p "$OUT_DIR"
stamp="$(date -u +%Y-%m-%d_%H%M)"
enc="$OUT_DIR/tcp-$stamp.dump.enc"

# Ask for the passphrase BEFORE dumping, so the unencrypted data never touches
# the disk: pg_dump streams straight into openssl. (An earlier version wrote a
# plain dump first; if the Codespace stopped while it waited for the
# passphrase, the plain file was left behind.)
if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
  echo "Choose a passphrase for this backup and keep it in your password manager."
  read -r -s -p "Encryption passphrase (not shown, at least 12 characters), then Enter: " BACKUP_PASSPHRASE; echo
  read -r -s -p "Same passphrase again, then Enter: " again; echo
  if [[ "$BACKUP_PASSPHRASE" != "$again" ]]; then echo "The two passphrases differ. Nothing was done." >&2; exit 1; fi
  unset again
fi
if (( ${#BACKUP_PASSPHRASE} < 12 )); then echo "The passphrase must be at least 12 characters. Nothing was done." >&2; exit 1; fi
export BACKUP_PASSPHRASE

# On any failure, remove the partial encrypted file.
trap 'rm -f "$enc"' EXIT

echo "Backing up and encrypting (Postgres $server_major)…"
pg_dump "$DB_URL" --format=custom --no-owner --schema=public --schema=app --schema=audit \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -out "$enc" -pass env:BACKUP_PASSPHRASE
unset DB_URL

# Check the backup opens with this passphrase and holds the expected tables.
tables="$(openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$enc" -pass env:BACKUP_PASSPHRASE \
  | pg_restore --list | grep -c ' TABLE DATA ' || true)"
if (( tables < 50 )); then
  echo "The backup lists only $tables tables with data; expected about 69. Deleted it; check the connection string." >&2; exit 1
fi
unset BACKUP_PASSPHRASE
trap - EXIT

size="$(du -h "$enc" | cut -f1)"
echo
echo "Done: $enc ($size, $tables tables; checked that it opens with your passphrase)."
echo "Next: download it to your computer (Explorer → .backups → right-click → Download),"
echo "      then delete it here:  rm \"$enc\""
