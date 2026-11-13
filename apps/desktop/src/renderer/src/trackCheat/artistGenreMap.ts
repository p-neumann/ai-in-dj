// Phase 5, step 5 piece 17 (👍 thumbs-up reseed). Ported verbatim from
// reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx (source lines 89-166,
// 175-183), duplicated from the already-tested server copy
// (apps/server/src/engine/artistLookup.js) for the same cross-boundary
// reason as the rest of this feature's local-matching helpers. Data
// AND logic unchanged, including any duplicate keys already flagged
// for Mike in docs/QUESTIONS.md - a plain object literal keeps only
// the last value per duplicate key, same as the prototype and the
// server copy both already do.

import { getArtistTitle } from "../shared/getArtistTitle.ts";

export const ARTIST_GENRE_MAP: Record<string, string> = {
  "carrie underwood": "country", "luke bryan": "country", "blake shelton": "country", "kenny chesney": "country", "tim mcgraw": "country", "garth brooks": "country", "dolly parton": "country", "shania twain": "country", "brad paisley": "country", "keith urban": "country", "miranda lambert": "country", "florida georgia line": "country", "dierks bentley": "country", "eric church": "country", "jason aldean": "country", "toby keith": "country", "alan jackson": "country", "george strait": "country", "reba mcentire": "country", "zac brown band": "country", "big and rich": "country", "big & rich": "country", "johnny cash": "country", "willie nelson": "country", "waylon jennings": "country", "luke combs": "country", "morgan wallen": "country", "thomas rhett": "country", "chris stapleton": "country", "kacey musgraves": "country", "maren morris": "country", "dwight yoakam": "country", "clint black": "country", "cole swindell": "country", "lonestar": "country", "trace adkins": "country", "leann rimes": "country", "hardy": "country", "dustin lynch": "country",
  "jay-z": "hip hop", "kanye west": "hip hop", "drake": "hip hop", "kendrick lamar": "hip hop", "lil wayne": "hip hop", "eminem": "hip hop", "nicki minaj": "hip hop", "cardi b": "hip hop", "travis scott": "hip hop", "j. cole": "hip hop", "21 savage": "hip hop", "post malone": "hip hop", "future": "hip hop", "young jeezy": "hip hop", "t.i.": "hip hop", "ludacris": "hip hop", "snoop dogg": "hip hop", "dr. dre": "hip hop", "ice cube": "hip hop", "nas": "hip hop", "biggie": "hip hop", "tupac": "hip hop", "2pac": "hip hop", "notorious b.i.g.": "hip hop", "lil jon": "hip hop", "50 cent": "hip hop", "nelly": "hip hop", "outkast": "hip hop", "missy elliott": "hip hop", "busta rhymes": "hip hop", "gucci mane": "hip hop", "waka flocka": "hip hop", "meek mill": "hip hop", "wiz khalifa": "hip hop", "chance the rapper": "hip hop", "childish gambino": "hip hop", "a$ap rocky": "hip hop", "asap rocky": "hip hop", "chief keef": "hip hop", "lil uzi vert": "hip hop", "roddy ricch": "hip hop", "dababy": "hip hop", "polo g": "hip hop", "lil baby": "hip hop", "gunna": "hip hop", "t-pain": "hip hop", "ying yang twins": "hip hop", "crime mob": "hip hop", "trick daddy": "hip hop", "trina": "hip hop", "flo rida": "hip hop", "pitbull": "hip hop", "migos": "hip hop", "2 chainz": "hip hop", "big sean": "hip hop", "wax wreckaz": "hip hop",
  beyonce: "r&b", rihanna: "r&b", "alicia keys": "r&b", "mary j. blige": "r&b", "whitney houston": "r&b", "mariah carey": "r&b", "janet jackson": "r&b", "toni braxton": "r&b", brandy: "r&b", monica: "r&b", ciara: "r&b", ashanti: "r&b", "destiny's child": "r&b", tlc: "r&b", "en vogue": "r&b", sza: "r&b", "h.e.r.": "r&b", "jhene aiko": "r&b", "summer walker": "r&b", kehlani: "r&b", khalid: "r&b", "the weeknd": "r&b", miguel: "r&b", "frank ocean": "r&b", "john legend": "r&b", "charlie wilson": "r&b", "r. kelly": "r&b", "ne-yo": "r&b", mario: "r&b", "chris brown": "r&b", "trey songz": "r&b", tank: "r&b", "keyshia cole": "r&b", fantasia: "r&b", "jazmine sullivan": "r&b", "musiq soulchild": "r&b", "erykah badu": "r&b", "d'angelo": "r&b", usher: "r&b", tinashe: "r&b", "robin thicke": "r&b",
  "bad bunny": "reggaeton", "j balvin": "reggaeton", maluma: "reggaeton", ozuna: "reggaeton", "anuel aa": "reggaeton", "daddy yankee": "reggaeton", "nicky jam": "reggaeton", farruko: "reggaeton", sech: "reggaeton", "jhay cortez": "reggaeton", "rauw alejandro": "reggaeton", "karol g": "latin", "becky g": "latin", shakira: "latin", "marc anthony": "latin", "jennifer lopez": "latin", "gloria estefan": "latin", "enrique iglesias": "pop", "ricky martin": "latin", "luis fonsi": "latin", selena: "latin", "don omar": "reggaeton", wisin: "reggaeton", yandel: "reggaeton", "myke towers": "reggaeton", "willy william": "latin",
  "sean paul": "dancehall", "vybz kartel": "dancehall", "beenie man": "dancehall", "bounty killer": "dancehall", "elephant man": "dancehall", "busy signal": "dancehall", konshens: "dancehall", popcaan: "dancehall", alkaline: "dancehall", "bob marley": "reggae", "peter tosh": "reggae", "jimmy cliff": "reggae", "beres hammond": "reggae", shaggy: "dancehall", snow: "dancehall",
  "taylor swift": "pop", "ariana grande": "pop", "billie eilish": "pop", "olivia rodrigo": "pop", "dua lipa": "pop", "harry styles": "pop", "ed sheeran": "pop", "charlie puth": "pop", "sam smith": "pop", "demi lovato": "pop", "selena gomez": "pop", "miley cyrus": "pop", "katy perry": "pop", "lady gaga": "pop", "britney spears": "pop", nsync: "pop", "backstreet boys": "pop", "spice girls": "pop", "kylie minogue": "pop", robyn: "pop", sia: "pop", halsey: "pop", "camila cabello": "pop", "shawn mendes": "pop", "chappell roan": "pop", "sabrina carpenter": "pop", lorde: "pop", "lana del rey": "pop", adele: "pop", pink: "pop", "meghan trainor": "pop", lizzo: "pop", "bebe rexha": "pop", "rita ora": "pop", "jason derulo": "pop", "carly rae jepsen": "pop", "justin timberlake": "pop", saweetie: "pop",
  "daft punk": "house", "calvin harris": "edm", "david guetta": "edm", tiesto: "edm", deadmau5: "edm", skrillex: "edm", diplo: "edm", "martin garrix": "edm", avicii: "edm", marshmello: "edm", "the chainsmokers": "edm", zedd: "edm", afrojack: "edm", "swedish house mafia": "house", disclosure: "house", "duke dumont": "house",
  nirvana: "rock", "foo fighters": "rock", "green day": "rock", "blink-182": "rock", "the killers": "rock", muse: "rock", radiohead: "rock", coldplay: "rock", u2: "rock", "the rolling stones": "rock", "led zeppelin": "rock", "ac/dc": "rock", "guns n roses": "rock", metallica: "rock", "red hot chili peppers": "rock", "linkin park": "rock", "fall out boy": "rock", "panic at the disco": "rock", "my chemical romance": "rock", paramore: "rock", "imagine dragons": "rock", oasis: "rock", blur: "rock", "the cure": "rock", "depeche mode": "rock", "the smashing pumpkins": "rock", "bon jovi": "rock", journey: "rock", "rick springfield": "rock",
  "james brown": "funk", "rick james": "funk", prince: "funk", "earth wind fire": "funk", "earth wind & fire": "funk", parliament: "funk", "george clinton": "funk", "donna summer": "disco", "gloria gaynor": "disco", "bee gees": "disco", chic: "disco", "sister sledge": "disco", "village people": "disco", abba: "disco", "diana ross": "disco",
  "fedde le grand": "house", "chris lake": "house", fisher: "house", kaskade: "house",
  "gorgon city": "house", kygo: "house", "lane 8": "house", elderbrook: "house",
  "oliver heldens": "house", "sam feldt": "house", mesto: "house",
  "don diablo": "house", "thomas jack": "house", tchami: "house", malaa: "house",
  "black coffee": "house", themba: "house",
  "lost frequencies": "house", "robin schulz": "house", kungs: "house",
  "alle farben": "house", hugel: "house", regard: "house", ofenbach: "house",
  meduza: "house", "vintage culture": "house", "fisher (musician)": "house",
  "paul oakenfold": "edm", "eric prydz": "edm",
  "knife party": "edm", hardwell: "edm",
  "dimitri vegas": "edm", "like mike": "edm", "w&w": "edm", "nicky romero": "edm",
  "dash berlin": "edm", "armin van buuren": "edm", "paul van dyk": "edm",
  "above & beyond": "edm", "ferry corsten": "edm", "markus schulz": "edm",
  "bad gyal": "reggaeton",
  "young miko": "reggaeton", mora: "reggaeton", "eladio carrion": "reggaeton",
  feid: "reggaeton", blessd: "reggaeton", "ryan castro": "reggaeton",
  "peso pluma": "latin", "eslabon armado": "latin", "natanael cano": "latin",
  "junior h": "latin", "gabito ballesteros": "latin", "carín león": "latin",
  "banda ms": "latin", "los bukis": "latin", "marco antonio solís": "latin",
  "natasha bedingfield": "pop", "kelly clarkson": "pop",
  "avril lavigne": "pop", "nelly furtado": "pop", fergie: "pop",
  "gwen stefani": "pop", "no doubt": "pop", "sheryl crow": "pop",
  "vanessa carlton": "pop", "michelle branch": "pop", "colbie caillat": "pop",
  "sara bareilles": "pop", "jason mraz": "pop", "gavin degraw": "pop",
  onerepublic: "pop", train: "pop", "matchbox twenty": "pop",
  "hootie and the blowfish": "pop", "counting crows": "pop",
  "ghost town djs": "r&b", "tag team": "r&b", "sir mix-a-lot": "hip hop",
  "young mc": "hip hop", "tone loc": "hip hop", "vanilla ice": "hip hop",
  "mc hammer": "hip hop", coolio: "hip hop", "house of pain": "hip hop",
  xscape: "r&b",
  total: "r&b", "702": "r&b", "dru hill": "r&b", next: "r&b", silk: "r&b",
  "jagged edge": "r&b", joe: "r&b", ginuwine: "r&b", "112": "r&b",
  omarion: "r&b", "bow wow": "hip hop", lloyd: "r&b",
  "pretty ricky": "r&b", b5: "r&b", "pleasure p": "r&b",
  twista: "hip hop", "do or die": "hip hop", "crucial conflict": "hip hop",
  "bone thugs-n-harmony": "hip hop", "bone thugs n harmony": "hip hop",
  "three 6 mafia": "hip hop", "8ball & mjg": "hip hop", ugk: "hip hop",
  scarface: "hip hop", "z-ro": "hip hop", chamillionaire: "hip hop",
  "paul wall": "hip hop", "mike jones": "hip hop", "slim thug": "hip hop"
};

export function inferGenreLocal(trackName: string): string {
  const at = getArtistTitle(trackName);
  const artist = (at.artist || trackName).toLowerCase().trim();
  if (ARTIST_GENRE_MAP[artist]) return ARTIST_GENRE_MAP[artist];
  for (const key in ARTIST_GENRE_MAP) {
    if (artist.indexOf(key) !== -1 || key.indexOf(artist) !== -1) return ARTIST_GENRE_MAP[key];
  }
  return "";
}
