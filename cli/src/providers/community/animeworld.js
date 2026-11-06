const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { getGenreConfig, normalizeAudio, matchesAudioFilter } = require('../../utils/filters');

/**
 * Anime Provider for AnimeWorld (animeworld.ac)
 * High quality Italian anime streaming (SUB ITA & ITA) with direct MP4 extraction
 */
function createAnimeWorldProvider({ BaseAnimeProvider, cheerio, fetchHtml, getCurlBinary, DOH_RESOLVER, DEFAULT_USER_AGENT }) {
  const curlBin = typeof getCurlBinary === 'function' ? getCurlBinary() : 'curl';
  const dohUrl = DOH_RESOLVER || 'https://1.1.1.1/dns-query';
  const userAgent = DEFAULT_USER_AGENT || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  return class AnimeWorldProvider extends BaseAnimeProvider {
    constructor() {
      super('AnimeWorld', 'https://www.animeworld.ac', {
        id: 'animeworld',
        languages: ['it'],
        isBuiltIn: true
      });
      this.id = 'animeworld';
      this.type = 'anime';
      this.languages = ['it'];
      this.isBuiltIn = true;
      this.cookieFile = path.join(os.tmpdir(), 'manga-cli-animeworld-cookie.txt');
      this.catalogCache = null;
    }

    _parseItemsFromHtml(html, results, seenUrls) {
      const $ = this.cheerio.load(html);
      $('.film-list .item').each((_, el) => {
        const a = $(el).find('a.name').first();
        const href = a.attr('href');
        const title = a.text().trim();

        if (href && title) {
          const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
          if (seenUrls.has(fullUrl)) return;
          seenUrls.add(fullUrl);

          const isIta = title.toLowerCase().includes('(ita)') || $(el).find('.status .dub').length > 0;
          results.push({
            id: href,
            title,
            url: fullUrl,
            audio: isIta ? 'ita' : 'subita',
            language: 'it',
            source: 'animeworld',
            sourceName: 'AnimeWorld'
          });
        }
      });
    }

    /**
     * 1. Cerca anime nel catalogo AnimeWorld
     * @param {string} query Titolo dell'anime
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
        const genreParam = genreCfg && genreCfg.awId ? `&genre=${genreCfg.awId}` : '';
        const dubParam = (audioKey === 'dub' || audioKey === 'ita') ? '&dub=1' : ((audioKey === 'sub' || audioKey === 'subita') ? '&dub=0' : '');

        // Strip trailing audio badges like [SUB ITA] or [ITA] if present, but preserve (ITA)
        const cleaned = query.replace(/\s*\[[^\]]*\]\s*/g, ' ').trim();
        const cleanQuery = encodeURIComponent(cleaned);
        const searchUrl = `${this.baseUrl}/filter?keyword=${cleanQuery}${genreParam}${dubParam}`;
        const html = await this.fetchHtml(searchUrl);
        const results = [];
        const seenUrls = new Set();
        this._parseItemsFromHtml(html, results, seenUrls);

        // If query had (ITA) or punctuation and returned 0, try base title
        if (results.length === 0 && cleaned.includes('(')) {
          const baseQuery = cleaned.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
          if (baseQuery.length >= 2) {
            const fallbackHtml = await this.fetchHtml(`${this.baseUrl}/filter?keyword=${encodeURIComponent(baseQuery)}${genreParam}${dubParam}`);
            this._parseItemsFromHtml(fallbackHtml, results, seenUrls);
          }
        }

        return results.filter(item => matchesAudioFilter(item.audio, audioKey, item.title, cleanLang, item.language));
      } catch (err) {
        return [];
      }
    }

    /**
     * Recupera il catalogo AnimeWorld (Più popolari + Ultime uscite)
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
          const genreParam = genreCfg && genreCfg.awId ? `&genre=${genreCfg.awId}` : '';
          const dubParam = (audioKey === 'dub' || audioKey === 'ita') ? '&dub=1' : ((audioKey === 'sub' || audioKey === 'subita') ? '&dub=0' : '');
          const [popFilterHtml, latestFilterHtml] = await Promise.all([
            this.fetchHtml(`${this.baseUrl}/filter?sort=6${genreParam}${dubParam}`).catch(() => ''),
            this.fetchHtml(`${this.baseUrl}/filter?sort=0${genreParam}${dubParam}`).catch(() => '')
          ]);

          if (popFilterHtml) this._parseItemsFromHtml(popFilterHtml, results, seenUrls);
          if (latestFilterHtml) this._parseItemsFromHtml(latestFilterHtml, results, seenUrls);
          return results.filter(item => matchesAudioFilter(item.audio, audioKey, item.title, cleanLang, item.language));
        }

        const [popularHtml, homeHtml] = await Promise.all([
          this.fetchHtml(`${this.baseUrl}/filter?sort=6`).catch(() => ''),
          this.fetchHtml(`${this.baseUrl}/`).catch(() => '')
        ]);

        if (popularHtml) {
          this._parseItemsFromHtml(popularHtml, results, seenUrls);
        }
        if (homeHtml) {
          this._parseItemsFromHtml(homeHtml, results, seenUrls);
        }

        if (results.length === 0) {
          const azHtml = await this.fetchHtml(`${this.baseUrl}/az-list`).catch(() => '');
          if (azHtml) {
            this._parseItemsFromHtml(azHtml, results, seenUrls);
          }
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
     * 2. Estrae tutti gli episodi della serie
     * @param {string} animeUrl
     */
    async getEpisodes(animeUrl) {
      try {
        const html = await this.fetchHtml(animeUrl);
        const $ = this.cheerio.load(html);
        const episodes = [];
        const seenNums = new Set();

        const activeServer = $('.server.active').first();
        const container = activeServer.length > 0 ? activeServer : ($('.server').first().length > 0 ? $('.server').first() : $.root());

        container.find('.episode a').each((_, el) => {
          const href = $(el).attr('href');
          const epNum = String($(el).attr('data-episode-num') || $(el).attr('data-num') || $(el).text().trim()).trim();
          const dataId = $(el).attr('data-id');

          if (href && epNum && !seenNums.has(epNum)) {
            seenNums.add(epNum);
            episodes.push({
              id: epNum,
              title: `Episodio ${epNum}`,
              url: href.startsWith('http') ? href : `${this.baseUrl}${href}`,
              dataId
            });
          }
        });

        return episodes;
      } catch (err) {
        return [];
      }
    }

    /**
     * 3. Risolve lo stream video MP4 diretto dell'episodio
     * @param {string} episodeUrl
     * @param {'subita'|'ita'|string} preferredAudio
     */
    async getEpisodeStream(episodeUrl, preferredAudio = 'subita') {
      return new Promise((resolve) => {
        execFile(curlBin, [
          '-s', '-g', '-L',
          '--doh-url', dohUrl,
          '-c', this.cookieFile,
          '-b', this.cookieFile,
          '-A', userAgent,
          episodeUrl
        ], { maxBuffer: 15 * 1024 * 1024 }, (err, html) => {
          if (err || !html) {
            return resolve({ streamUrl: null, availableAudios: ['subita'] });
          }

          const csrfMatch = html.match(/content="([^"]+)"[^>]+name="csrf-token"/i) || 
                            html.match(/name="csrf-token"[^>]+content="([^"]+)"/i);
          const csrf = csrfMatch ? csrfMatch[1] : '';

          const idMatch = html.match(/data-id="([a-zA-Z0-9_-]+)"[^>]+class="[^"]*player-box/i) || 
                          html.match(/class="[^"]*player-box[^"]*"[^>]+data-id="([a-zA-Z0-9_-]+)"/i) ||
                          html.match(/data-episode-id="([a-zA-Z0-9_-]+)"/i);
          const dataId = idMatch ? idMatch[1] : episodeUrl.split('/').pop().split(/[?#]/)[0];

          const fallbackFromHtml = () => {
            const mp4Match = html.match(/href="(https?:\/\/[^"]+\.mp4[^"]*)"/i) ||
                             html.match(/src="(https?:\/\/[^"]+\.mp4[^"]*)"/i);
            return mp4Match ? mp4Match[1] : null;
          };

          if (!dataId) {
            return resolve({ streamUrl: fallbackFromHtml(), availableAudios: ['subita'] });
          }

          execFile(curlBin, [
            '-s', '-g', '-L',
            '--doh-url', dohUrl,
            '-b', this.cookieFile,
            '-A', userAgent,
            '-H', `csrf-token: ${csrf}`,
            '-H', 'x-requested-with: XMLHttpRequest',
            '-H', `referer: ${episodeUrl}`,
            `${this.baseUrl}/api/episode/info?id=${dataId}`
          ], (err2, jsonText) => {
            if (err2 || !jsonText) {
              return resolve({ streamUrl: fallbackFromHtml(), availableAudios: ['subita'] });
            }

            try {
              const data = JSON.parse(jsonText);
              const streamUrl = data.grabber || data.target || fallbackFromHtml();
              resolve({
                streamUrl,
                availableAudios: ['subita']
              });
            } catch {
              resolve({ streamUrl: fallbackFromHtml(), availableAudios: ['subita'] });
            }
          });
        });
      });
    }
  };
}

module.exports = createAnimeWorldProvider;
