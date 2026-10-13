# 0006 - One database-wide schema version for the local SQLite database

**Date:** 2026-10-13
**Owner/source:** Hannah, this session (Phase 5 SQLite milestone). An engineering interpretation of CLAUDE.md §6.2, not a Mike decision; it does not touch musical behavior. Ranjish has not yet reviewed it.
**Status:** Accepted

## Decision
The desktop app's local SQLite database carries **one** schema version for the whole file, not one per table. It is stored in a `schema_migrations` table (`version`, `name`, `applied_at`), one row per applied migration; the database's version is `MAX(version)`, or 0 when the table does not exist.

## Why
CLAUDE.md §6.2 line "every local table has a `schema_version`" can be read as per-table. Every other statement about versions in the guide treats the version as a property of the database file:
- the pre-migration snapshot is named by a single version (`ccdj-db.v<old-schema>.bak`, §6.2);
- "if the database is newer than it understands, it must not write to it" (§6.2) needs one number to compare against the highest version a build can read;
- rollback restores "its compatible database snapshot" (§8.8, Phase 10);
- tests cover "migrations from each prior schema" (§11.1), i.e. a single sequence.

With per-table versions the "is this database too new?" check has no single answer. One database-wide version is the reading the rest of §6.2 relies on, and every table is still versioned through the database that contains it.

## Consequences
- Migrations form one ordered, contiguous sequence (1, 2, 3, …) in `apps/desktop/src/main/db/migrations.ts`. A shipped migration is never edited; changes ship as a new migration (forward-only, §6.2).
- Each build's highest readable version is the last migration it contains. A database with a higher version is refused without being written to.
- No per-table version columns are added. If a future need for per-table versioning appears (for example, a table synced on its own cycle), that is a new decision that supersedes this one.
