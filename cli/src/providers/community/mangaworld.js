const { getGenreConfig, matchesGenreText } = require('../../utils/filters');

/**
 * Manga Provider for MangaWorld (mangaworld.ac / mangaworld.mx)
 * Full Italian Manga & Manhwa scan catalog with direct CDN page extraction
 */
function createMangaWorldProvider({ BaseMangaProvider, cheerio, fetchHtml }) {
  return class MangaWorldProvider extends BaseMangaProvider {
    constructor() {
      super('MangaWorld', 'https://www.mangaworld.ac', {
        id: 'mangaworld',
        type: 'manga',
        languages: ['it'],
        isBuiltIn: true
      });
      this.id = 'mangaworld';
      this.type = 'manga';
      this.languages = ['it'];
      this.isBuiltIn = true;
      this.catalogCache = null;
    }

    _parseEntriesFromHtml(html, results, seenUrls) {
      if (!html) return;
      const $ = cheerio.load(html);
      $('.comics-grid .entry').each((_, el) => {
        const a = $(el).find('a.manga-title, .name a, a.thumb').first();
        const titleEl = $(el).find('a.manga-title, .manga-title').first();
        const href = a.attr('href') || titleEl.attr('href');
        const title = (titleEl.text() || a.attr('title') || '').trim();

        if (!href || !title) return;
        const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
        const pathKey = fullUrl.replace(/^https?:\/\/[^/]+/i, '');
        if (seenUrls.has(pathKey)) return;
        seenUrls.add(pathKey);

        const author = $(el).find('.author a, .author').first().text().replace(/^Autore:\s*/i, '').trim();
        const genres = $(el)
          .find('.genres a')
          .map((__, g) => $(g).text().trim())
          .get()
          .filter(Boolean)
          .join(', ');

        results.push({
          id: pathKey,
          title,
          url: fullUrl,
          author: author || '',
          genres: genres || '',
          language: 'it',
          source: 'mangaworld',
          sourceName: 'MangaWorld'
        });
      });
    }

    /**
     * 1. Cerca manga nel catalogo MangaWorld
     * @param {string} query
     * @param {string|null} lang
     * @param {{ genre?: string }} filters
     */
    async search(query, lang = null, filters = {}) {
      const cleanLang = lang ? String(lang).toLowerCase().trim() : 'all';
      if (cleanLang && cleanLang !== 'all' && cleanLang !== 'it') {
        return [];
      }
      if (!query || !query.trim()) {
        return this.getCatalog(lang, filters);
      }

      try {
        const genreCfg = getGenreConfig(filters?.genre);
        const genreParam = genreCfg && genreCfg.mwSlug ? `&genre=${encodeURIComponent(genreCfg.mwSlug)}` : '';
        const searchUrl = `${this.baseUrl}/archive?keyword=${encodeURIComponent(query.trim())}${genreParam}`;
        const html = await fetchHtml(searchUrl);
        const results = [];
        const seenUrls = new Set();
        this._parseEntriesFromHtml(html, results, seenUrls);
        return genreCfg
          ? results.filter(r => matchesGenreText(r.genres, filters.genre, r.title))
          : results;
      } catch {
        return [];
      }
    }

    /**
     * Recupera il catalogo MangaWorld (Più letti + Home)
     * @param {string|null} lang
     * @param {{ genre?: string }} filters
     */
    async getCatalog(lang = null, filters = {}) {
      const cleanLang = lang ? String(lang).toLowerCase().trim() : 'all';
      if (cleanLang && cleanLang !== 'all' && cleanLang !== 'it') {
        return [];
      }

      const genreCfg = getGenreConfig(filters?.genre);
      if (!genreCfg && this.catalogCache && this.catalogCache.length > 0) {
        return this.catalogCache;
      }

      const results = [];
      const seenUrls = new Set();

      try {
        if (genreCfg && genreCfg.mwSlug) {
          const slug = encodeURIComponent(genreCfg.mwSlug);
          const [p1Html, p2Html] = await Promise.all([
            fetchHtml(`${this.baseUrl}/archive?sort=most_read&genre=${slug}`).catch(() => ''),
            fetchHtml(`${this.baseUrl}/archive?sort=newest&genre=${slug}`).catch(() => '')
          ]);
          if (p1Html) this._parseEntriesFromHtml(p1Html, results, seenUrls);
          if (p2Html) this._parseEntriesFromHtml(p2Html, results, seenUrls);
          return results;
        }

        const [popularHtml, homeHtml] = await Promise.all([
          fetchHtml(`${this.baseUrl}/archive?sort=most_read`).catch(() => ''),
          fetchHtml(`${this.baseUrl}/`).catch(() => '')
        ]);

        if (popularHtml) this._parseEntriesFromHtml(popularHtml, results, seenUrls);
        if (homeHtml) this._parseEntriesFromHtml(homeHtml, results, seenUrls);

        if (results.length > 0) {
          this.catalogCache = results;
        }
        return results;
      } catch {
        return results;
      }
    }

    /**
     * 2. Estrae tutti i capitoli del manga (dal capitolo 1 all'ultimo)
     * @param {string} mangaUrl
     * @param {string|null} lang
     */
    async getChapters(mangaUrl, lang = null) {
      try {
        const html = await fetchHtml(mangaUrl);
        const $ = cheerio.load(html);
        const chapters = [];
        const seenUrls = new Set();

        $('.chapters-wrapper .chapter a.chap').each((_, el) => {
          const href = $(el).attr('href');
          if (!href) return;
          const cleanHref = href.split('?')[0];
          if (seenUrls.has(cleanHref)) return;
          seenUrls.add(cleanHref);

          const spanText = $(el).find('span').first().text().trim();
          const rawTitle = spanText || $(el).attr('title') || $(el).text().trim();
          const numMatch =
            rawTitle.match(/(?:capitolo|cap\.?|chapter|ch\.?)\s*0*(\d+(?:\.\d+)?)/i) ||
            rawTitle.match(/0*(\d+(?:\.\d+)?)/);
          const chapNum = numMatch ? numMatch[1] : undefined;

          chapters.push({
            id: chapNum || cleanHref.split('/').pop(),
            number: chapNum,
            title: `[IT] ${spanText || (chapNum ? `Chapter ${chapNum}` : rawTitle)}`,
            url: cleanHref.startsWith('http') ? cleanHref : `${this.baseUrl}${cleanHref}`
          });
        });

        const isBerserk = mangaUrl.toLowerCase().includes('berserk');
        const hasSpecialPrologue = isBerserk || chapters.some(c => c.id && (c.id.startsWith('000-') || c.id.startsWith('0.') || c.id.startsWith('00.')));
        const resList = chapters.reverse();
        if (hasSpecialPrologue) {
          resList.forEach((c, idx) => {
            c.number = String(idx + 1);
          });
        }
        return resList;
      } catch {
        return [];
      }
    }

    /**
     * 3. Estrae tutti gli URL delle pagine di un capitolo
     * @param {string} chapterUrl
     */
    async getChapterPages(chapterUrl) {
      try {
        const baseChapUrl = chapterUrl.split('?')[0].replace(/\/+$/, '');
        const listUrl = /\/read\/[^/]+\/\d+$/i.test(baseChapUrl)
          ? `${baseChapUrl}?style=list`
          : `${baseChapUrl}/1?style=list`;

        const html = await fetchHtml(listUrl, this.baseUrl);
        const $ = cheerio.load(html);
        const pages = [];
        const seen = new Set();

        $('#page img').each((_, el) => {
          const src = $(el).attr('src') || $(el).attr('data-src');
          if (src && !seen.has(src)) {
            seen.add(src);
            pages.push(src);
          }
        });

        if (pages.length === 0) {
          const regexMatches = html.match(/https?:\/\/cdn\.mangaworld\.[a-z]+\/chapters\/[^\s"'<>]+/gi) || [];
          for (const imgUrl of regexMatches) {
            if (!seen.has(imgUrl)) {
              seen.add(imgUrl);
              pages.push(imgUrl);
            }
          }
        }

        const title = $('title').text().replace(/\s*-\s*MangaWorld.*$/i, '').trim();
        return {
          title,
          chapterUrl: baseChapUrl,
          pages
        };
      } catch {
        return { title: '', chapterUrl, pages: [] };
      }
    }
  };
}

module.exports = createMangaWorldProvider;
