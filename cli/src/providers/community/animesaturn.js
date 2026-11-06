const { getGenreConfig, normalizeAudio, matchesAudioFilter } = require('../../utils/filters');

/**
 * Anime Provider for AnimeSaturn (animesaturn.net)
 * High quality Italian anime streaming (SUB ITA & ITA) with direct MP4/HLS extraction
 */
function createAnimeSaturnProvider({ BaseAnimeProvider, cheerio, fetchHtml }) {
  function decodeSaturnStream(b64, key) {
    if (!b64) return '';
    try {
      const s = Buffer.from(b64, 'base64').toString('binary');
      const k = key || 'as';
      let out = '';
      for (let i = 0; i < s.length; i++) {
        out += String.fromCharCode(s.charCodeAt(i) ^ k.charCodeAt(i % k.length));
      }
      return out;
    } catch {
      return '';
    }
  }

  return class AnimeSaturnProvider extends BaseAnimeProvider {
    constructor() {
      super('AnimeSaturn', 'https://www.animesaturn.net', {
        id: 'animesaturn',
        languages: ['it'],
        isBuiltIn: true
      });
      this.id = 'animesaturn';
      this.type = 'anime';
      this.languages = ['it'];
      this.isBuiltIn = true;
      this.catalogCache = null;
    }

    _parseItemsFromHtml(html, results, seenUrls) {
      if (!html) return;
      const $ = cheerio.load(html);
      $('a[href^="/anime/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (!href || href.includes('/ep-')) return;

        const img = $(el).find('img').first();
        if (img.length === 0) return;

        const title = (
          img.attr('alt') ||
          $(el).attr('title') ||
          $(el).find('h3, h4, .title').first().text() ||
          ''
        ).trim();

        if (!title || title.toLowerCase() === 'dettagli') return;

        const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
        if (seenUrls.has(fullUrl)) return;
        seenUrls.add(fullUrl);

        const cardText = $(el).text().toUpperCase();
        const isIta =
          title.toLowerCase().includes('(ita)') ||
          href.toLowerCase().includes('-ita-') ||
          cardText.includes('DUB');

        results.push({
          id: href,
          title,
          url: fullUrl,
          audio: isIta ? 'ita' : 'subita',
          language: 'it',
          source: 'animesaturn',
          sourceName: 'AnimeSaturn'
        });
      });
    }

    /**
     * 1. Cerca anime nel catalogo AnimeSaturn
     * @param {string} query
     * @param {string|null} lang
     * @param {{ genre?: string, audio?: string }} filters
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
        const audioKey = normalizeAudio(filters?.audio);
        const catParam = genreCfg && genreCfg.awId ? `&categories%5B%5D=${genreCfg.awId}` : '';
        const dubParam = (audioKey === 'dub' || audioKey === 'ita') ? '&dub=1' : ((audioKey === 'sub' || audioKey === 'subita') ? '&dub=0' : '');

        const cleaned = query.replace(/\s*\[[^\]]*\]\s*/g, ' ').trim();
        const searchUrl = `${this.baseUrl}/filter?key=${encodeURIComponent(cleaned)}${catParam}${dubParam}`;
        const html = await fetchHtml(searchUrl);
        const results = [];
        const seenUrls = new Set();
        this._parseItemsFromHtml(html, results, seenUrls);

        if (results.length === 0 && cleaned.includes('(')) {
          const baseQuery = cleaned.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
          if (baseQuery.length >= 2) {
            const fallbackHtml = await fetchHtml(
              `${this.baseUrl}/filter?key=${encodeURIComponent(baseQuery)}${catParam}${dubParam}`
            );
            this._parseItemsFromHtml(fallbackHtml, results, seenUrls);
          }
        }

        return results.filter(item => matchesAudioFilter(item.audio, audioKey, item.title, cleanLang, item.language));
      } catch {
        return [];
      }
    }

    /**
     * Recupera il catalogo AnimeSaturn (Top list + In corso)
     * @param {string|null} lang
     * @param {{ genre?: string, audio?: string }} filters
     */
    async getCatalog(lang = null, filters = {}) {
      const cleanLang = lang ? String(lang).toLowerCase().trim() : 'all';
      if (cleanLang && cleanLang !== 'all' && cleanLang !== 'it') {
        return [];
      }

      const genreCfg = getGenreConfig(filters?.genre);
      const audioKey = normalizeAudio(filters?.audio);
      const hasFilters = Boolean(genreCfg || audioKey !== 'all');

      if (!hasFilters && this.catalogCache && this.catalogCache.length > 0) {
        return this.catalogCache;
      }

      const results = [];
      const seenUrls = new Set();

      try {
        if (hasFilters) {
          const catParam = genreCfg && genreCfg.awId ? `&categories%5B%5D=${genreCfg.awId}` : '';
          const dubParam = (audioKey === 'dub' || audioKey === 'ita') ? '&dub=1' : ((audioKey === 'sub' || audioKey === 'subita') ? '&dub=0' : '');
          const [mostViewedHtml, recentHtml] = await Promise.all([
            fetchHtml(`${this.baseUrl}/filter?sort=most_viewed${catParam}${dubParam}`).catch(() => ''),
            fetchHtml(`${this.baseUrl}/filter?sort=recent${catParam}${dubParam}`).catch(() => '')
          ]);

          if (mostViewedHtml) this._parseItemsFromHtml(mostViewedHtml, results, seenUrls);
          if (recentHtml) this._parseItemsFromHtml(recentHtml, results, seenUrls);
          return results.filter(item => matchesAudioFilter(item.audio, audioKey, item.title, cleanLang, item.language));
        }

        const [topHtml, ongoingHtml] = await Promise.all([
          fetchHtml(`${this.baseUrl}/toplist`).catch(() => ''),
          fetchHtml(`${this.baseUrl}/ongoing`).catch(() => '')
        ]);

        if (topHtml) this._parseItemsFromHtml(topHtml, results, seenUrls);
        if (ongoingHtml) this._parseItemsFromHtml(ongoingHtml, results, seenUrls);

        if (results.length > 0) {
          this.catalogCache = results;
        }
        return results;
      } catch {
        return results;
      }
    }

    /**
     * 2. Estrae tutti gli episodi della serie
     * @param {string} animeUrl
     */
    async getEpisodes(animeUrl) {
      try {
        const html = await fetchHtml(animeUrl);
        const $ = cheerio.load(html);
        const episodes = [];
        const seenNums = new Set();

        $('a[href*="/ep-"]').each((_, el) => {
          const href = $(el).attr('href');
          if (!href) return;

          const text = $(el).text().replace(/\s+/g, ' ').trim();
          if (text.toLowerCase().startsWith('guarda ')) return;

          const epMatch = href.match(/\/ep-(\d+(?:[.-]\d+)?)/i);
          const epNum = epMatch ? epMatch[1].replace('-', '.') : text;
          if (!epNum || seenNums.has(epNum)) return;

          seenNums.add(epNum);
          const watchPath = href.replace(/^\/episode\//i, '/anime/');
          const fullUrl = watchPath.startsWith('http') ? watchPath : `${this.baseUrl}${watchPath}`;

          episodes.push({
            id: String(epNum),
            title: `Episodio ${epNum}`,
            url: fullUrl
          });
        });

        if (episodes.length === 0) {
          $('a[href*="/ep-"]').each((_, el) => {
            const href = $(el).attr('href');
            if (!href) return;
            const epMatch = href.match(/\/ep-(\d+(?:[.-]\d+)?)/i);
            const epNum = epMatch ? epMatch[1].replace('-', '.') : '1';
            if (seenNums.has(epNum)) return;
            seenNums.add(epNum);
            const watchPath = href.replace(/^\/episode\//i, '/anime/');
            const fullUrl = watchPath.startsWith('http') ? watchPath : `${this.baseUrl}${watchPath}`;
            episodes.push({
              id: String(epNum),
              title: `Episodio ${epNum}`,
              url: fullUrl
            });
          });
        }

        return episodes;
      } catch {
        return [];
      }
    }

    /**
     * 3. Risolve lo stream video MP4 / M3U8 diretto dell'episodio
     * @param {string} episodeUrl
     * @param {'subita'|'ita'|string} preferredAudio
     */
    async getEpisodeStream(episodeUrl, preferredAudio = 'subita') {
      try {
        const watchUrl = episodeUrl.replace(/\/episode\//i, '/anime/');
        const html = await fetchHtml(watchUrl, this.baseUrl);
        const $ = cheerio.load(html);

        const iframeSrc = $('iframe')
          .map((_, el) => $(el).attr('src') || $(el).attr('data-src'))
          .get()
          .find(src => src && src.includes('saturncdn.net'));

        if (iframeSrc) {
          const fullIframeUrl = iframeSrc.startsWith('//') ? `https:${iframeSrc}` : iframeSrc;
          const u = new URL(fullIframeUrl);
          const token = u.searchParams.get('token') || '';
          const playlistUrl = `${u.origin}${u.pathname}/playlist${u.search}`;
          const jsonText = await fetchHtml(playlistUrl, fullIframeUrl);
          const data = JSON.parse(jsonText);
          const streamUrl = decodeSaturnStream(data.d, token);
          if (streamUrl && !streamUrl.startsWith('youtube/')) {
            return {
              streamUrl,
              availableAudios: ['subita']
            };
          }
        }

        const directMatch =
          html.match(/https?:\/\/[^\s"'<>]+(?:\.mp4|\.m3u8)[^\s"'<>]*/i) ||
          [];
        return {
          streamUrl: directMatch[0] || null,
          availableAudios: ['subita']
        };
      } catch {
        return { streamUrl: null, availableAudios: ['subita'] };
      }
    }
  };
}

module.exports = createAnimeSaturnProvider;
