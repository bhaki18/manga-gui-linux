const BaseProvider = require('./base');
const { fetchJson } = require('../utils/http');
const { getGenreConfig } = require('../utils/filters');

class MangaDexProvider extends BaseProvider {
  constructor() {
    super('MangaDex', 'https://api.mangadex.org', {
      id: 'mangadex',
      type: 'manga',
      languages: ['all'],
      isBuiltIn: true
    });
    this.id = 'mangadex';
    this.type = 'manga';
    this.languages = ['all'];
    this.isBuiltIn = true;
    this.catalogCache = new Map();
  }

  _buildLangParam(paramName, lang) {
    const clean = lang ? String(lang).toLowerCase().trim() : 'all';
    if (!clean || clean === 'all') return '';
    if (clean === 'es' || clean === 'es-la') {
      return `&${paramName}[]=es&${paramName}[]=es-la`;
    }
    if (clean === 'pt' || clean === 'pt-br') {
      return `&${paramName}[]=pt-br&${paramName}[]=pt`;
    }
    if (clean === 'zh' || clean === 'zh-hk') {
      return `&${paramName}[]=zh&${paramName}[]=zh-hk`;
    }
    return `&${paramName}[]=${encodeURIComponent(clean)}`;
  }

  _extractMangaItem(item, lang = null) {
    const attrs = item.attributes || {};
    const titleObj = attrs.title || {};
    const altTitles = Array.isArray(attrs.altTitles) ? attrs.altTitles : [];

    const findAlt = (code) => {
      const entry = altTitles.find(a => a && typeof a[code] === 'string' && a[code].trim().length > 0);
      return entry ? entry[code].trim() : null;
    };

    const cleanLang = lang ? String(lang).toLowerCase().trim() : 'all';
    const langTitle = (cleanLang && cleanLang !== 'all') ? (titleObj[cleanLang] || findAlt(cleanLang)) : null;
    const romajiTitle = titleObj['ja-ro'] || titleObj['ko-ro'] || titleObj['zh-ro'] || findAlt('ja-ro') || findAlt('ko-ro') || Object.values(titleObj)[0] || '';
    const enTitle = titleObj.en || findAlt('en');
    const itTitle = titleObj.it || findAlt('it');

    const title = langTitle || enTitle || itTitle || romajiTitle || 'Unknown Title';
    const altTitle = (romajiTitle && romajiTitle !== title) ? romajiTitle : (enTitle && enTitle !== title ? enTitle : '');

    const authorRel = item.relationships ? item.relationships.find(r => r.type === 'author') : null;
    const author = authorRel && authorRel.attributes ? authorRel.attributes.name : '';

    const tagList = (attrs.tags || [])
      .slice(0, 5)
      .map(t => t.attributes && t.attributes.name && t.attributes.name.en)
      .filter(Boolean);
    if (attrs.publicationDemographic && attrs.publicationDemographic !== 'none') {
      const demo = attrs.publicationDemographic.charAt(0).toUpperCase() + attrs.publicationDemographic.slice(1);
      if (!tagList.includes(demo)) tagList.unshift(demo);
    }
    const tags = tagList.join(', ');

    const availLangs = Array.isArray(attrs.availableTranslatedLanguages) ? attrs.availableTranslatedLanguages : [];
    let resolvedLang = 'en';
    if (cleanLang && cleanLang !== 'all') {
      resolvedLang = cleanLang;
    } else if (availLangs.includes('it')) {
      resolvedLang = 'it';
    } else if (availLangs.includes('en')) {
      resolvedLang = 'en';
    } else if (availLangs.length > 0 && availLangs[0]) {
      resolvedLang = availLangs[0];
    }

    return {
      id: item.id,
      title,
      altTitle,
      url: `${this.baseUrl}/manga/${item.id}`,
      author,
      genres: tags,
      source: 'mangadex',
      sourceName: 'MangaDex',
      language: resolvedLang
    };
  }

  _buildGenreParam(filters) {
    const genreCfg = getGenreConfig(filters?.genre);
    if (!genreCfg) return '';
    if (genreCfg.mdDemographic) {
      return `&publicationDemographic[]=${encodeURIComponent(genreCfg.mdDemographic)}`;
    }
    if (genreCfg.mdTag) {
      return `&includedTags[]=${encodeURIComponent(genreCfg.mdTag)}`;
    }
    return '';
  }

  /**
   * Search manga on MangaDex
   */
  async search(query, lang = null, filters = {}) {
    if (!query || !query.trim()) {
      return this.getCatalog(lang, filters);
    }
    try {
      const cleanQuery = encodeURIComponent(query.trim());
      const langParam = this._buildLangParam('availableTranslatedLanguage', lang);
      const genreParam = this._buildGenreParam(filters);
      const url = `${this.baseUrl}/manga?title=${cleanQuery}&limit=25&hasAvailableChapters=true${langParam}${genreParam}&includes[]=author&order[relevance]=desc`;
      const res = await fetchJson(url);

      if (!res || !Array.isArray(res.data)) return [];
      return res.data.map(item => this._extractMangaItem(item, lang));
    } catch (err) {
      return [];
    }
  }

  /**
   * Fetch top catalog from MangaDex
   */
  async getCatalog(lang = null, filters = {}) {
    const langKey = (lang && lang !== 'all') ? String(lang).toLowerCase().trim() : 'all';
    const genreCfg = getGenreConfig(filters?.genre);
    const cacheKey = `${langKey}:${genreCfg ? genreCfg.key : 'all'}`;
    if (this.catalogCache.has(cacheKey)) {
      return this.catalogCache.get(cacheKey);
    }
    try {
      const langParam = langKey !== 'all'
        ? this._buildLangParam('availableTranslatedLanguage', langKey)
        : '&availableTranslatedLanguage[]=it&availableTranslatedLanguage[]=en';
      const genreParam = this._buildGenreParam(filters);
      const url = `${this.baseUrl}/manga?limit=80&order[followedCount]=desc&hasAvailableChapters=true${langParam}${genreParam}&includes[]=author`;
      const res = await fetchJson(url);
      if (!res || !Array.isArray(res.data)) return [];
      const list = res.data.map(item => this._extractMangaItem(item, lang));
      if (list.length > 0) {
        this.catalogCache.set(cacheKey, list);
      }
      return list;
    } catch (err) {
      return [];
    }
  }

  async _fetchChaptersWithLangParam(mangaId, langParam) {
    const rawChapters = [];
    let offset = 0;
    const limit = 100;

    while (offset < 600) {
      const url = `${this.baseUrl}/chapter?manga=${mangaId}${langParam}&includeExternalUrl=0&includeEmptyPages=0&order[chapter]=asc&limit=${limit}&offset=${offset}`;
      const res = await fetchJson(url).catch(() => null);
      if (!res || !Array.isArray(res.data) || res.data.length === 0) break;

      rawChapters.push(...res.data);
      if (res.data.length < limit) break;
      offset += limit;
    }

    return rawChapters;
  }

  /**
   * Get all readable chapters in the specified language (preferring selected language, then IT, then EN)
   */
  async getChapters(mangaUrl, lang = null) {
    const mangaId = (mangaUrl.split('/manga/')[1] || mangaUrl).split(/[/?#]/)[0];
    if (!mangaId) return [];

    let rawData = [];
    const cleanLang = lang ? String(lang).toLowerCase().trim() : 'all';

    if (cleanLang && cleanLang !== 'all') {
      rawData = await this._fetchChaptersWithLangParam(mangaId, this._buildLangParam('translatedLanguage', cleanLang));
    }

    if (rawData.length === 0) {
      rawData = await this._fetchChaptersWithLangParam(mangaId, '&translatedLanguage[]=it&translatedLanguage[]=en');
    }

    if (rawData.length === 0) {
      rawData = await this._fetchChaptersWithLangParam(mangaId, '');
    }

    if (rawData.length === 0) return [];

    // Deduplicate by chapter number (preferring Italian > English > higher page count)
    const chapterMap = new Map();
    rawData.forEach((ch, idx) => {
      const cAttr = ch.attributes || {};
      if (cAttr.externalUrl || (typeof cAttr.pages === 'number' && cAttr.pages <= 0)) {
        return;
      }

      const rawNum = cAttr.chapter !== null && cAttr.chapter !== undefined && String(cAttr.chapter).trim() !== ''
        ? String(cAttr.chapter).trim()
        : String(idx + 1);
      const chapterLang = (cAttr.translatedLanguage || 'en').toLowerCase();
      const chapNumLabel = cAttr.chapter ? `Chapter ${cAttr.chapter}` : `Chapter ${idx + 1}`;
      const chapTitle = cAttr.title ? `: ${cAttr.title}` : '';

      const candidate = {
        id: ch.id,
        title: `[${chapterLang.toUpperCase()}] ${chapNumLabel}${chapTitle}`,
        url: `${this.baseUrl}/chapter/${ch.id}`,
        number: rawNum,
        lang: chapterLang,
        externalUrl: null,
        pagesCount: cAttr.pages || 0
      };

      const existing = chapterMap.get(rawNum);
      if (!existing) {
        chapterMap.set(rawNum, candidate);
      } else {
        const rank = (l) => (l === cleanLang ? 3 : (l === 'it' ? 2 : (l === 'en' ? 1 : 0)));
        if (rank(candidate.lang) > rank(existing.lang) ||
            (rank(candidate.lang) === rank(existing.lang) && candidate.pagesCount > existing.pagesCount)) {
          chapterMap.set(rawNum, candidate);
        }
      }
    });

    const deduped = Array.from(chapterMap.values());
    deduped.sort((a, b) => {
      const na = parseFloat(a.number);
      const nb = parseFloat(b.number);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(a.number).localeCompare(String(b.number));
    });

    return deduped;
  }

  /**
   * Get image pages for a specific chapter
   */
  async getChapterPages(chapterUrl) {
    const chapterId = (chapterUrl.split('/chapter/')[1] || chapterUrl).split(/[/?#]/)[0];

    const chData = await fetchJson(`${this.baseUrl}/chapter/${chapterId}`).catch(() => null);
    if (chData && chData.data && chData.data.attributes && chData.data.attributes.externalUrl) {
      const extUrl = chData.data.attributes.externalUrl;
      return {
        title: `Chapter ${chapterId}`,
        chapterUrl,
        externalUrl: extUrl,
        pages: []
      };
    }

    const serverUrl = `${this.baseUrl}/at-home/server/${chapterId}`;
    const res = await fetchJson(serverUrl);

    if (!res || !res.baseUrl || !res.chapter) {
      throw new Error('Unable to retrieve chapter images from MangaDex');
    }

    const host = res.baseUrl;
    const hash = res.chapter.hash;
    const files = (res.chapter.data && res.chapter.data.length > 0)
      ? res.chapter.data
      : (res.chapter.dataSaver || []);
    const mode = (res.chapter.data && res.chapter.data.length > 0) ? 'data' : 'data-saver';

    const pages = files.map(file => `${host}/${mode}/${hash}/${file}`);

    return {
      title: `Chapter ${chapterId}`,
      chapterUrl,
      pages
    };
  }
}

module.exports = MangaDexProvider;
