// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 697-699, 705-717, 867-887, 895). This is CLAUDE.md Section
// 4.2's vibe slider / BPM window table, straight from the source - see that
// section for the human-readable version of this same behavior.

export const VIBE_LABELS = {"-8":["Vibe Lock","Exact subgenre and style — strictest possible"],"-7":["Style Lock","Same subgenre only, strict match"],"-6":["Subgenre Lock","Same subgenre plus one level broader"],"-5":["Genre Wall","Hard filter on — no genre crossover"],"-4":["Subgenres OK","Primary genre family, adjacent subgenres allowed"],"-3":["Same Era, Same Feel","Same genre plus immediate neighbors only"],"-2":["Genre Priority","Mostly same genre, light drift if era matches"],"-1":["Genre First","Genre is still top priority, slight wandering allowed"],"0":null,"1":["Neighboring Vibe","Blend in exactly 1 genre outside the seed's"],"2":["Genre Bleed","Blend in exactly 2 genres outside the seed's"],"3":["Cross Pollinate","Blend in exactly 3 genres outside the seed's"],"4":["Genre Mashup","Blend in exactly 4 genres outside the seed's"],"5":["No Limits","No genre restriction — anything goes"],"6":["Anything Goes","No genre restriction — anything goes (same as +5 for now — reserved for future tuning)"],"7":["Wide Open","No genre restriction — anything goes (same as +5 for now — reserved for future tuning)"],"8":["Total Chaos","No genre restriction — anything goes (same as +5 for now — reserved for future tuning)"]};

export function getGenreEnforcement(v) { if (v <= -5) return "hard"; if (v <= -1) return "soft"; return "none"; }
export function getGenreTier(v) { if (v === -8) return 0; if (v === -7 || v === -6) return 1; if (v === -5 || v === -4) return 2; if (v === -3 || v === -2) return 3; return 4; }

export function getBpmRange(seedBpm, vibeOff, energyOff) {
  if (!seedBpm) return null;
  var bpm = parseFloat(seedBpm);
  if (!bpm) return null;
  if (energyOff !== 0) {
    var center = bpm + energyOff;
    return [center - 5, center + 5];
  }
  var half;
  if (vibeOff >= 5) half = 16 + (vibeOff - 5) * 4;
  else half = 8;
  return [bpm - half, bpm + half];
}

export function getYearInstruction(seedYear, seedName, vibeOff) {
  var yr = seedYear ? parseInt(seedYear) : 0;
  var label = seedYear ? "around " + yr : "the actual release year of \"" + seedName + "\" — use your own music knowledge to identify it confidently, even without local tag data";
  if (vibeOff === -1) return "";
  if (vibeOff === -2) return "Approximately half the results should be within 5 years of " + label + ". The other half can be any year.";
  if (vibeOff <= -3) return "Stay within 5 years of " + label + ". This is a hard requirement, not a preference — do not include tracks from a clearly different decade or musical period than the seed, even if they fit genre-wise.";
  if (vibeOff >= 5) return "Deliberately span MULTIPLE different eras/decades — do not cluster near " + label + ". Actively favor era variety (e.g. mix of 80s/90s/2000s/2010s/current) as part of the genre-blend instruction below, not just closeness to the seed's year.";
  if (vibeOff >= 1) return "Era is not restricted to " + label + " — some variety across decades is welcome alongside the genre blend below.";
  return "";
}

export function vibeInstruction(v, seedGenre, isRetry, seedGender) {
  var g = seedGenre || "the same genre";
  var genderNote = seedGender && v === -8 ? " Match artist gender: " + seedGender + " artists only (or groups)." : " ";
  if (v === -8) {
    if (isRetry) return "STRICT LOCK RETRY: You MUST return 30 tracks. Rank by closeness to seed's subgenre and style — include the 30 best matches even if some are slightly less exact. Never return fewer than 30. Stay in " + g + " exclusively." + genderNote;
    return "STRICT LOCK: Return tracks matching the exact subgenre AND style of the seed. You MUST return 30 tracks. Rank by closeness to seed's subgenre and style — include the 30 best matches even if some are slightly less exact. Never return fewer than 30." + genderNote;
  }
  if (v === -7) return "TIGHT LOCK: Same subgenre as seed, both genders, within " + g + " only.";
  if (v === -6) return "GENRE LOCK: Same subgenre plus one level broader. Stay in " + g + " family.";
  if (v === -5) return "BROAD LOCK: All subgenres within " + g + ". Do not leave this genre family.";
  if (v === -4) return "SOFT LOCK: Primary " + g + " family. Adjacent subgenres ok.";
  if (v === -3) return "LEAN LOCK: " + g + " plus immediate neighboring genres sharing same era and energy.";
  if (v === -2) return "LOOSE LOCK: Mostly " + g + " with light genre wandering if era matches.";
  if (v === -1) return "NEAR DEFAULT: Mostly " + g + " with slight wandering.";
  if (v === 0) return "DEFAULT: GENRE IS TOP PRIORITY. Always match the genre family of the seed first.";
  if (v === 1) return "1 CONTRASTING GENRE: Stay mostly in " + g + " but deliberately blend in exactly 1 genre outside " + g + ".";
  if (v === 2) return "2 CONTRASTING GENRES: Blend in exactly 2 genres outside " + g + " alongside " + g + ".";
  if (v === 3) return "3 CONTRASTING GENRES: Blend in exactly 3 genres outside " + g + " alongside " + g + ".";
  if (v === 4) return "4 CONTRASTING GENRES: Blend in exactly 4 genres outside " + g + " alongside " + g + ".";
  if (v === 5) return "FREE FOR ALL: No genre restriction whatsoever. Ignore " + g + " entirely — actively aim for AT LEAST 5 different genres represented across the 20 candidates. More variety is better.";
  if (v === 6) return "FREE FOR ALL: No genre restriction whatsoever. Ignore " + g + " entirely — actively aim for AT LEAST 6 different genres represented across the 20 candidates. More variety is better.";
  if (v === 7) return "FREE FOR ALL: No genre restriction whatsoever. Ignore " + g + " entirely — actively aim for AT LEAST 7 different genres represented across the 20 candidates. More variety is better.";
  return "FREE FOR ALL: No genre restriction whatsoever. Ignore " + g + " entirely — actively aim for AT LEAST 8 different genres represented across the 20 candidates, the widest possible spread. More variety is better.";
}
