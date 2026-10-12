// Mike's real vibe-slider labels, copied faithfully from the project's
// own reference spec (reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx's
// VIBE_LABELS) - not reworded, not invented. Vibe 0 has no entry in the
// original (its own label lookup returns nothing), so this port matches
// that exactly - null, not a made-up placeholder.

export type VibeLabel = [name: string, description: string] | null;

export const VIBE_LABELS: Record<string, VibeLabel> = {
  "-8": ["Vibe Lock", "Exact subgenre and style — strictest possible"],
  "-7": ["Style Lock", "Same subgenre only, strict match"],
  "-6": ["Subgenre Lock", "Same subgenre plus one level broader"],
  "-5": ["Genre Wall", "Hard filter on — no genre crossover"],
  "-4": ["Subgenres OK", "Primary genre family, adjacent subgenres allowed"],
  "-3": ["Same Era, Same Feel", "Same genre plus immediate neighbors only"],
  "-2": ["Genre Priority", "Mostly same genre, light drift if era matches"],
  "-1": ["Genre First", "Genre is still top priority, slight wandering allowed"],
  "0": null,
  "1": ["Neighboring Vibe", "Blend in exactly 1 genre outside the seed's"],
  "2": ["Genre Bleed", "Blend in exactly 2 genres outside the seed's"],
  "3": ["Cross Pollinate", "Blend in exactly 3 genres outside the seed's"],
  "4": ["Genre Mashup", "Blend in exactly 4 genres outside the seed's"],
  "5": ["No Limits", "No genre restriction — anything goes"],
  "6": ["Anything Goes", "No genre restriction — anything goes (same as +5 for now — reserved for future tuning)"],
  "7": ["Wide Open", "No genre restriction — anything goes (same as +5 for now — reserved for future tuning)"],
  "8": ["Total Chaos", "No genre restriction — anything goes (same as +5 for now — reserved for future tuning)"]
};

export function getVibeLabel(vibe: number): VibeLabel {
  return VIBE_LABELS[String(vibe)] ?? null;
}
