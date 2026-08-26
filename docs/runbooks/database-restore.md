# Runbook: off-platform database backups

Nightly encrypted dumps to storage outside Supabase, so the database survives
losing the Supabase project itself — a billing lapse, an account problem, a
region outage, or a mistake nobody has thought of yet.

This is the outermost layer. Reach for the inner ones first:

| Something went wrong | Use |
| --- | --- |
| An organizer regenerated a schedule / cleared a score | **Restore points** on the league page |
| Wrong score, need to know who changed it | **History** card on the league page |
| A league was deleted by mistake | Restore points, for 30 days after deletion |
| Bad data across the whole database, hours ago | Supabase → Database → Backups |
| Supabase itself is gone | **This runbook** |

---

## One-time setup

### 1. A private bucket

Any S3-compatible storage works. Cloudflare R2 is the cheapest for this — the
free tier is 10 GB and there are no egress fees, and a nightly dump of this
database is a fraction of a megabyte.

1. Cloudflare dashboard → **R2** → **Create bucket**, name it `sportsapp-backups`.
   Leave public access **off**.
2. **Manage R2 API Tokens** → **Create API token** → *Object Read & Write*,
   scoped to that one bucket.
3. Note the **Access Key ID**, **Secret Access Key**, and the
   **S3 API endpoint** (`https://<account-id>.r2.cloudflarestorage.com`).
4. Set a lifecycle rule on the bucket to delete objects older than 90 days,
   unless you want to keep them forever.

### 2. The database URL

**It must be the session pooler, not the transaction pooler.** `pg_dump` uses
prepared statements the transaction pooler cannot hold; it fails partway and
leaves a dump that looks plausible and is incomplete. The workflow refuses a
`:6543` URL for exactly this reason.

Supabase → **Settings → Database → Connection string → Session pooler**. It
looks like:

```
postgresql://postgres.<project-ref>:<password>@aws-1-us-east-1.pooler.supabase.com:5432/postgres
```

Note the port: **5432**, not 6543.

### 3. A passphrase you will not lose

Generate one and put it somewhere that is **not** this database and not the
Supabase account — a password manager.

```bash
openssl rand -base64 32
```

If this is lost, every backup is unreadable. There is no recovery path; that is
what encryption means.

### 4. Set the six repository secrets

`gh` reads each value from stdin, so nothing lands in your shell history:

```bash
gh secret set BACKUP_DB_URL                 # session pooler URL, port 5432
gh secret set BACKUP_PASSPHRASE             # the openssl output above
gh secret set BACKUP_S3_ENDPOINT            # https://<account>.r2.cloudflarestorage.com
gh secret set BACKUP_S3_BUCKET              # sportsapp-backups
gh secret set BACKUP_S3_ACCESS_KEY_ID
gh secret set BACKUP_S3_SECRET_ACCESS_KEY
```

Then run it once by hand to prove it works:

```bash
gh workflow run "Nightly database backup"
gh run watch
```

---

## What is in a backup

- The **`public`** schema — every league, team, match, set, payment record,
  restore point and audit row.
- The **`auth`** schema — user accounts. Without this everyone would have to
  sign up again, which is its own outage.

Not included: Supabase Storage objects (uploaded images), and anything outside
those two schemas. Storage is metadata-only in the database, so an image
uploaded to Storage is not in this dump.

---

## Restoring

### Get a backup

```bash
export AWS_ACCESS_KEY_ID=...  AWS_SECRET_ACCESS_KEY=...  AWS_DEFAULT_REGION=auto
ENDPOINT=https://<account>.r2.cloudflarestorage.com

# List what you have
aws s3 ls s3://sportsapp-backups/sportsapp/ --endpoint-url "$ENDPOINT"

# Newest
aws s3 cp s3://sportsapp-backups/sportsapp/latest.pgc.gpg . --endpoint-url "$ENDPOINT"

# Or a specific night
aws s3 cp s3://sportsapp-backups/sportsapp/2026-08-26T09-00-11Z.pgc.gpg . \
  --endpoint-url "$ENDPOINT"
```

### Decrypt

```bash
gpg --decrypt --output dump.pgc latest.pgc.gpg
# prompts for BACKUP_PASSPHRASE
```

### Look inside before restoring anything

```bash
pg_restore --list dump.pgc | head -40
```

### Restore into a scratch database first

Never restore straight over production. Bring it up locally, confirm the data
is what you expect, then decide.

```bash
docker run --rm -d --name scratch -e POSTGRES_PASSWORD=scratch -p 5433:5432 postgres:17
sleep 5
SCRATCH="postgresql://postgres:scratch@localhost:5433/postgres"

# Stubs so the RLS policies in the dump can be created
psql "$SCRATCH" <<'SQL'
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select null::text $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
SQL

pg_restore --dbname="$SCRATCH" --schema=public --no-owner --no-privileges dump.pgc

psql "$SCRATCH" -c "select count(*) from competitions;"
psql "$SCRATCH" -c "select name from competitions order by created_at desc limit 10;"
```

Warnings about extensions and roles are expected and harmless — the data is
what matters.

### Restoring one table into production

Usually what you actually want. Restore into scratch as above, then move just
the table across:

```bash
pg_dump "$SCRATCH" --data-only --table=public.sets --format=plain > sets.sql
psql "$PRODUCTION_SESSION_POOLER_URL" -f sets.sql
```

Take a restore point first if the competition still exists — the app-level undo
is easier to reason about than this.

### Full production restore

A last resort, and destructive. Prefer restoring into a **new** Supabase project
and repointing the app, so the damaged one stays available for comparison:

1. Create a new Supabase project.
2. Restore `public` and `auth` into it from the dump.
3. Update `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` and the keys in Vercel.
4. Redeploy.
5. Keep the old project until you are certain.

---

## Checking it is still working

The job fails loudly rather than silently producing a bad file: it refuses a
dump under 20 KB, and it restores every dump into a throwaway Postgres and
compares **exact** row counts per table against the source. A dump that does not
round-trip fails the run.

GitHub emails the repository owner when a scheduled workflow fails. That is the
alarm — do not ignore it, because a backup nobody checks is the same as no
backup. `match_audit` sat empty for a year for exactly that reason.

```bash
gh run list --workflow "Nightly database backup" --limit 10
```

**Restore from a real backup once a quarter.** Not because you expect it to be
broken, but because the first time you do this should not be during an incident.
