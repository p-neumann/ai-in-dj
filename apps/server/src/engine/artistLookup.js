// Ported verbatim from reference/CheatCodeDJ_v_1_0_22016.sanitized.jsx
// (source lines 89-166, 174-286, 591-643). Logic AND data unchanged,
// including the duplicate keys in ARTIST_ERA_MAP already flagged for Mike
// in docs/QUESTIONS.md ("Suspected bug: duplicate keys...") - do not fix
// them here; a plain JS object literal keeps only the last value for each
// duplicate key, same as the prototype.

import { getArtistTitle, getRawTitleFromName } from "./trackNames.js";

export const ARTIST_GENRE_MAP = {
  "carrie underwood":"country","luke bryan":"country","blake shelton":"country","kenny chesney":"country","tim mcgraw":"country","garth brooks":"country","dolly parton":"country","shania twain":"country","brad paisley":"country","keith urban":"country","miranda lambert":"country","florida georgia line":"country","dierks bentley":"country","eric church":"country","jason aldean":"country","toby keith":"country","alan jackson":"country","george strait":"country","reba mcentire":"country","zac brown band":"country","big and rich":"country","big & rich":"country","johnny cash":"country","willie nelson":"country","waylon jennings":"country","luke combs":"country","morgan wallen":"country","thomas rhett":"country","chris stapleton":"country","kacey musgraves":"country","maren morris":"country","dwight yoakam":"country","clint black":"country","cole swindell":"country","lonestar":"country","trace adkins":"country","leann rimes":"country","hardy":"country","dustin lynch":"country",
  "jay-z":"hip hop","kanye west":"hip hop","drake":"hip hop","kendrick lamar":"hip hop","lil wayne":"hip hop","eminem":"hip hop","nicki minaj":"hip hop","cardi b":"hip hop","travis scott":"hip hop","j. cole":"hip hop","21 savage":"hip hop","post malone":"hip hop","future":"hip hop","young jeezy":"hip hop","t.i.":"hip hop","ludacris":"hip hop","snoop dogg":"hip hop","dr. dre":"hip hop","ice cube":"hip hop","nas":"hip hop","biggie":"hip hop","tupac":"hip hop","2pac":"hip hop","notorious b.i.g.":"hip hop","lil jon":"hip hop","50 cent":"hip hop","nelly":"hip hop","outkast":"hip hop","missy elliott":"hip hop","busta rhymes":"hip hop","gucci mane":"hip hop","waka flocka":"hip hop","meek mill":"hip hop","wiz khalifa":"hip hop","chance the rapper":"hip hop","childish gambino":"hip hop","a$ap rocky":"hip hop","asap rocky":"hip hop","chief keef":"hip hop","lil uzi vert":"hip hop","roddy ricch":"hip hop","dababy":"hip hop","polo g":"hip hop","lil baby":"hip hop","gunna":"hip hop","t-pain":"hip hop","ying yang twins":"hip hop","crime mob":"hip hop","trick daddy":"hip hop","trina":"hip hop","flo rida":"hip hop","pitbull":"hip hop","migos":"hip hop","2 chainz":"hip hop","big sean":"hip hop","wax wreckaz":"hip hop",
  "beyonce":"r&b","rihanna":"r&b","alicia keys":"r&b","mary j. blige":"r&b","whitney houston":"r&b","mariah carey":"r&b","janet jackson":"r&b","toni braxton":"r&b","brandy":"r&b","monica":"r&b","ciara":"r&b","ashanti":"r&b","destiny's child":"r&b","tlc":"r&b","en vogue":"r&b","sza":"r&b","h.e.r.":"r&b","jhene aiko":"r&b","summer walker":"r&b","kehlani":"r&b","khalid":"r&b","the weeknd":"r&b","miguel":"r&b","frank ocean":"r&b","john legend":"r&b","charlie wilson":"r&b","r. kelly":"r&b","ne-yo":"r&b","mario":"r&b","chris brown":"r&b","trey songz":"r&b","tank":"r&b","keyshia cole":"r&b","fantasia":"r&b","jazmine sullivan":"r&b","musiq soulchild":"r&b","erykah badu":"r&b","d'angelo":"r&b","usher":"r&b","tinashe":"r&b","robin thicke":"r&b",
  "bad bunny":"reggaeton","j balvin":"reggaeton","maluma":"reggaeton","ozuna":"reggaeton","anuel aa":"reggaeton","daddy yankee":"reggaeton","nicky jam":"reggaeton","farruko":"reggaeton","sech":"reggaeton","jhay cortez":"reggaeton","rauw alejandro":"reggaeton","karol g":"latin","becky g":"latin","shakira":"latin","marc anthony":"latin","jennifer lopez":"latin","gloria estefan":"latin","enrique iglesias":"latin","ricky martin":"latin","luis fonsi":"latin","selena":"latin","don omar":"reggaeton","wisin":"reggaeton","yandel":"reggaeton","myke towers":"reggaeton","willy william":"latin",
  "sean paul":"dancehall","vybz kartel":"dancehall","beenie man":"dancehall","bounty killer":"dancehall","elephant man":"dancehall","busy signal":"dancehall","konshens":"dancehall","popcaan":"dancehall","alkaline":"dancehall","bob marley":"reggae","peter tosh":"reggae","jimmy cliff":"reggae","beres hammond":"reggae","shaggy":"dancehall","snow":"dancehall",
  "taylor swift":"pop","ariana grande":"pop","billie eilish":"pop","olivia rodrigo":"pop","dua lipa":"pop","harry styles":"pop","ed sheeran":"pop","charlie puth":"pop","sam smith":"pop","demi lovato":"pop","selena gomez":"pop","miley cyrus":"pop","katy perry":"pop","lady gaga":"pop","britney spears":"pop","nsync":"pop","backstreet boys":"pop","spice girls":"pop","kylie minogue":"pop","robyn":"pop","sia":"pop","halsey":"pop","camila cabello":"pop","shawn mendes":"pop","chappell roan":"pop","sabrina carpenter":"pop","lorde":"pop","lana del rey":"pop","adele":"pop","pink":"pop","meghan trainor":"pop","lizzo":"pop","bebe rexha":"pop","rita ora":"pop","jason derulo":"pop","carly rae jepsen":"pop","justin timberlake":"pop","saweetie":"pop",
  "daft punk":"house","calvin harris":"edm","david guetta":"edm","tiesto":"edm","deadmau5":"edm","skrillex":"edm","diplo":"edm","martin garrix":"edm","avicii":"edm","marshmello":"edm","the chainsmokers":"edm","zedd":"edm","afrojack":"edm","swedish house mafia":"house","disclosure":"house","duke dumont":"house",
  "nirvana":"rock","foo fighters":"rock","green day":"rock","blink-182":"rock","the killers":"rock","muse":"rock","radiohead":"rock","coldplay":"rock","u2":"rock","the rolling stones":"rock","led zeppelin":"rock","ac/dc":"rock","guns n roses":"rock","metallica":"rock","red hot chili peppers":"rock","linkin park":"rock","fall out boy":"rock","panic at the disco":"rock","my chemical romance":"rock","paramore":"rock","imagine dragons":"rock","oasis":"rock","blur":"rock","the cure":"rock","depeche mode":"rock","the smashing pumpkins":"rock","bon jovi":"rock","journey":"rock","rick springfield":"rock",
  "james brown":"funk","rick james":"funk","prince":"funk","earth wind fire":"funk","earth wind & fire":"funk","parliament":"funk","george clinton":"funk","donna summer":"disco","gloria gaynor":"disco","bee gees":"disco","chic":"disco","sister sledge":"disco","village people":"disco","abba":"disco","diana ross":"disco",
  "fedde le grand":"house","chris lake":"house","fisher":"house","kaskade":"house",
  "gorgon city":"house","kygo":"house","lane 8":"house","elderbrook":"house",
  "duke dumont":"house","oliver heldens":"house","sam feldt":"house","mesto":"house",
  "don diablo":"house","thomas jack":"house","tchami":"house","malaa":"house",
  "black coffee":"house","themba":"house","enrique iglesias":"pop",
  "lost frequencies":"house","robin schulz":"house","kungs":"house",
  "alle farben":"house","hugel":"house","regard":"house","ofenbach":"house",
  "meduza":"house","vintage culture":"house","fisher (musician)":"house",
  "chris brown":"r&b","paul oakenfold":"edm","deadmau5":"edm","eric prydz":"edm",
  "swedish house mafia":"house","knife party":"edm","hardwell":"edm",
  "dimitri vegas":"edm","like mike":"edm","w&w":"edm","nicky romero":"edm",
  "dash berlin":"edm","armin van buuren":"edm","paul van dyk":"edm",
  "above & beyond":"edm","ferry corsten":"edm","markus schulz":"edm",
  "sech":"reggaeton","jhay cortez":"reggaeton","myke towers":"reggaeton",
  "rauw alejandro":"reggaeton","anuel aa":"reggaeton","bad gyal":"reggaeton",
  "young miko":"reggaeton","mora":"reggaeton","eladio carrion":"reggaeton",
  "feid":"reggaeton","blessd":"reggaeton","ryan castro":"reggaeton",
  "peso pluma":"latin","eslabon armado":"latin","natanael cano":"latin",
  "junior h":"latin","gabito ballesteros":"latin","carín león":"latin",
  "banda ms":"latin","los bukis":"latin","marco antonio solís":"latin",
  "natasha bedingfield":"pop","kelly clarkson":"pop","pink":"pop",
  "avril lavigne":"pop","nelly furtado":"pop","fergie":"pop",
  "gwen stefani":"pop","no doubt":"pop","sheryl crow":"pop",
  "vanessa carlton":"pop","michelle branch":"pop","colbie caillat":"pop",
  "sara bareilles":"pop","jason mraz":"pop","gavin degraw":"pop",
  "onerepublic":"pop","train":"pop","matchbox twenty":"pop",
  "hootie and the blowfish":"pop","counting crows":"pop",
  "ghost town djs":"r&b","tag team":"r&b","sir mix-a-lot":"hip hop",
  "young mc":"hip hop","tone loc":"hip hop","vanilla ice":"hip hop",
  "mc hammer":"hip hop","coolio":"hip hop","house of pain":"hip hop",
  "destiny's child":"r&b","tlc":"r&b","en vogue":"r&b","xscape":"r&b",
  "total":"r&b","702":"r&b","dru hill":"r&b","next":"r&b","silk":"r&b",
  "jagged edge":"r&b","joe":"r&b","ginuwine":"r&b","112":"r&b",
  "mario":"r&b","omarion":"r&b","bow wow":"hip hop","lloyd":"r&b",
  "pretty ricky":"r&b","b5":"r&b","pleasure p":"r&b",
  "twista":"hip hop","do or die":"hip hop","crucial conflict":"hip hop",
  "bone thugs-n-harmony":"hip hop","bone thugs n harmony":"hip hop",
  "three 6 mafia":"hip hop","8ball & mjg":"hip hop","ugk":"hip hop",
  "scarface":"hip hop","z-ro":"hip hop","chamillionaire":"hip hop",
  "paul wall":"hip hop","mike jones":"hip hop","slim thug":"hip hop"
};

export const ARTIST_GENDER_MAP = {
  "beyonce":"female","rihanna":"female","alicia keys":"female","mary j. blige":"female","whitney houston":"female","mariah carey":"female","janet jackson":"female","toni braxton":"female","brandy":"female","monica":"female","ciara":"female","ashanti":"female","sza":"female","h.e.r.":"female","jhene aiko":"female","summer walker":"female","kehlani":"female","taylor swift":"female","ariana grande":"female","billie eilish":"female","olivia rodrigo":"female","dua lipa":"female","lady gaga":"female","britney spears":"female","katy perry":"female","selena gomez":"female","miley cyrus":"female","halsey":"female","camila cabello":"female","chappell roan":"female","sabrina carpenter":"female","lorde":"female","lana del rey":"female","adele":"female","pink":"female","meghan trainor":"female","lizzo":"female","bebe rexha":"female","rita ora":"female","carly rae jepsen":"female","sia":"female","robyn":"female","kylie minogue":"female","donna summer":"female","gloria gaynor":"female","diana ross":"female","robin s":"female","crystal waters":"female","amber":"female","la bouche":"female","ce ce peniston":"female","nicki minaj":"female","cardi b":"female","missy elliott":"female","trina":"female","saweetie":"female","karol g":"female","becky g":"female","shakira":"female","jennifer lopez":"female","gloria estefan":"female","selena":"female","miranda lambert":"female","carrie underwood":"female","shania twain":"female","dolly parton":"female","reba mcentire":"female","maren morris":"female","kacey musgraves":"female","leann rimes":"female","keyshia cole":"female","fantasia":"female","jazmine sullivan":"female","tinashe":"female","en vogue":"group","spice girls":"group","tlc":"group","destiny's child":"group","sister sledge":"group",
  "jay-z":"male","kanye west":"male","drake":"male","kendrick lamar":"male","lil wayne":"male","eminem":"male","travis scott":"male","j. cole":"male","21 savage":"male","post malone":"male","future":"male","young jeezy":"male","t.i.":"male","ludacris":"male","snoop dogg":"male","dr. dre":"male","ice cube":"male","nas":"male","tupac":"male","2pac":"male","notorious b.i.g.":"male","lil jon":"male","50 cent":"male","nelly":"male","busta rhymes":"male","gucci mane":"male","waka flocka":"male","meek mill":"male","wiz khalifa":"male","chance the rapper":"male","childish gambino":"male","a$ap rocky":"male","asap rocky":"male","chief keef":"male","lil uzi vert":"male","roddy ricch":"male","dababy":"male","polo g":"male","lil baby":"male","gunna":"male","t-pain":"male","flo rida":"male","pitbull":"male","2 chainz":"male","big sean":"male","the weeknd":"male","miguel":"male","frank ocean":"male","john legend":"male","charlie wilson":"male","r. kelly":"male","ne-yo":"male","mario":"male","chris brown":"male","trey songz":"male","tank":"male","musiq soulchild":"male","d'angelo":"male","usher":"male","robin thicke":"male","khalid":"male","bad bunny":"male","j balvin":"male","maluma":"male","ozuna":"male","anuel aa":"male","daddy yankee":"male","nicky jam":"male","farruko":"male","sech":"male","jhay cortez":"male","rauw alejandro":"male","don omar":"male","wisin":"male","yandel":"male","myke towers":"male","willy william":"male","sean paul":"male","vybz kartel":"male","beenie man":"male","bounty killer":"male","elephant man":"male","busy signal":"male","konshens":"male","popcaan":"male","alkaline":"male","bob marley":"male","peter tosh":"male","jimmy cliff":"male","beres hammond":"male","shaggy":"male","luke bryan":"male","blake shelton":"male","kenny chesney":"male","tim mcgraw":"male","garth brooks":"male","brad paisley":"male","keith urban":"male","dierks bentley":"male","eric church":"male","jason aldean":"male","toby keith":"male","alan jackson":"male","george strait":"male","johnny cash":"male","willie nelson":"male","waylon jennings":"male","luke combs":"male","morgan wallen":"male","thomas rhett":"male","chris stapleton":"male","dwight yoakam":"male","clint black":"male","cole swindell":"male","trace adkins":"male","hardy":"male","dustin lynch":"male","james brown":"male","rick james":"male","prince":"male","george clinton":"male","haddaway":"male","calvin harris":"male","david guetta":"male","tiesto":"male","deadmau5":"male","skrillex":"male","diplo":"male","martin garrix":"male","avicii":"male","marshmello":"male","zedd":"male","afrojack":"male","ed sheeran":"male","charlie puth":"male","sam smith":"male","harry styles":"male","shawn mendes":"male","jason derulo":"male","justin timberlake":"male",
  "migos":"group","ying yang twins":"group","outkast":"group","nsync":"group","backstreet boys":"group","bee gees":"group","chic":"group","village people":"group","abba":"group","earth wind & fire":"group","earth wind fire":"group","parliament":"group","daft punk":"group","swedish house mafia":"group","the chainsmokers":"group","florida georgia line":"group","big and rich":"group","big & rich":"group","zac brown band":"group","real mccoy":"group","ace of base":"group","2 unlimited":"group","snap":"group","c+c music factory":"group","black box":"group","deee-lite":"group","technotronic":"group","culture beat":"group","foo fighters":"group","green day":"group","blink-182":"group","the killers":"group","muse":"group","radiohead":"group","coldplay":"group","u2":"group","the rolling stones":"group","led zeppelin":"group","ac/dc":"group","guns n roses":"group","metallica":"group","red hot chili peppers":"group","linkin park":"group","fall out boy":"group","panic at the disco":"group","my chemical romance":"group","paramore":"group","imagine dragons":"group","oasis":"group","blur":"group","the cure":"group","depeche mode":"group","the smashing pumpkins":"group",  "disclosure":"group","la bouche":"group","lonestar":"group","wax wreckaz":"group",
  "paramore":"female","jimmy eat world":"group","owl city":"male","dead sara":"female","neon trees":"group","one republic":"group","onerepublic":"group","papa roach":"group","killers":"group","the killers":"group",
  "akon":"male","lloyd":"male","fergie":"female","chelley":"female","major lazer":"group","city girls":"group","dj class":"male","kelis":"female","new boyz":"group","dev":"female","roscoe dash":"male","soulja boy":"male","iyaz":"male","jackson 5":"group","gorilla zoe":"male","catarcs":"group","dev (singer)":"female",
  "smashing pumpkins":"group","weezer":"group","third eye blind":"group","matchbox twenty":"group","goo goo dolls":"group","train":"group","maroon 5":"group","fall out boy":"group","all time low":"group","yellowcard":"group","simple plan":"group","good charlotte":"group","sum 41":"group","avril lavigne":"female","alanis morissette":"female","fiona apple":"female","tori amos":"female","no doubt":"group","evanescence":"female","flyleaf":"female","within temptation":"female","garbage":"female","hole":"female","l7":"group","sleater-kinney":"group","letlive":"group",
  "blondie":"female","pat benatar":"female","stevie nicks":"female","fleetwood mac":"group","heart":"group","joan jett":"female","cyndi lauper":"female","tina turner":"female","whitney":"female","celine dion":"female","mariah":"female","christina aguilera":"female","christina milian":"female",
  "kygo":"male","alesso":"male","steve aoki":"male","r3hab":"male","dillon francis":"male","galantis":"group","clean bandit":"group","major lazer (group)":"group","alan walker":"male","illenium":"male","gryffin":"male","NF":"male",
  "twista":"male","crime mob":"group","dem franchize boyz":"group","unk":"male","dj unk":"male","mims":"male","yung joc":"male","plies":"male","rick ross":"male","wale":"male","2 chainz":"male","gucci mane":"male","young thug":"male","21 savage":"male","megan thee stallion":"female","city girls (group)":"group","cardi b":"female","saweetie":"female","doja cat":"female","glorilla":"female","sexyy red":"female","latto":"female","flo milli":"female","ice spice":"female","coi leray":"female","rubi rose":"female","stefflon don":"female","shenseea":"female","spice":"female",
  "blackstreet":"group","next":"group","112":"group","one twelve":"group","jodeci":"group","boyz ii men":"group","new edition":"group","silk":"group","dru hill":"group","jagged edge":"group","city high":"group","soul for real":"group","total":"group","xscape":"group","702":"group","brownstone":"group","sws":"group","sister 2 sister":"group",
  "jagged edge (group)":"group","tank (singer)":"male","jaheim":"male","case":"male","ginuwine":"male","montell jordan":"male","tyrese":"male","brian mcknight":"male","joe (singer)":"male","avant":"male","carl thomas":"male","musiq":"male",
  "jay sean":"male","sean kingston":"male","akon (singer)":"male","t-pain":"male","ne-yo (singer)":"male","jeremih":"male","tank":"male",
  "ying yang twins":"group","dem franchize":"group","yin yang twins":"group",
  "panic at the disco":"male","my chemical romance (group)":"group","30 seconds to mars":"male","linkin park (group)":"group","limp bizkit":"male","korn":"group","slipknot":"group","papa roach (group)":"group","staind":"male","puddle of mudd":"male","seether":"male","theory of a deadman":"male","3 doors down":"group","nickelback":"male","creed":"male","default":"male",
  "mark morrison":"male","janet jackson":"female","jazzy jeff":"male","fresh prince":"male","tribe called quest":"group","a tribe called quest":"group","soul 4 real":"group","112 group":"group","soul ii soul":"group",
  "will i am":"male","will.i.am":"male","williams":"male","apl.de.ap":"male","apldeap":"male","taboo":"male","black eyed peas":"group","bep":"group"
};

// NOTE (kept per user instruction, do not "fix"): several keys repeat with
// different values (e.g. "bad bunny": 2018 then later 2022) - only the last
// one written survives, same as the prototype. Flagged for Mike in
// docs/QUESTIONS.md, not altered here.
export const ARTIST_ERA_MAP = {
  "the beatles":1965,"rolling stones":1965,"james brown":1965,"aretha franklin":1967,
  "marvin gaye":1965,"stevie wonder":1965,"diana ross":1965,"the supremes":1965,
  "otis redding":1965,"ray charles":1962,"sam cooke":1963,"wilson pickett":1966,
  "earth wind & fire":1975,"earth wind fire":1975,"parliament":1975,"george clinton":1975,
  "kool & the gang":1975,"chic":1978,"donna summer":1977,"bee gees":1977,
  "gloria gaynor":1978,"sister sledge":1979,"village people":1978,"abba":1975,
  "diana ross":1975,"jackson 5":1972,"barry white":1974,"al green":1973,
  "michael jackson":1983,"prince":1983,"madonna":1985,"whitney houston":1985,
  "lionel richie":1983,"tina turner":1984,"rick james":1982,"devo":1982,
  "run dmc":1986,"ll cool j":1986,"beastie boys":1987,"public enemy":1988,
  "big daddy kane":1988,"rakim":1987,"krs-one":1988,"slick rick":1988,
  "salt n pepa":1987,"queen latifah":1989,"mc lyte":1988,
  "new edition":1984,"bobby brown":1988,"bell biv devoe":1990,
  "notorious b.i.g.":1995,"biggie":1995,"tupac":1996,"2pac":1996,
  "nas":1994,"jay-z":1996,"wu-tang clan":1994,"snoop dogg":1993,
  "dr. dre":1992,"ice cube":1990,"warren g":1994,"nate dogg":1994,
  "bone thugs-n-harmony":1995,"bone thugs n harmony":1995,
  "outkast":1994,"goodie mob":1995,"scarface":1993,"ugk":1992,
  "mary j. blige":1992,"r. kelly":1993,"boyz ii men":1994,
  "tlc":1992,"destiny's child":1998,"en vogue":1990,"xscape":1993,
  "brandy":1994,"monica":1995,"toni braxton":1993,"aaliyah":1994,
  "usher":1997,"ginuwine":1997,"dru hill":1996,"jodeci":1991,
  "blackstreet":1994,"next":1997,"112":1996,"jagged edge":1997,
  "ghost town djs":1996,"tag team":1993,"sir mix-a-lot":1992,
  "montell jordan":1995,"case":1996,
  "puff daddy":1997,"diddy":1997,"mase":1997,"lil kim":1996,
  "foxy brown":1996,"missy elliott":1997,"busta rhymes":1996,
  "dmx":1998,"eve":1999,
  "timbaland":1997,"neptunes":2001,"pharrell":2001,
  "ace of base":1993,"haddaway":1993,"robin s":1993,
  "real mccoy":1994,"corona":1994,"la bouche":1995,
  "nelly":2002,"ludacris":2001,"lil jon":2004,"ying yang twins":2004,
  "young jeezy":2005,"gucci mane":2005,"t.i.":2003,"lil wayne":2004,
  "kanye west":2004,"common":2005,"john legend":2004,"alicia keys":2001,
  "beyonce":2003,"ciara":2004,"ashanti":2002,"ja rule":2001,
  "50 cent":2003,"g-unit":2003,"game":2005,"lloyd banks":2004,
  "young buck":2004,"chingy":2003,"david banner":2003,
  "crime mob":2004,"d4l":2005,"dem franchize boyz":2004,
  "snap":2004,"soulja boy":2007,"yung joc":2006,"mims":2007,
  "t-pain":2005,"akon":2004,"sean kingston":2007,"chris brown":2005,
  "rihanna":2005,"ne-yo":2006,"mario":2004,"omarion":2005,
  "bow wow":2001,"b5":2005,"pretty ricky":2005,
  "daddy yankee":2004,"reggaeton":2004,"don omar":2004,
  "fergie":2006,"black eyed peas":2003,"will.i.am":2003,
  "twista":2004,"do or die":2001,"three 6 mafia":2005,
  "chamillionaire":2005,"paul wall":2005,"mike jones":2005,
  "slim thug":2005,"z-ro":2005,"scarface":2002,
  "shop boyz":2007,"flo rida":2008,"pitbull":2004,
  "drake":2012,"kendrick lamar":2012,"j. cole":2011,"big sean":2011,
  "meek mill":2012,"wiz khalifa":2011,"mac miller":2011,
  "tyga":2012,"2 chainz":2012,"future":2012,"young thug":2014,
  "travis scott":2015,"post malone":2016,"lil uzi vert":2016,
  "cardi b":2017,"nicki minaj":2010,"iggy azalea":2014,
  "meghan trainor":2014,"charlie puth":2015,"shawn mendes":2015,
  "camila cabello":2016,"halsey":2015,"dua lipa":2017,
  "the weeknd":2012,"miguel":2010,"frank ocean":2012,
  "khalid":2017,"h.e.r.":2017,"jhene aiko":2013,"sza":2017,
  "migos":2013,"21 savage":2016,"dababy":2019,"roddy ricch":2019,
  "lil baby":2017,"gunna":2018,"polo g":2019,
  "saweetie":2018,"city girls":2018,"megan thee stallion":2019,
  "blueface":2018,"doja cat":2018,"lizzo":2019,
  "bad bunny":2018,"j balvin":2015,"maluma":2015,
  "ozuna":2016,"anuel aa":2017,"rauw alejandro":2019,
  "olivia rodrigo":2021,"dua lipa":2020,"the kid laroi":2021,
  "lil nas x":2019,"jack harlow":2020,"polo g":2020,
  "rod wave":2019,"polo g":2021,"glorilla":2022,
  "sexyy red":2023,"ice spice":2022,"latto":2021,
  "peso pluma":2023,"bad bunny":2022,"tyler the creator":2021
};

var DYNAMIC_ARTIST_ERA_CACHE = {};
var DYNAMIC_TITLE_ERA_CACHE = {};

export function inferArtistEra(trackName) {
  var at = getArtistTitle(trackName);
  var artist = (at.artist || trackName).toLowerCase().trim();
  if (DYNAMIC_ARTIST_ERA_CACHE[artist]) return DYNAMIC_ARTIST_ERA_CACHE[artist];
  if (ARTIST_ERA_MAP[artist]) return ARTIST_ERA_MAP[artist];
  var artistNoDots = artist.replace(/\./g, "");
  for (var key in ARTIST_ERA_MAP) {
    var keyNoDots = key.replace(/\./g, "");
    if (keyNoDots.length < 4) continue;
    if (artistNoDots.indexOf(keyNoDots) !== -1 || keyNoDots.indexOf(artistNoDots) !== -1) return ARTIST_ERA_MAP[key];
  }
  var titleKey = getRawTitleFromName(trackName);
  if (titleKey && DYNAMIC_TITLE_ERA_CACHE[titleKey]) return DYNAMIC_TITLE_ERA_CACHE[titleKey];
  return 0;
}

export function inferGenreLocal(trackName) {
  var at = getArtistTitle(trackName);
  var artist = (at.artist || trackName).toLowerCase().trim();
  if (ARTIST_GENRE_MAP[artist]) return ARTIST_GENRE_MAP[artist];
  for (var key in ARTIST_GENRE_MAP) {
    if (artist.indexOf(key) !== -1 || key.indexOf(artist) !== -1) return ARTIST_GENRE_MAP[key];
  }
  return "";
}

function lookupGenderSingle(artist) {
  artist = artist.trim();
  if (!artist) return "";
  if (ARTIST_GENDER_MAP[artist]) return ARTIST_GENDER_MAP[artist];
  for (var key in ARTIST_GENDER_MAP) {
    if (artist.indexOf(key) !== -1 || key.indexOf(artist) !== -1) return ARTIST_GENDER_MAP[key];
  }
  return "";
}

function splitArtists(artistString) {
  return artistString.split(/\s*(?:&|\bvs\.?\b|\bx\b|\bfeat\.?\b|\bft\.?\b|\bwith\b|,)\s*/i).map(function (s) { return s.trim(); }).filter(Boolean);
}

export function inferArtistGender(trackName) {
  var at = getArtistTitle(trackName);
  var artistField = (at.artist || trackName).toLowerCase().trim();
  if (!artistField) return "";
  var direct = lookupGenderSingle(artistField);
  if (direct) return direct;
  var names = splitArtists(artistField);
  if (names.length <= 1) return "";
  var genders = names.map(lookupGenderSingle).filter(Boolean);
  if (!genders.length) return "";
  var unique = Array.from(new Set(genders));
  if (unique.length === 1) return unique[0];
  return "group";
}
