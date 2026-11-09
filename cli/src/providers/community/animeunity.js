const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { getGenreConfig, normalizeAudio, matchesGenreText, matchesAudioFilter } = require('../../utils/filters');

/**
 * Anime Provider for AnimeUnity (animeunity.co)
 * Powered by VixCloud (StreamingCommunity CDN) for 1080p MP4 & HLS streaming (SUB ITA & ITA)
 */
function createAnimeUnityProvider({ BaseAnimeProvider, cheerio, fetchHtml, fetchJson, getCurlBinary, DOH_RESOLVER, DEFAULT_USER_AGENT }) {
  const curlBin = typeof getCurlBinary === 'function' ? getCurlBinary() : 'curl';
  const dohUrl = DOH_RESOLVER || 'https://1.1.1.1/dns-query';
  const userAgent = DEFAULT_USER_AGENT || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  return class AnimeUnityProvider extends BaseAnimeProvider {
    constructor() {
      super('AnimeUnity', 'https://www.animeunity.co', {
        id: 'animeunity',
        languages: ['it'],
        isBuiltIn: true
      });
      this.id = 'animeunity';
      this.type = 'anime';
      this.languages = ['it'];
      this.isBuiltIn = true;
      this.cookieFile = path.join(os.tmpdir(), 'manga-cli-animeunity-cookie.txt');
      this.catalogCache = null;
    }

    _pushAnimeRecord(record, results, seenIds) {
      if (!record || !record.id) return;
      const animeId = String(record.id);
      if (seenIds.has(animeId)) return;

      const title = String(record.title_eng || record.title_it || record.title || '').trim();
      if (!title) return;

      seenIds.add(animeId);
      const slug = record.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const fullUrl = `${this.baseUrl}/anime/${record.id}-${slug}`;
      const isIta = record.dub === 1 || record.ita === 1 || title.toLowerCase().includes('(ita)');
      const genres = Array.isArray(record.genres)
        ? record.genres.map(g => g && g.name).filter(Boolean).join(', ')
        : '';
      const image = record.imageurl || '';

      results.push({
        id: `${record.id}-${slug}`,
        title,
        url: fullUrl,
        image,
        audio: isIta ? 'ita' : 'subita',
        genres,
        language: 'it',
        source: 'animeunity',
        sourceName: 'AnimeUnity'
      });
    }

    _parseSearchHtml(html, results, seenIds) {
      if (!html) return;
      const $ = cheerio.load(html);
      const rawRecords = $('archivio').attr('records');
      if (!rawRecords) return;

      try {
        const records = JSON.parse(rawRecords);
        const list = Array.isArray(records) ? records : (records.data || []);
        for (const item of list) {
          this._pushAnimeRecord(item, results, seenIds);
        }
      } catch {
        // Ignore malformed JSON
      }
    }

    async _fetchArchivePost({ title = false, genreCfg = null, audioKey = 'all' } = {}) {
      return new Promise((resolve) => {
        execFile(curlBin, [
          '-s', '-g', '-L',
          '--doh-url', dohUrl,
          '-c', this.cookieFile,
          '-b', this.cookieFile,
          '-A', userAgent,
          `${this.baseUrl}/archivio`
        ], { maxBuffer: 15 * 1024 * 1024 }, (err, html) => {
          if (err || !html) return resolve([]);

          const csrfMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/i) ||
                            html.match(/content="([^"]+)"\s+name="csrf-token"/i);
          const csrf = csrfMatch ? csrfMatch[1] : '';
          if (!csrf) return resolve([]);

          const payload = JSON.stringify({
            title: title || false,
            type: false,
            year: false,
            order: 'Popolarità',
            status: false,
            genres: genreCfg && genreCfg.auGenre ? [genreCfg.auGenre] : false,
            offset: 0,
            dubbed: (audioKey === 'dub' || audioKey === 'ita') ? true : false,
            season: false
          });

          execFile(curlBin, [
            '-s', '-g', '-L',
            '--doh-url', dohUrl,
            '-b', this.cookieFile,
            '-A', userAgent,
            '-H', 'Content-Type: application/json',
            '-H', 'X-Requested-With: XMLHttpRequest',
            '-H', `X-CSRF-TOKEN: ${csrf}`,
            '-H', `Referer: ${this.baseUrl}/archivio`,
            '-d', payload,
            `${this.baseUrl}/archivio/get-animes`
          ], { maxBuffer: 15 * 1024 * 1024 }, (err2, jsonText) => {
            if (err2 || !jsonText) return resolve([]);
            try {
              const data = JSON.parse(jsonText);
              const results = [];
              const seenIds = new Set();
              for (const rec of data.records || []) {
                this._pushAnimeRecord(rec, results, seenIds);
              }
              resolve(results);
            } catch {
              resolve([]);
            }
          });
        });
      });
    }

    /**
     * 1. Cerca anime nel catalogo AnimeUnity
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
        const cleaned = query.replace(/\s*\[[^\]]*\]\s*/g, ' ').trim();

        const searchUrl = `${this.baseUrl}/archivio?title=${encodeURIComponent(cleaned)}`;
        const html = await fetchHtml(searchUrl);
        const results = [];
        const seenIds = new Set();
        this._parseSearchHtml(html, results, seenIds);

        if (results.length === 0 && cleaned.includes('(')) {
          const baseQuery = cleaned.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
          if (baseQuery.length >= 2) {
            const fallbackHtml = await fetchHtml(
              `${this.baseUrl}/archivio?title=${encodeURIComponent(baseQuery)}`
            );
            this._parseSearchHtml(fallbackHtml, results, seenIds);
          }
        }

        return results.filter(item =>
          matchesAudioFilter(item.audio, audioKey, item.title) &&
          (!genreCfg || matchesGenreText(item.genres, filters.genre, item.title))
        );
      } catch {
        return [];
      }
    }

    /**
     * Recupera il catalogo AnimeUnity (Più popolari + Ultime uscite)
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
      const seenIds = new Set();

      try {
        if (hasFilters) {
          const filtered = await this._fetchArchivePost({ title: false, genreCfg, audioKey });
          return filtered.filter(item => matchesAudioFilter(item.audio, audioKey, item.title));
        }

        const [topHtml, homeHtml] = await Promise.all([
          fetchHtml(`${this.baseUrl}/top-anime?popular=true`).catch(() => ''),
          fetchHtml(`${this.baseUrl}/`).catch(() => '')
        ]);

        if (topHtml) {
          const $top = cheerio.load(topHtml);
          const rawTop = $top('top-anime').attr('animes');
          if (rawTop) {
            try {
              const parsed = JSON.parse(rawTop);
              const list = Array.isArray(parsed) ? parsed : (parsed.data || []);
              for (const item of list) {
                this._pushAnimeRecord(item, results, seenIds);
              }
            } catch {}
          }
        }

        if (homeHtml) {
          const $home = cheerio.load(homeHtml);
          const rawHome = $home('layout-items').attr('items-json');
          if (rawHome) {
            try {
              const parsed = JSON.parse(rawHome);
              const list = Array.isArray(parsed) ? parsed : (parsed.data || []);
              for (const epItem of list) {
                if (epItem && epItem.anime) {
                  this._pushAnimeRecord(epItem.anime, results, seenIds);
                }
              }
            } catch {}
          }
        }

        if (results.length > 0) {
          this.catalogCache = results;
        }
        return results;
      } catch {
        return results;
      }
    }

    /**
     * 2. Estrae tutti gli episodi della serie (inclusi anime > 120 episodi tramite info_api)
     * @param {string} animeUrl
     */
    async getEpisodes(animeUrl) {
      try {
        const html = await fetchHtml(animeUrl);
        const $ = cheerio.load(html);
        const vp = $('video-player');
        if (vp.length === 0) return [];

        const rawEpisodes = vp.attr('episodes');
        const totalCount = parseInt(vp.attr('episodes_count') || '0', 10);
        let allEpisodes = [];

        if (rawEpisodes) {
          try {
            const parsed = JSON.parse(rawEpisodes);
            if (Array.isArray(parsed)) {
              allEpisodes = parsed.slice();
            }
          } catch {}
        }

        const idMatch = animeUrl.match(/\/anime\/(\d+)/i);
        const animeId = idMatch ? idMatch[1] : null;

        if (animeId && totalCount > allEpisodes.length) {
          const ranges = [];
          for (let start = allEpisodes.length + 1; start <= totalCount; start += 120) {
            const end = Math.min(start + 119, totalCount);
            ranges.push([start, end]);
          }

          const chunks = await Promise.all(
            ranges.map(([s, e]) =>
              fetchJson(`${this.baseUrl}/info_api/${animeId}/1?start_range=${s}&end_range=${e}`).catch(() => null)
            )
          );

          for (const chunk of chunks) {
            if (chunk && Array.isArray(chunk.episodes)) {
              allEpisodes.push(...chunk.episodes);
            }
          }
        }

        const episodes = [];
        const seenNums = new Set();

        for (const ep of allEpisodes) {
          if (!ep || !ep.id) continue;
          const epNum = String(ep.number || episodes.length + 1).trim();
          if (seenNums.has(epNum)) continue;
          seenNums.add(epNum);

          episodes.push({
            id: epNum,
            title: `Episode ${epNum}`,
            url: `${this.baseUrl}/embed-url/${ep.id}`
          });
        }

        return episodes;
      } catch {
        return [];
      }
    }

    /**
     * 3. Risolve lo stream video MP4 1080p o HLS M3U8 diretto tramite VixCloud
     * @param {string} episodeUrl
     * @param {'subita'|'ita'|string} preferredAudio
     */
    async getEpisodeStream(episodeUrl, preferredAudio = 'subita') {
      try {
        const embedEndpoint = episodeUrl.includes('/embed-url/')
          ? episodeUrl
          : `${this.baseUrl}/embed-url/${episodeUrl.split('/').pop()}`;

        const vixEmbedUrl = (await fetchHtml(embedEndpoint, this.baseUrl)).trim();
        if (!vixEmbedUrl || !vixEmbedUrl.startsWith('http')) {
          return { streamUrl: null, availableAudios: ['subita'] };
        }

        const vixHtml = await fetchHtml(vixEmbedUrl, `${this.baseUrl}/`);

        // 1. Prefer direct 1080p MP4 downloadUrl when provided by VixCloud
        const dlMatch = vixHtml.match(/window\.downloadUrl\s*=\s*['"]([^'"]+)['"]/i);
        if (dlMatch && dlMatch[1]) {
          return {
            streamUrl: dlMatch[1],
            availableAudios: ['subita']
          };
        }

        // 2. Fallback to VixCloud master HLS playlist (.m3u8)
        const urlMatch = vixHtml.match(/url:\s*['"](https?:\/\/[^'"]+\/playlist\/\d+[^'"]*)['"]/i);
        const tokenMatch = vixHtml.match(/['"]token['"]\s*:\s*['"]([^'"]+)['"]/i);
        const expiresMatch = vixHtml.match(/['"]expires['"]\s*:\s*['"]([^'"]+)['"]/i);

        if (urlMatch && tokenMatch && expiresMatch) {
          const basePlaylist = urlMatch[1];
          const sep = basePlaylist.includes('?') ? '&' : '?';
          const streamUrl = `${basePlaylist}${sep}token=${encodeURIComponent(tokenMatch[1])}&expires=${encodeURIComponent(expiresMatch[1])}&h=1`;
          return {
            streamUrl,
            availableAudios: ['subita']
          };
        }

        return { streamUrl: null, availableAudios: ['subita'] };
      } catch {
        return { streamUrl: null, availableAudios: ['subita'] };
      }
    }
  };
}

module.exports = createAnimeUnityProvider;
