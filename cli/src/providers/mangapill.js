const cheerio = require('cheerio');
const BaseProvider = require('./base');
const { fetchHtml } = require('../utils/http');
const { getGenreConfig } = require('../utils/filters');

class MangapillProvider extends BaseProvider {
  constructor() {
    super('Mangapill', 'https://mangapill.com', {
      id: 'mangapill',
      type: 'manga',
      languages: ['en', 'all'],
      isBuiltIn: true
    });
    this.id = 'mangapill';
    this.type = 'manga';
    this.languages = ['en', 'all'];
    this.isBuiltIn = true;
    this.catalogCache = null;
  }

  _parseMangaCards($, results, seenUrls) {
    $('a[href^="/manga/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || !href.startsWith('/manga/')) return;
      const fullUrl = `${this.baseUrl}${href}`;
      if (seenUrls.has(fullUrl)) return;

      let title = $(el).find('.font-black, .font-bold').first().text().trim();
      if (!title) {
        const rawText = $(el).text().trim();
        if (!rawText || rawText.startsWith('#')) return;
        title = rawText.split('\n')[0].trim();
      }
      if (!title || title.startsWith('#')) return;

      const card = $(el).parent();
      const altTitle = $(el).find('.text-xs.text-secondary').first().text().trim() ||
                       card.find('.text-xs.text-secondary').first().text().trim();
      const badgeTexts = card.find('.flex.flex-wrap div')
        .map((__, b) => $(b).text().trim())
        .get()
        .filter(Boolean);
      const genres = badgeTexts.length > 0 ? badgeTexts.join(', ') : altTitle;

      seenUrls.add(fullUrl);
      results.push({
        id: href,
        title,
        altTitle: altTitle || '',
        url: fullUrl,
        genres: genres || '',
        source: 'mangapill',
        sourceName: 'Mangapill',
        language: 'en'
      });
    });
  }

  /**
   * Search manga on Mangapill
   */
  async search(query, lang = null, filters = {}) {
    const cleanLang = lang ? String(lang).toLowerCase().trim() : 'all';
    if (cleanLang && cleanLang !== 'all' && cleanLang !== 'en') {
      return [];
    }
    if (!query || !query.trim()) {
      return this.getCatalog(lang, filters);
    }

    try {
      const genreCfg = getGenreConfig(filters?.genre);
      const genreParam = genreCfg && genreCfg.mpGenre ? `&genre=${encodeURIComponent(genreCfg.mpGenre)}` : '';
      const cleanQuery = encodeURIComponent(query.trim());
      const html = await fetchHtml(`${this.baseUrl}/search?q=${cleanQuery}${genreParam}`);
      const $ = cheerio.load(html);
      const results = [];
      const seenUrls = new Set();

      this._parseMangaCards($, results, seenUrls);

      // Sort non-novel manga before light novels when searching
      results.sort((a, b) => {
        const aNovel = a.title.toLowerCase().includes('novel') ? 1 : 0;
        const bNovel = b.title.toLowerCase().includes('novel') ? 1 : 0;
        return aNovel - bNovel;
      });

      return results;
    } catch (err) {
      return [];
    }
  }

  /**
   * Fetch featured & recent catalog from Mangapill
   */
  async getCatalog(lang = null, filters = {}) {
    const cleanLang = lang ? String(lang).toLowerCase().trim() : 'all';
    if (cleanLang && cleanLang !== 'all' && cleanLang !== 'en') {
      return [];
    }

    const genreCfg = getGenreConfig(filters?.genre);
    if (!genreCfg && this.catalogCache && this.catalogCache.length > 0) {
      return this.catalogCache;
    }

    const results = [];
    const seenUrls = new Set();

    try {
      if (genreCfg && genreCfg.mpGenre) {
        const html = await fetchHtml(`${this.baseUrl}/search?q=&genre=${encodeURIComponent(genreCfg.mpGenre)}`).catch(() => '');
        if (html) {
          this._parseMangaCards(cheerio.load(html), results, seenUrls);
        }
        return results;
      }

      const [homeHtml, newHtml] = await Promise.all([
        fetchHtml(`${this.baseUrl}/`).catch(() => ''),
        fetchHtml(`${this.baseUrl}/mangas/new`).catch(() => '')
      ]);

      if (homeHtml) {
        this._parseMangaCards(cheerio.load(homeHtml), results, seenUrls);
      }
      if (newHtml) {
        this._parseMangaCards(cheerio.load(newHtml), results, seenUrls);
      }

      if (results.length > 0) {
        this.catalogCache = results;
      }
      return results;
    } catch (err) {
      return results;
    }
  }

  /**
   * Get all chapters for a manga
   */
  async getChapters(mangaUrl, lang = null) {
    try {
      const html = await fetchHtml(mangaUrl);
      const $ = cheerio.load(html);
      const chapters = [];

      $('a[href*="/chapters/"]').each((_, el) => {
        const href = $(el).attr('href');
        const title = $(el).text().trim();

        if (href) {
          const numMatch = title.match(/(?:chapter|ch\.?)\s*(\d+(?:\.\d+)?)/i) || title.match(/(\d+(?:\.\d+)?)/);
          const chapNum = numMatch ? numMatch[1] : undefined;
          chapters.push({
            id: chapNum || href.split('/chapters/')[1],
            number: chapNum,
            title: `[EN] ${title}`,
            url: href.startsWith('http') ? href : `${this.baseUrl}${href}`
          });
        }
      });

      // Invert order so Chapter 1 comes first
      return chapters.reverse();
    } catch (err) {
      return [];
    }
  }

  /**
   * Get all page image URLs for a chapter
   */
  async getChapterPages(chapterUrl) {
    const html = await fetchHtml(chapterUrl);
    const $ = cheerio.load(html);
    const pages = [];

    $('img.js-page').each((_, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src');
      if (src) {
        pages.push(src);
      }
    });

    const title = $('title').text().replace(/ - Mangapill$/, '').trim();

    return {
      title,
      chapterUrl,
      pages
    };
  }
}

module.exports = MangapillProvider;
