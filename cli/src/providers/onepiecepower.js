const cheerio = require('cheerio');
const BaseProvider = require('./base');
const { fetchHtml, checkUrlExists } = require('../utils/http');
const { getGenreConfig, matchesGenreText } = require('../utils/filters');

const POPULAR_MANGA_KEYWORDS = [
  'one piece', 'berserk', 'jujutsu kaisen', 'chainsaw man', 'solo leveling',
  'demon slayer', 'kimetsu no yaiba', 'naruto', 'bleach', 'dragon ball',
  'attack on titan', 'shingeki no kyojin', 'my hero academia', 'boku no hero',
  'hunter x hunter', 'death note', 'tokyo ghoul', 'black clover', 'dandadan',
  'blue lock', 'vinland saga', 'monster', 'fullmetal alchemist', 'spy x family',
  'one punch man', 'one-punch man', 'sakamoto days', 'kingdom', 'gachiakuta',
  'kagurabachi', 'fairy tail', 'fire force', 'dr. stone', 'frieren',
  'vagabond', 'claymore', '20th century boys', 'gantz', 'slam dunk',
  'haikyuu', 'tokyo revengers', 'boruto', 'kaiju', 'undead unluck',
  'mashle', 'jigokuraku', 'oshi no ko', 'baki', 'jojo', 'soul eater',
  'hellsing', 'akira', 'dorohedoro', 'cyberpunk', 'evangelion', 'mob psycho',
  'overlord', 'goblin slayer', 'record of ragnarok', 'shuumatsu no valkyrie',
  'blue exorcist', 'ao no exorcist', 'noragami', 'assassination classroom',
  'seven deadly sins', 'nanatsu no taizai', 'promised neverland', 'dr stone'
];

class OnePiecePowerProvider extends BaseProvider {
  constructor() {
    super('One Piece Power', 'https://onepiecepower.com', {
      id: 'onepiecepower',
      type: 'manga',
      languages: ['it', 'en'],
      isBuiltIn: true
    });
    this.id = 'onepiecepower';
    this.type = 'manga';
    this.languages = ['it', 'en'];
    this.isBuiltIn = true;
    this.mangaListCache = null;
  }

  /**
   * Fetches the entire manga archive from /manga8/lista-manga3 (or lista-manga2)
   */
  async getAllManga() {
    if (this.mangaListCache) {
      return this.mangaListCache;
    }

    let html;
    try {
      html = await fetchHtml(`${this.baseUrl}/manga8/lista-manga3`);
    } catch {
      html = await fetchHtml(`${this.baseUrl}/manga8/lista-manga2`);
    }
    const $ = cheerio.load(html);
    const mangaList = [];

    // One Piece ITA
    mangaList.push({
      id: 'onepiece-it',
      title: 'One Piece',
      url: `${this.baseUrl}/manga8/onepiece/volumi/lista-capitoli`,
      author: 'Eiichiro Oda',
      genres: 'Avventura, Shounen, Azione',
      altTitle: 'One Piece',
      source: 'onepiecepower',
      sourceName: 'One Piece Power',
      language: 'it'
    });

    // One Piece ENG
    mangaList.push({
      id: 'onepiece-en',
      title: 'One Piece (English Edition)',
      url: `${this.baseUrl}/manga8/one-piece-eng/chapter-list`,
      author: 'Eiichiro Oda',
      genres: 'Adventure, Shounen, Action',
      altTitle: 'One Piece ENG',
      source: 'onepiecepower',
      sourceName: 'One Piece Power',
      language: 'en'
    });

    const seenUrls = new Set(mangaList.map(m => m.url));

    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('lista-capitoli')) {
        let title = $(el).text().trim();
        const alt = $(el).attr('data-alternative-title') || '';
        const author = $(el).attr('data-author') || '';
        const genres = $(el).attr('data-genres') || '';

        if (!title) return;

        let fullUrl = href;
        if (!fullUrl.startsWith('http')) {
          fullUrl = fullUrl.startsWith('/') 
            ? `${this.baseUrl}${fullUrl}`
            : `${this.baseUrl}/manga8/${fullUrl}`;
        }

        if (seenUrls.has(fullUrl)) return;
        seenUrls.add(fullUrl);

        mangaList.push({
          id: fullUrl,
          title,
          url: fullUrl,
          author,
          genres,
          altTitle: alt,
          source: 'onepiecepower',
          sourceName: 'One Piece Power',
          language: 'it'
        });
      }
    });

    this.mangaListCache = mangaList;
    return mangaList;
  }

  /**
   * Returns top/popular catalog for browsing
   */
  async getCatalog(lang = null, filters = {}) {
    const all = await this.getAllManga();
    const genreCfg = getGenreConfig(filters?.genre);
    const filtered = all.filter(m => {
      if (lang && lang !== 'all' && m.language !== lang) return false;
      if (genreCfg && !matchesGenreText(m.genres, filters.genre, m.title)) return false;
      return true;
    });

    const popular = [];
    const rest = [];

    for (const item of filtered) {
      const t = item.title.toLowerCase();
      const alt = (item.altTitle || '').toLowerCase();
      const isPop = POPULAR_MANGA_KEYWORDS.some(k => t === k || t.startsWith(k + ' ') || t.includes(k) || alt.includes(k));
      if (isPop) {
        popular.push(item);
      } else {
        rest.push(item);
      }
    }

    // Sort popular by keyword order
    popular.sort((a, b) => {
      const ta = a.title.toLowerCase();
      const tb = b.title.toLowerCase();
      const ia = POPULAR_MANGA_KEYWORDS.findIndex(k => ta === k || ta.includes(k));
      const ib = POPULAR_MANGA_KEYWORDS.findIndex(k => tb === k || tb.includes(k));
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    return [...popular, ...rest].slice(0, 100);
  }

  /**
   * Search manga by keyword and optional language filter (searches full 2700+ archive)
   */
  async search(query, lang = null, filters = {}) {
    if (!query || !query.trim()) {
      return this.getCatalog(lang, filters);
    }
    const catalog = await this.getAllManga();
    const genreCfg = getGenreConfig(filters?.genre);
    const cleanQuery = query.toLowerCase().trim();
    const cleanNorm = cleanQuery.replace(/[^a-z0-9]/g, '');

    return catalog.filter(m => {
      if (lang && lang !== 'all' && m.language !== lang) return false;
      if (genreCfg && !matchesGenreText(m.genres, filters.genre, m.title)) return false;
      const titleLower = m.title.toLowerCase();
      const matchTitle = titleLower.includes(cleanQuery) || 
                         (cleanNorm.length >= 3 && titleLower.replace(/[^a-z0-9]/g, '').includes(cleanNorm));
      const matchAlt = m.altTitle && (m.altTitle.toLowerCase().includes(cleanQuery) || 
                                     (cleanNorm.length >= 3 && m.altTitle.toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanNorm)));
      const matchAuthor = m.author && m.author.toLowerCase().includes(cleanQuery);
      return matchTitle || matchAlt || matchAuthor;
    });
  }

  /**
   * Pick a random manga from catalog
   */
  async getRandomManga(lang = null) {
    const catalog = await this.getAllManga();
    const filtered = lang && lang !== 'all' ? catalog.filter(m => m.language === lang) : catalog;
    if (filtered.length === 0) return null;
    const idx = Math.floor(Math.random() * filtered.length);
    return filtered[idx];
  }

  /**
   * Get all chapters from a manga's chapter list page
   */
  async getChapters(mangaUrl) {
    const html = await fetchHtml(mangaUrl);
    const $ = cheerio.load(html);
    const chapters = [];

    $('a[href*="reader/"]').each((_, el) => {
      let href = $(el).attr('href');
      const title = $(el).text().replace(/\s+/g, ' ').trim();
      
      let fullUrl = href;
      if (!fullUrl.startsWith('http')) {
        if (fullUrl.startsWith('/')) {
          fullUrl = `${this.baseUrl}${fullUrl}`;
        } else {
          const cleanMangaUrl = mangaUrl.replace(/\/(lista-capitoli|chapter-list).*$/, '');
          fullUrl = `${cleanMangaUrl}/${href.replace(/^\.\//, '')}`;
        }
      }

      const match = href.match(/reader\/([^/?#]+)/);
      const capId = match ? match[1] : '';

      if (capId && !chapters.some(c => c.url === fullUrl)) {
        chapters.push({
          id: capId,
          number: capId.replace(/^0+/, '') || '0',
          title: title || `Chapter ${capId}`,
          url: fullUrl
        });
      }
    });

    const isBerserk = mangaUrl.toLowerCase().includes('berserk');
    const hasSpecialPrologue = isBerserk || chapters.some(c => c.id && c.id.startsWith('000-'));
    if (hasSpecialPrologue) {
      chapters.forEach((c, idx) => {
        c.number = String(idx + 1);
      });
    }

    return chapters;
  }

  /**
   * Extract or generate page image URLs for a specific chapter
   */
  async getChapterPages(chapterUrl) {
    const html = await fetchHtml(chapterUrl);
    const $ = cheerio.load(html);

    let scriptContent = '';
    $('script').each((_, el) => {
      const text = $(el).html() || '';
      if (text.includes('getPageLink')) {
        scriptContent = text;
      }
    });

    let cleanUrl = chapterUrl.split('?')[0];
    const baseUrl = cleanUrl.split('reader/')[0];
    const rawCap = cleanUrl.split('reader/')[1].split('/')[0].split('.php')[0];

    const opVolMatch = scriptContent.match(/const\s+vol\s*=\s*["']([^"']+)["']/);
    const stdVolMatch = scriptContent.match(/const\s+volText\s*=\s*["']([^"']+)["']/);

    let workingGenerator = null;

    if (opVolMatch) {
      let rawVol = opVolMatch[1];
      if (!rawVol.endsWith('/')) rawVol += '/';

      let capWithSlash = rawCap.endsWith('/') ? rawCap : rawCap + '/';
      let capNum = capWithSlash.includes('-') 
        ? capWithSlash.replace(/^0/, '') 
        : (parseInt(capWithSlash, 10) < 10 ? capWithSlash.padStart(3, '0') : capWithSlash);

      workingGenerator = (pageNum) => {
        let p = pageNum < 10 ? '0' + pageNum : '' + pageNum;
        return `${baseUrl}volume${rawVol}${capNum}${p}.jpg`;
      };
    } else if (stdVolMatch) {
      const vol = stdVolMatch[1];
      let formattedCap = rawCap.includes('-') 
        ? rawCap.replace(/^0/, '') 
        : (parseFloat(rawCap) < 100 ? (rawCap.startsWith('0') ? rawCap.substring(1) : rawCap) : rawCap);

      workingGenerator = (pageNum) => {
        let formattedPage = pageNum < 10 ? '0' + pageNum : '' + pageNum;
        return `${baseUrl}volume${vol}/capitolo${formattedCap}/${formattedPage}.jpg`;
      };
    } else {
      const fallbacks = [
        (p) => `${baseUrl}volume${rawCap}/capitolo${rawCap}/${p < 10 ? '0' + p : p}.jpg`,
        (p) => `${baseUrl}capitolo${rawCap}/${p < 10 ? '0' + p : p}.jpg`
      ];
      for (const gen of fallbacks) {
        if (await checkUrlExists(gen(1), chapterUrl)) {
          workingGenerator = gen;
          break;
        }
      }
      if (!workingGenerator) workingGenerator = fallbacks[0];
    }

    const title = $('title').text().replace(/\|.*$/, '').trim();

    return {
      title: title || `Chapter ${rawCap}`,
      chapterUrl,
      page1: workingGenerator(1),
      getPageLinkFn: workingGenerator,
      discoverRemainingPages: async () => {
        const pages = [workingGenerator(1)];
        let current = 2;
        let keepChecking = true;
        const batchSize = 15;

        while (keepChecking && current <= 100) {
          const batchNumbers = Array.from({ length: batchSize }, (_, i) => current + i);
          const batchUrls = batchNumbers.map(n => workingGenerator(n));

          const batchResults = await Promise.all(
            batchUrls.map(url => checkUrlExists(url, chapterUrl))
          );

          for (let i = 0; i < batchResults.length; i++) {
            if (batchResults[i]) {
              pages.push(batchUrls[i]);
            } else {
              keepChecking = false;
              break;
            }
          }

          current += batchSize;
        }

        return pages;
      }
    };
  }
}

module.exports = OnePiecePowerProvider;
