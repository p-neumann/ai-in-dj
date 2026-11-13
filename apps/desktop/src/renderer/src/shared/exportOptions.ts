// Phase 5, step 5 piece 14 (Stage 2b, export menu fix, 2026-11-12).
// Ported verbatim from the source's EXPORT_OPTIONS (line 418) - ten
// entries, not four. The real split confirmed by reading genericExport
// directly (lines 5163-5209): showing all ten - icon, label, note, and
// the "Desktop" badge on the five unready ones - is ordinary Phase 5
// styling. His own click handler for an unready entry is just
// alert("Direct export to "+label+" will be available in the desktop
// app.") - no native file writing happens by showing the menu. Only
// the actual Serato .crate/Rekordbox XML/Traktor NML/VirtualDJ XML/
// Engine DJ writes are real Phase 8 work.

export interface ExportOption {
  id: "serato" | "rekordbox" | "traktor" | "virtualdj" | "engine" | "m3u" | "csv" | "json" | "txt" | "copy";
  label: string;
  icon: string;
  note: string;
  ready: boolean;
}

export const EXPORT_OPTIONS: readonly ExportOption[] = [
  { id: "serato", label: "Export To Serato", icon: "🎛️", note: "Writes .crate file to Subcrates folder", ready: false },
  { id: "rekordbox", label: "Export To Rekordbox", icon: "🎵", note: "Writes to Rekordbox XML collection", ready: false },
  { id: "traktor", label: "Export To Traktor", icon: "🎧", note: "Writes NML playlist file", ready: false },
  { id: "virtualdj", label: "Export To Virtual DJ", icon: "💿", note: "Writes XML playlist file", ready: false },
  { id: "engine", label: "Export To Engine DJ", icon: "🔊", note: "Writes to Engine DJ library", ready: false },
  { id: "m3u", label: "Export As M3U", icon: "📋", note: "Universal playlist — works with any DJ software", ready: true },
  { id: "csv", label: "Export As CSV", icon: "📄", note: "Spreadsheet format for manual import", ready: true },
  { id: "json", label: "Export As JSON", icon: "📊", note: "Structured data for analysis or re-import", ready: true },
  { id: "txt", label: "Export As Text", icon: "📝", note: "Simple track list for pasting or dragging", ready: true },
  { id: "copy", label: "Copy Selected to Clipboard", icon: "📋✓", note: "One-click copy of selected track names", ready: true }
];
