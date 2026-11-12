// Phase 5, step 5 piece 12 (Stage 2a). Ported verbatim from reference/
// CheatCodeDJ_v_1_0_22016.sanitized.jsx's handleSort (source line 1918)
// and doSort (1928) - checked directly rather than assumed, since this
// is real interaction behavior, not pure styling. Confirmed exactly:
// clicking a new column sorts it ascending; clicking the SAME column
// again toggles asc/desc forever - there is no third click that
// returns to unsorted. "none" is a real, named state (not just absent)
// because it's what every list starts in before any column is ever
// clicked - his own 8/17 fix: equally-strong matches shouldn't look
// pre-ranked until the DJ actually asks for a sort. Name sorts
// lowercase-alphabetically; key sorts as a raw string (NOT Camelot-
// aware) - ported exactly, not "improved."

export type SortField = "name" | "bpm" | "key" | "none";
export type SortDir = "asc" | "desc";

export interface SortState {
  field: SortField;
  dir: SortDir;
}

export const DEFAULT_SORT_STATE: SortState = { field: "none", dir: "asc" };

export function handleSort(current: SortState, field: SortField): SortState {
  if (current.field === field) return { field, dir: current.dir === "asc" ? "desc" : "asc" };
  return { field, dir: "asc" };
}

export interface Sortable {
  name: string;
  bpm: number | null;
  key: string;
}

export function applySort<T extends Sortable>(items: T[], sort: SortState): T[] {
  if (sort.field === "none") return items.slice();
  return [...items].sort((a, b) => {
    let av: string | number;
    let bv: string | number;
    if (sort.field === "bpm") {
      av = a.bpm || 0;
      bv = b.bpm || 0;
    } else if (sort.field === "key") {
      av = a.key || "";
      bv = b.key || "";
    } else {
      av = (a.name || "").toLowerCase();
      bv = (b.name || "").toLowerCase();
    }
    if (av < bv) return sort.dir === "asc" ? -1 : 1;
    if (av > bv) return sort.dir === "asc" ? 1 : -1;
    return 0;
  });
}
