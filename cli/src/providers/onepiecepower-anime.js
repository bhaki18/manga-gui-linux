const cheerio = require('cheerio');
const BaseProvider = require('./base');
const { fetchHtml } = require('../utils/http');
const { getGenreConfig, normalizeAudio, matchesGenreText, matchesAudioFilter } = require('../utils/filters');

const POPULAR_ANIME_KEYWORDS = [
  'one piece', 'naruto', 'bleach', 'dragon ball', 'attack on titan',
  'shingeki no kyojin', 'jujutsu kaisen', 'demon slayer', 'kimetsu no yaiba',
  'chainsaw man', 'solo leveling', 'my hero academia', 'hunter x hunter',
  'death note', 'fullmetal alchemist', 'black clover', 'tokyo ghoul',
  'sword art online', 'code geass', 'steins', 'evangelion', 'cowboy bebop',
  'frieren', 'dandadan', 'blue lock', 'vinland saga', 'spy x family',
  'one punch man', 'mob psycho', 'dr. stone', 'fire force', 'fairy tail',
  'tokyo revengers', 'haikyuu', 'overlord', 're:zero', 'konosuba', 'gintama',
  'monster', 'parasyte', 'cyberpunk', 'devilman', 'hellsing', 'berserk'
];

class OnePiecePowerAnimeProvider extends BaseProvider {
  constructor() {
    super('One Piece Power Anime', 'https://onepiecepower.com', {
      id: 'onepiecepower-anime',
      type: 'anime',
      languages: ['it', 'en'],
      isBuiltIn: true
    });
    this.id = 'onepiecepower-anime';
    this.type = 'anime';
    this.languages = ['it', 'en'];
    this.isBuiltIn = true;
    this.animeListCache = null;
  }

  /**
   * Fetches and caches the complete anime catalog from /anime18/lista-anime2
   */
  async getAllAnime() {
    if (this.animeListCache) {
      return this.animeListCache;
    }

    const html = await fetchHtml(`${this.baseUrl}/anime18/lista-anime2`);
    const $ = cheerio.load(html);
    const list = [];

    // 1. One Piece main anime entries
    list.push({
      id: 'onepiece-subita',
      title: 'One Piece (Sub ITA)',
      url: `${this.baseUrl}/anime18/onepiece/subita2/lista-episodi`,
      language: 'it',
      audio: 'subita',
      source: 'onepiecepower-anime',
      sourceName: 'One Piece Power Anime'
    });
    list.push({
      id: 'onepiece-ita',
      title: 'One Piece (ITA Doppiato)',
      url: `${this.baseUrl}/anime18/onepiece/ita3/lista-episodi`,
      language: 'it',
      audio: 'ita',
      source: 'onepiecepower-anime',
      sourceName: 'One Piece Power Anime'
    });
    list.push({
      id: 'onepiece-eng',
      title: 'One Piece (English Sub)',
      url: `${this.baseUrl}/anime18/one-piece-eng/episode-list`,
      language: 'en',
      audio: 'sub',
      source: 'onepiecepower-anime',
      sourceName: 'One Piece Power Anime'
    });
    list.push({
      id: 'onepiece-movie',
      title: 'One Piece Movie / Film',
      url: `${this.baseUrl}/anime18/one-piece-movie/episodi/lista-movie`,
      language: 'it',
      audio: 'both',
      source: 'onepiecepower-anime',
      sourceName: 'One Piece Power Anime'
    });
    list.push({
      id: 'onepiece-special',
      title: 'One Piece Special',
      url: `${this.baseUrl}/anime18/onepiece/special/lista-special`,
      language: 'it',
      audio: 'both',
      source: 'onepiecepower-anime',
      sourceName: 'One Piece Power Anime'
    });

    const seenUrls = new Set(list.map(a => a.url));

    // 2. Parse all catalog links from table / links
    $('a').each((_, el) => {
      let href = $(el).attr('href');
      let text = $(el).text().trim();
      if (!href || !text) return;

      if (
        href.includes('lista-anime') ||
        href.includes('login') ||
        href.includes('vip') ||
        href.includes('guide') ||
        href.includes('amazon') ||
        href.includes('telegram') ||
        href.includes('play.google') ||
        href.startsWith('mailto:') ||
        href.startsWith('javascript:')
      ) {
        return;
      }

      if (href.includes('episodi') || href.includes('lista') || href.includes('movie') || href.includes('special')) {
        if (text.toLowerCase().includes('one piece')) return;

        let fullUrl = href;
        if (!fullUrl.startsWith('http')) {
          fullUrl = `${this.baseUrl}/anime18/${href.replace(/^\.\.\/\.\.\//, '')}`;
        }

        if (seenUrls.has(fullUrl)) return;
        seenUrls.add(fullUrl);

        const isIta = text.includes('ITA') || text.includes('Ita');
        const isSub = text.includes('SUB') || text.includes('Sub');
        let audio = 'both';
        if (isSub && !text.includes('ITA/')) audio = 'subita';
        else if (isIta && !isSub) audio = 'ita';

        list.push({
          id: fullUrl,
          title: text,
          url: fullUrl,
          language: 'it',
          audio,
          source: 'onepiecepower-anime',
          sourceName: 'One Piece Power Anime'
        });
      }
    });

    this.animeListCache = list;
    return list;
  }

  /**
   * Returns catalog with popular anime prioritized first
   */
  async getCatalog(lang = null, filters = {}) {
    const all = await this.getAllAnime();
    const genreCfg = getGenreConfig(filters?.genre);
    const audioKey = normalizeAudio(filters?.audio);

    const filtered = all.filter(a => {
      if (lang && lang !== 'all' && a.language !== lang) return false;
      if (!matchesAudioFilter(a.audio, audioKey, a.title, lang, a.language)) return false;
      if (genreCfg && !matchesGenreText(a.genres || 'Azione, Avventura, Shounen', filters.genre, a.title)) return false;
      return true;
    });

    const popular = [];
    const rest = [];

    for (const item of filtered) {
      const t = item.title.toLowerCase();
      const isPop = POPULAR_ANIME_KEYWORDS.some(k => t.includes(k));
      if (isPop) {
        popular.push(item);
      } else {
        rest.push(item);
      }
    }

    return [...popular, ...rest];
  }

  /**
   * Search anime by title or keywords
   */
  async search(query, lang = null, filters = {}) {
    if (!query || !query.trim()) {
      return this.getCatalog(lang, filters);
    }
    const catalog = await this.getAllAnime();
    const genreCfg = getGenreConfig(filters?.genre);
    const audioKey = normalizeAudio(filters?.audio);
    const clean = (query || '').replace(/\s*\[[^\]]*\]\s*/g, ' ').toLowerCase().trim();
    const cleanNorm = clean.replace(/[^a-z0-9]/g, '');

    return catalog.filter(a => {
      if (lang && lang !== 'all' && a.language !== lang) return false;
      if (!matchesAudioFilter(a.audio, audioKey, a.title, lang, a.language)) return false;
      if (genreCfg && !matchesGenreText(a.genres || 'Azione, Avventura, Shounen', filters.genre, a.title)) return false;
      if (!clean) return true;
      const titleLower = a.title.toLowerCase();
      if (titleLower.includes(clean)) return true;
      if (cleanNorm.length >= 3 && titleLower.replace(/[^a-z0-9]/g, '').includes(cleanNorm)) return true;
      return false;
    });
  }

  /**
   * Pick a random anime from catalog
   */
  async getRandomAnime(lang = null) {
    const catalog = await this.getAllAnime();
    const filtered = lang && lang !== 'all' ? catalog.filter(a => a.language === lang) : catalog;
    if (filtered.length === 0) return null;
    const idx = Math.floor(Math.random() * filtered.length);
    return filtered[idx];
  }

  /**
   * Get all episodes for an anime series
   */
  async getEpisodes(animeUrl) {
    const html = await fetchHtml(animeUrl);
    const $ = cheerio.load(html);
    const episodes = [];

    const baseUrlParts = animeUrl.split('/');
    baseUrlParts.pop();
    const dirUrl = baseUrlParts.join('/');

    $('table tr').each((_, el) => {
      const link = $(el).find('a[href*="pagine/"]').first();
      if (link.length > 0) {
        const rawHref = link.attr('href');
        let fullUrl = rawHref;
        if (!fullUrl.startsWith('http')) {
          fullUrl = `${dirUrl}/${rawHref.replace(/^\.\//, '')}`;
        }

        let title = $(el).text().replace(/\s+/g, ' ').trim();
        const epMatch = fullUrl.match(/pagine\/(?:[^\/]+\/)?(\d+)/);
        const epNum = epMatch ? epMatch[1] : '';

        if (!title && epNum) {
          title = `Episodio ${parseInt(epNum, 10)}`;
        }

        episodes.push({
          id: epNum || fullUrl,
          title,
          url: fullUrl
        });
      }
    });

    if (episodes.length === 0) {
      $('a[href*="pagine/"]').each((_, el) => {
        const rawHref = $(el).attr('href');
        let fullUrl = rawHref;
        if (!fullUrl.startsWith('http')) {
          fullUrl = `${dirUrl}/${rawHref.replace(/^\.\//, '')}`;
        }
        let title = $(el).text().trim() || $(el).parent().text().replace(/\s+/g, ' ').trim();
        const epMatch = fullUrl.match(/pagine\/(?:[^\/]+\/)?(\d+)/);
        const epNum = epMatch ? epMatch[1] : '';
        if (!title && epNum) {
          title = `Episodio ${parseInt(epNum, 10)}`;
        }
        episodes.push({
          id: epNum || fullUrl,
          title,
          url: fullUrl
        });
      });
    }

    return episodes;
  }

  /**
   * Resolves the video stream for an episode page
   */
  async getEpisodeStream(episodeUrl, preferredAudio = 'subita') {
    const html = await fetchHtml(episodeUrl);
    const $ = cheerio.load(html);

    let streamOptions = {
      ita: null,
      subita: null,
      direct: null
    };

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html());
        const u = data.contentUrl || data.embedUrl;
        if (u && u.includes('.mp4')) {
          streamOptions.direct = u;
          if (u.includes('/subita/')) streamOptions.subita = u;
          if (u.includes('/ita/')) streamOptions.ita = u;
        }
      } catch {}
    });

    $('script').each((_, el) => {
      const s = $(el).html() || '';

      const concatMatch = s.match(/['"](https?:\/\/(?:serverfile|stream)[^'"]+)['"]\s*\+\s*type\s*\+\s*['"]([^'"]+)['"]/);
      if (concatMatch) {
        streamOptions.ita = concatMatch[1] + 'ita' + concatMatch[2];
        streamOptions.subita = concatMatch[1] + 'subita' + concatMatch[2];
      }

      const vMatch = s.match(/videoUrl\s*:\s*["']([^"']+\.mp4[^"']*)["']/);
      if (vMatch) {
        streamOptions.direct = vMatch[1];
        if (vMatch[1].includes('/subita/')) streamOptions.subita = vMatch[1];
        if (vMatch[1].includes('/ita/')) streamOptions.ita = vMatch[1];
      }

      if (!streamOptions.direct && !streamOptions.ita && !streamOptions.subita) {
        const sfcMatch = s.match(/["'](https?:\/\/serverfile\.club\/[^"']+\.mp4)["']/);
        if (sfcMatch) {
          streamOptions.direct = sfcMatch[1];
          if (sfcMatch[1].includes('/subita/')) streamOptions.subita = sfcMatch[1];
          if (sfcMatch[1].includes('/ita/')) streamOptions.ita = sfcMatch[1];
        }
      }
    });

    if (!streamOptions.direct && !streamOptions.ita && !streamOptions.subita) {
      const vid = $('video source').attr('src') || $('video').attr('src');
      if (vid) {
        streamOptions.direct = vid;
        if (vid.includes('/subita/')) streamOptions.subita = vid;
        if (vid.includes('/ita/')) streamOptions.ita = vid;
      }
    }

    const availableAudios = [];
    if (streamOptions.ita) availableAudios.push('ita');
    if (streamOptions.subita) availableAudios.push('subita');

    let selectedUrl = null;
    if (preferredAudio === 'ita' && streamOptions.ita) {
      selectedUrl = streamOptions.ita;
    } else if (preferredAudio === 'subita' && streamOptions.subita) {
      selectedUrl = streamOptions.subita;
    } else {
      selectedUrl = streamOptions.subita || streamOptions.ita || streamOptions.direct;
    }

    return {
      streamUrl: selectedUrl,
      options: streamOptions,
      availableAudios
    };
  }
}

module.exports = OnePiecePowerAnimeProvider;
