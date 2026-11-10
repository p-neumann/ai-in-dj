// The app window's saved size and position (migration 2). One row, id 1.
// Adopted from Ranjish Kumar's ranjish/ccdj-desktop branch, same names and
// shapes, so his main-process code can call it unchanged.

import type Database from "better-sqlite3";

export interface WindowBounds {
  x: number | null;
  y: number | null;
  width: number;
  height: number;
}

export function getWindowBounds(db: Database.Database): WindowBounds | null {
  const row = db.prepare("SELECT x, y, width, height FROM window_bounds WHERE id = 1").get() as
    | WindowBounds
    | undefined;
  return row ?? null;
}

export function saveWindowBounds(db: Database.Database, bounds: WindowBounds): void {
  db.prepare(
    `INSERT INTO window_bounds (id, x, y, width, height) VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET x = excluded.x, y = excluded.y, width = excluded.width, height = excluded.height`
  ).run(bounds.x, bounds.y, bounds.width, bounds.height);
}
