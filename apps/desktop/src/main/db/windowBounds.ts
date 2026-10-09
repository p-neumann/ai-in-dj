// Persists the app window's size/position - the concrete, visible proof
// that this step actually works: resize/move the window, quit, reopen,
// and it comes back where you left it.

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
