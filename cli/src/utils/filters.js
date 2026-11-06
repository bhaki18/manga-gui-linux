/**
 * Shared Genre & Audio Filter Definitions and Mapping Tables
 */

const GENRE_DEFINITIONS = {
  action: {
    awId: '1',
    auGenre: { id: 51, name: 'Action' },
    mwSlug: 'azione',
    mpGenre: 'Action',
    mdTag: '391b0423-d847-456f-aff0-8b0cfc03066b',
    keywords: ['action', 'azione', 'combattimento']
  },
  adventure: {
    awId: '2',
    auGenre: { id: 21, name: 'Adventure' },
    mwSlug: 'avventura',
    mpGenre: 'Adventure',
    mdTag: '87cc87cd-a395-47af-b27a-93258283bbc6',
    keywords: ['adventure', 'avventura']
  },
  shounen: {
    awId: '32',
    auGenre: { id: 34, name: 'Shounen' },
    mwSlug: 'shounen',
    mpGenre: 'Shounen',
    mdDemographic: 'shounen',
    keywords: ['shounen', 'shonen']
  },
  seinen: {
    awId: '29',
    auGenre: { id: 49, name: 'Seinen' },
    mwSlug: 'seinen',
    mpGenre: 'Seinen',
    mdDemographic: 'seinen',
    keywords: ['seinen', 'maturo', 'adulti']
  },
  shoujo: {
    awId: '30',
    auGenre: { id: 18, name: 'Shoujo' },
    mwSlug: 'shoujo',
    mpGenre: 'Shoujo',
    mdDemographic: 'shoujo',
    keywords: ['shoujo', 'shojo']
  },
  isekai: {
    awId: '49',
    auGenre: { id: 53, name: 'Isekai' },
    mwSlug: 'fantasy',
    mpGenre: 'Isekai',
    mdTag: 'ace04997-f6bd-436e-b261-779182193d3d',
    keywords: ['isekai', 'reincarnation', 'reincarnazione', 'altro mondo', 'another world']
  },
  fantasy: {
    awId: '9',
    auGenre: { id: 9, name: 'Fantasy' },
    mwSlug: 'fantasy',
    mpGenre: 'Fantasy',
    mdTag: 'cdc58593-87dd-415e-bbc0-2ec27bf404cc',
    keywords: ['fantasy', 'fantasia', 'magia', 'magic']
  },
  comedy: {
    awId: '4',
    auGenre: { id: 37, name: 'Comedy' },
    mwSlug: 'commedia',
    mpGenre: 'Comedy',
    mdTag: '4d32cc48-9f00-4cca-9b5a-a839f0764984',
    keywords: ['comedy', 'commedia', 'umorismo', 'parodia']
  },
  romance: {
    awId: '46',
    auGenre: { id: 17, name: 'Romance' },
    mwSlug: 'romantico',
    mpGenre: 'Romance',
    mdTag: '423e2eae-a7a2-4a8b-ac03-a8351462d71d',
    keywords: ['romance', 'romantico', 'sentimentale']
  },
  drama: {
    awId: '7',
    auGenre: { id: 22, name: 'Drama' },
    mwSlug: 'drammatico',
    mpGenre: 'Drama',
    mdTag: 'b9af3a63-f058-46de-a9a0-e0c13906197a',
    keywords: ['drama', 'drammatico', 'tragico', 'tragedy']
  },
  scifi: {
    awId: '28',
    auGenre: { id: 40, name: 'Sci-fi' },
    mwSlug: 'sci-fi',
    mpGenre: 'Sci-Fi',
    mdTag: '256c8bd9-4904-4360-bf4f-508a76d67183',
    keywords: ['sci-fi', 'scifi', 'fantascienza', 'spazio', 'space', 'cyberpunk']
  },
  horror: {
    awId: '13',
    auGenre: { id: 3, name: 'Horror' },
    mwSlug: 'horror',
    mpGenre: 'Horror',
    mdTag: 'cdad7e68-1419-41dd-bdce-27753074a640',
    keywords: ['horror', 'gore', 'splatter']
  },
  mystery: {
    awId: '21',
    auGenre: { id: 24, name: 'Mystery' },
    mwSlug: 'mistero',
    mpGenre: 'Mystery',
    mdTag: 'ee968100-4191-4968-93d3-f82d72be7e46',
    keywords: ['mystery', 'mistero', 'giallo', 'investigativo']
  },
  supernatural: {
    awId: '37',
    auGenre: { id: 42, name: 'Supernatural' },
    mwSlug: 'soprannaturale',
    mpGenre: 'Supernatural',
    mdTag: 'eabc5b4c-6aff-42f3-b657-3e90cbd00b75',
    keywords: ['supernatural', 'soprannaturale', 'sovrannaturale', 'demoni', 'demons', 'vampiri']
  },
  sliceoflife: {
    awId: '34',
    auGenre: { id: 50, name: 'Slice of Life' },
    mwSlug: 'slice-of-life',
    mpGenre: 'Slice of Life',
    mdTag: 'e5301a23-ebd9-49dd-a0cb-2add944c7fe9',
    keywords: ['slice of life', 'slice-of-life', 'quotidiano']
  },
  sports: {
    awId: '36',
    auGenre: { id: 27, name: 'Sports' },
    mwSlug: 'sport',
    mpGenre: 'Sports',
    mdTag: '69964a64-2f90-4d33-beeb-f3ed2875eb4c',
    keywords: ['sport', 'sports', 'sportivo', 'calcio', 'basket']
  },
  psychological: {
    awId: '24',
    auGenre: { id: 47, name: 'Psychological' },
    mwSlug: 'psicologico',
    mpGenre: 'Psychological',
    mdTag: '3b60b75c-a2d7-4860-ab56-05f391bb889c',
    keywords: ['psychological', 'psicologico', 'thriller']
  },
  thriller: {
    awId: '39',
    auGenre: { id: 48, name: 'Thriller' },
    mwSlug: 'psicologico',
    mpGenre: 'Thriller',
    mdTag: '07251805-a27e-4d59-b488-f0bfbec15168',
    keywords: ['thriller', 'suspense', 'psicologico']
  },
  ecchi: {
    awId: '8',
    auGenre: { id: 5, name: 'Ecchi' },
    mwSlug: 'ecchi',
    mpGenre: 'Ecchi',
    keywords: ['ecchi', 'harem']
  },
  mecha: {
    awId: '18',
    auGenre: { id: 38, name: 'Mecha' },
    mwSlug: 'mecha',
    mpGenre: 'Mecha',
    mdTag: '50880a9d-5440-4732-9afb-8f457127e836',
    keywords: ['mecha', 'robot']
  },
  martialarts: {
    awId: '3',
    auGenre: { id: 31, name: 'Martial Arts' },
    mwSlug: 'arti-marziali',
    mpGenre: 'Martial Arts',
    mdTag: '799c202e-7daa-44eb-9cf7-8a3c0441531e',
    keywords: ['martial arts', 'arti marziali', 'samurai']
  },
  school: {
    awId: '27',
    auGenre: { id: 33, name: 'School' },
    mwSlug: 'scolastico',
    mpGenre: 'School',
    mdTag: 'caaa44eb-cd40-4177-b930-79d3ef2afe87',
    keywords: ['school', 'scolastico', 'school life']
  },
  historical: {
    awId: '12',
    auGenre: { id: 30, name: 'Historical' },
    mwSlug: 'storico',
    mpGenre: 'Historical',
    mdTag: '33771934-028e-4cb3-8744-691e866a923e',
    keywords: ['historical', 'storico']
  }
};

function normalizeGenre(raw) {
  if (!raw) return 'all';
  const s = String(raw).toLowerCase().trim();
  if (!s || s === 'all' || s.includes('all genres') || s.includes('tutti i generi') || s.includes('tutti')) {
    return 'all';
  }

  if (GENRE_DEFINITIONS[s]) return s;

  if (s.includes('azion') || s.includes('action')) return 'action';
  if (s.includes('avventur') || s.includes('adventur')) return 'adventure';
  if (s.includes('shoun') || s.includes('shon')) return 'shounen';
  if (s.includes('seinen')) return 'seinen';
  if (s.includes('shoujo') || s.includes('shojo')) return 'shoujo';
  if (s.includes('isekai') || s.includes('reincarn')) return 'isekai';
  if (s.includes('fantasy') || s.includes('fantas')) return 'fantasy';
  if (s.includes('commed') || s.includes('comed')) return 'comedy';
  if (s.includes('romant') || s.includes('sentiment')) return 'romance';
  if (s.includes('dramm') || s.includes('drama')) return 'drama';
  if (s.includes('sci-fi') || s.includes('scifi') || s.includes('fantascienza')) return 'scifi';
  if (s.includes('horror')) return 'horror';
  if (s.includes('mister') || s.includes('myster')) return 'mystery';
  if (s.includes('soprannat') || s.includes('sovrannat') || s.includes('supernat')) return 'supernatural';
  if (s.includes('slice')) return 'sliceoflife';
  if (s.includes('sport')) return 'sports';
  if (s.includes('psicolog') || s.includes('psycholog')) return 'psychological';
  if (s.includes('thriller')) return 'thriller';
  if (s.includes('ecchi')) return 'ecchi';
  if (s.includes('mecha')) return 'mecha';
  if (s.includes('marzial') || s.includes('martial')) return 'martialarts';
  if (s.includes('scolast') || s.includes('school')) return 'school';
  if (s.includes('storic') || s.includes('histor')) return 'historical';

  return 'all';
}

function getGenreConfig(raw) {
  const key = normalizeGenre(raw);
  if (key === 'all') return null;
  return { key, ...GENRE_DEFINITIONS[key] };
}

function normalizeAudio(raw) {
  if (!raw) return 'all';
  const s = String(raw).toLowerCase().trim();
  if (!s || s === 'all' || s.includes('all audio') || s.includes('tutti') || (s.includes('sub') && s.includes('dub'))) {
    return 'all';
  }
  if (
    s === 'dub' ||
    s === 'ita' ||
    s.includes('dub') ||
    s.includes('doppiat') ||
    s.includes('doblado') ||
    s.includes('doubl') ||
    s.includes('synchron') ||
    s.includes('solo ita')
  ) {
    return 'dub';
  }
  if (
    s === 'sub' ||
    s === 'subita' ||
    s.includes('sub') ||
    s.includes('sottotitol') ||
    s.includes('sous-titr') ||
    s.includes('untertitel') ||
    s.includes('legendado')
  ) {
    return 'sub';
  }
  return 'all';
}

function matchesGenreText(genresText, rawGenre, titleText = '') {
  const cfg = getGenreConfig(rawGenre);
  if (!cfg) return true;
  const haystack = `${genresText || ''} ${titleText || ''}`.toLowerCase();
  return cfg.keywords.some(kw => haystack.includes(kw.toLowerCase()));
}

function matchesAudioFilter(itemAudio, rawAudio, itemTitle = '', targetLang = null, itemLang = null) {
  const target = normalizeAudio(rawAudio);
  if (targetLang && targetLang !== 'all' && itemLang && itemLang !== 'all') {
    const tl = String(targetLang).toLowerCase().trim();
    const il = String(itemLang).toLowerCase().trim();
    if (tl !== il && !il.startsWith(tl) && !tl.startsWith(il)) {
      return false;
    }
  }
  if (target === 'all') return true;

  const a = String(itemAudio || '').toLowerCase().trim();
  const t = String(itemTitle || '').toLowerCase();

  const isDubTitle =
    t.includes('(ita)') ||
    t.includes('(dub)') ||
    t.includes('dubbed') ||
    t.includes('doppiato') ||
    t.includes('doblado') ||
    t.includes('doublé') ||
    (t.includes('[ita]') && !t.includes('sub')) ||
    (t.includes('[dub]') && !t.includes('sub'));

  if (target === 'dub' || target === 'ita') {
    return a === 'dub' || a === 'ita' || a === 'both' || isDubTitle;
  }
  if (target === 'sub' || target === 'subita') {
    if (isDubTitle && (a === 'ita' || a === 'dub')) return false;
    return a === 'sub' || a === 'subita' || a === 'both' || !a;
  }
  return true;
}

module.exports = {
  GENRE_DEFINITIONS,
  normalizeGenre,
  getGenreConfig,
  normalizeAudio,
  matchesGenreText,
  matchesAudioFilter
};

