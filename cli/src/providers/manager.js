const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const BaseProvider = require('./base');
const { BaseMangaProvider, BaseAnimeProvider, cheerio, http } = BaseProvider;

const OnePiecePowerProvider = require('./onepiecepower');
const MangaDexProvider = require('./mangadex');
const MangapillProvider = require('./mangapill');
const OnePiecePowerAnimeProvider = require('./onepiecepower-anime');
const createAnimeWorldProvider = require('./community/animeworld');
const createAnimeSaturnProvider = require('./community/animesaturn');
const createAnimeUnityProvider = require('./community/animeunity');
const createMangaWorldProvider = require('./community/mangaworld');

const CONFIG_DIR = process.env.MANGA_CLI_CONFIG_DIR || 
  (process.env.XDG_CONFIG_HOME 
    ? path.join(process.env.XDG_CONFIG_HOME, 'manga-cli') 
    : path.join(os.homedir(), '.config', 'manga-cli'));

const PROVIDERS_DIR = path.join(CONFIG_DIR, 'providers');

class ProviderManager {
  constructor() {
    this.mangaProviders = new Map();
    this.animeProviders = new Map();
    this.errors = [];

    this.ensureDir();
    this.loadBuiltInProviders();
    this.loadCustomProviders();
  }

  ensureDir() {
    if (!fs.existsSync(PROVIDERS_DIR)) {
      try {
        fs.mkdirSync(PROVIDERS_DIR, { recursive: true });
      } catch (err) {
        // Ignored if cannot create directory
      }
    }
  }

  getUserProvidersDir() {
    this.ensureDir();
    return PROVIDERS_DIR;
  }

  loadBuiltInProviders() {
    const opp = new OnePiecePowerProvider();
    const md = new MangaDexProvider();
    const mp = new MangapillProvider();
    const oppAnime = new OnePiecePowerAnimeProvider();

    const deps = {
      BaseProvider,
      BaseMangaProvider,
      BaseAnimeProvider,
      cheerio,
      ...http
    };

    const AnimeWorldProvider = createAnimeWorldProvider(deps);
    const AnimeSaturnProvider = createAnimeSaturnProvider(deps);
    const AnimeUnityProvider = createAnimeUnityProvider(deps);
    const MangaWorldProvider = createMangaWorldProvider(deps);

    const aw = new AnimeWorldProvider();
    const as = new AnimeSaturnProvider();
    const au = new AnimeUnityProvider();
    const mw = new MangaWorldProvider();

    this.mangaProviders.set(opp.id, opp);
    this.mangaProviders.set(mw.id, mw);
    this.mangaProviders.set(md.id, md);
    this.mangaProviders.set(mp.id, mp);

    this.animeProviders.set(oppAnime.id, oppAnime);
    this.animeProviders.set(aw.id, aw);
    this.animeProviders.set(as.id, as);
    this.animeProviders.set(au.id, au);
  }

  loadCustomProviders() {
    if (!fs.existsSync(PROVIDERS_DIR)) return;

    let files = [];
    try {
      files = fs.readdirSync(PROVIDERS_DIR).filter(f => f.endsWith('.js') && !f.startsWith('.'));
    } catch {
      return;
    }

    for (const file of files) {
      const fullPath = path.join(PROVIDERS_DIR, file);
      try {
        // Clear require cache to allow dynamic reloading
        delete require.cache[require.resolve(fullPath)];
        let mod = require(fullPath);

        // Support factory functions: module.exports = ({ BaseMangaProvider, ... }) => ...
        if (typeof mod === 'function' && !(mod.prototype && mod.prototype.search)) {
          mod = mod({
            BaseProvider,
            BaseMangaProvider,
            BaseAnimeProvider,
            cheerio,
            ...http
          });
        }

        let instance;
        if (typeof mod === 'function') {
          instance = new mod();
        } else if (mod && typeof mod === 'object') {
          instance = mod;
        }

        if (!instance || typeof instance.search !== 'function') {
          this.errors.push({ file, error: 'Provider must implement search() method' });
          continue;
        }

        const fileSlug = path.basename(file, '.js').toLowerCase();
        if (!instance.id) instance.id = fileSlug;
        if (!instance.name) instance.name = fileSlug;
        if (!instance.languages || !Array.isArray(instance.languages)) {
          instance.languages = ['all'];
        }
        instance.isCustom = true;
        instance.filePath = fullPath;

        if (!instance.type) {
          if (typeof instance.getEpisodes === 'function' || typeof instance.getEpisodeStream === 'function') {
            instance.type = 'anime';
          } else {
            instance.type = 'manga';
          }
        }

        // Do not overwrite built-in providers with outdated copies in ~/.config/manga-cli/providers
        if (instance.type === 'anime') {
          const existing = this.animeProviders.get(instance.id);
          if (existing && existing.isBuiltIn) continue;
          this.animeProviders.set(instance.id, instance);
        } else {
          const existing = this.mangaProviders.get(instance.id);
          if (existing && existing.isBuiltIn) continue;
          this.mangaProviders.set(instance.id, instance);
        }
      } catch (err) {
        this.errors.push({ file, error: err.message });
      }
    }
  }

  getAllProviders() {
    return [
      ...Array.from(this.mangaProviders.values()),
      ...Array.from(this.animeProviders.values())
    ];
  }

  getMangaProviders() {
    return Array.from(this.mangaProviders.values());
  }

  getAnimeProviders() {
    return Array.from(this.animeProviders.values());
  }

  matchesSource(provider, sourceFilter) {
    if (!sourceFilter) return true;
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const f = norm(sourceFilter);
    if (!f || f === 'all' || f === 'allsources' || f === 'tuttelefonti') return true;
    const pid = norm(provider.id);
    const pname = norm(provider.name);
    if (pid === f || pname === f || pid.includes(f) || pname.includes(f) || f.includes(pid)) return true;
    if ((f === 'onepiecepower' || f === 'onepiecepoweranime') && pid.includes('onepiecepower')) return true;
    return false;
  }

  interleaveArrays(arrays) {
    const valid = arrays.filter(a => Array.isArray(a) && a.length > 0);
    if (valid.length === 0) return [];
    if (valid.length === 1) return valid[0];

    const result = [];
    const maxLen = Math.max(...valid.map(a => a.length));
    for (let i = 0; i < maxLen; i++) {
      for (const arr of valid) {
        if (i < arr.length) {
          result.push(arr[i]);
        }
      }
    }
    return result;
  }

  getMangaProvider(id) {
    if (!id) return this.mangaProviders.get('onepiecepower');
    const cleanId = String(id).toLowerCase().trim();
    if (this.mangaProviders.has(cleanId)) {
      return this.mangaProviders.get(cleanId);
    }
    for (const prov of this.mangaProviders.values()) {
      if (this.matchesSource(prov, cleanId)) {
        return prov;
      }
    }
    return this.mangaProviders.get('onepiecepower');
  }

  getAnimeProvider(id) {
    if (!id) return this.animeProviders.get('onepiecepower-anime');
    const cleanId = String(id).toLowerCase().trim();
    if (this.animeProviders.has(cleanId)) {
      return this.animeProviders.get(cleanId);
    }
    for (const prov of this.animeProviders.values()) {
      if (this.matchesSource(prov, cleanId)) {
        return prov;
      }
    }
    return this.animeProviders.get('onepiecepower-anime');
  }

    getSearchDictionary() {
    if (this._searchDict) return this._searchDict;
    const dict = new Set([
      'fire', 'force', 'one', 'piece', 'death', 'note', 'black', 'clover', 'demon', 'slayer',
      'fairy', 'tail', 'solo', 'leveling', 'tokyo', 'ghoul', 'chain', 'saw', 'chainsaw', 'man',
      'attack', 'on', 'titan', 'sword', 'art', 'online', 'my', 'hero', 'academia', 'jujutsu', 'kaisen',
      'dr', 'stone', 'full', 'metal', 'fullmetal', 'alchemist', 'hunter', 'dandadan', 'dan', 'da',
      'spy', 'family', 'punch', 'dragon', 'ball', 'bleach', 'naruto', 'boruto', 'berserk', 'blue',
      'exorcist', 'ao', 'no', 'shingeki', 'kyojin', 'boku', 'hero', 'vinland', 'saga', 'mob', 'psycho',
      'overlord', 're', 'zero', 'fate', 'stay', 'night', 'haikyuu', 'gintama', 'evangelion', 'cowboy',
      'bebop', 'code', 'geass', 'steins', 'gate', 'monster', 'parasyte', 'hellsing', 'soul', 'eater',
      'world', 'trigger', 'ranking', 'kings', 'wind', 'breaker', 'mashle', 'kaiju', 'frieren',
      'apothecary', 'diaries', 'undead', 'unluck', 'shangri', 'la', 'frontier', 'classroom',
      'elite', 'mushoku', 'tensei', 'shield', 'slime', 'shadow', 'eminence', 'god', 'tower',
      'high', 'school', 'dxd', 'food', 'wars', 'shokugeki', 'soma', 'seven', 'deadly', 'sins',
      'nanatsu', 'taizai', 'noragami', 'bungo', 'stray', 'dogs', 'assassination', 'classroom',
      'blade', 'moon', 'sun', 'star', 'war', 'wars', 'game', 'online', 'life', 'magic', 'magical',
      'girl', 'boy', 'lord', 'king', 'queen', 'prince', 'princess', 'knight', 'legend', 'chronicles',
      'adventure', 'quest', 'dungeon', 'labyrinth', 'goblin', 'zombie', 'vampire', 'witch', 'wizard',
      'dark', 'light', 'white', 'red', 'gold', 'silver', 'iron', 'steel', 'blood', 'heart', 'spirit',
      'ghost', 'beast', 'monster', 'devil', 'angel', 'god', 'goddess', 'heaven', 'hell', 'abyss',
      'space', 'time', 'dream', 'night', 'day', 'dawn', 'dusk', 'shadow', 'phantom', 'zero', 'infinity'
    ]);
    this._searchDict = dict;
    return dict;
  }

  segmentQuery(word) {
    if (!word || typeof word !== 'string') return null;
    const clean = word.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const n = clean.length;
    if (n < 4) return null;

    const dict = this.getSearchDictionary();

    // 1. Try 2-word split (e.g. fire + force, one + piece, solo + leveling)
    for (let i = 2; i <= n - 2; i++) {
      const left = clean.slice(0, i);
      const right = clean.slice(i);
      if (dict.has(left) && dict.has(right)) {
        return `${left} ${right}`;
      }
    }

    // 2. Try 3-word split (e.g. attack + on + titan, sword + art + online)
    for (let i = 2; i <= n - 4; i++) {
      const left = clean.slice(0, i);
      if (dict.has(left)) {
        for (let j = i + 1; j <= n - 2; j++) {
          const mid = clean.slice(i, j);
          const right = clean.slice(j);
          if (dict.has(mid) && dict.has(right)) {
            return `${left} ${mid} ${right}`;
          }
        }
      }
    }

    return null;
  }

  async searchManga(query, lang = null, sourceFilter = null, filters = {}) {
    let providers = this.getMangaProviders();

    if (sourceFilter) {
      providers = providers.filter(p => this.matchesSource(p, sourceFilter));
    }

    if (providers.length === 0) {
      return [];
    }

    const segmented = this.segmentQuery(query);
    const searchPromises = providers.map(async (provider) => {
      try {
        let items = await provider.search(query, lang, filters);
        if ((!Array.isArray(items) || items.length === 0) && segmented && segmented.toLowerCase() !== query.toLowerCase()) {
          const fallbackItems = await provider.search(segmented, lang, filters);
          if (Array.isArray(fallbackItems) && fallbackItems.length > 0) {
            items = fallbackItems;
          }
        }
        if (!Array.isArray(items)) return [];
        return items.map(item => ({
          ...item,
          type: 'manga',
          source: item.source || provider.id,
          sourceName: item.sourceName || provider.name,
          language: item.language || (lang && lang !== 'all' ? lang : (provider.languages[0] !== 'all' ? provider.languages[0] : 'en'))
        }));
      } catch (err) {
        return [];
      }
    });

    const settled = await Promise.allSettled(searchPromises);
    const arrays = [];
    for (const res of settled) {
      if (res.status === 'fulfilled' && Array.isArray(res.value) && res.value.length > 0) {
        arrays.push(res.value);
      }
    }
    return this.interleaveArrays(arrays);
  }

  async searchAnime(query, lang = null, sourceFilter = null, filters = {}) {
    let providers = this.getAnimeProviders();

    if (sourceFilter) {
      providers = providers.filter(p => this.matchesSource(p, sourceFilter));
    }

    if (providers.length === 0) {
      return [];
    }

    const segmented = this.segmentQuery(query);
    const searchPromises = providers.map(async (provider) => {
      try {
        let items = await provider.search(query, lang, filters);
        if ((!Array.isArray(items) || items.length === 0) && segmented && segmented.toLowerCase() !== query.toLowerCase()) {
          const fallbackItems = await provider.search(segmented, lang, filters);
          if (Array.isArray(fallbackItems) && fallbackItems.length > 0) {
            items = fallbackItems;
          }
        }
        if (!Array.isArray(items)) return [];
        return items.map(item => ({
          ...item,
          type: 'anime',
          source: item.source || provider.id,
          sourceName: item.sourceName || provider.name,
          language: item.language || (lang && lang !== 'all' ? lang : (provider.languages[0] !== 'all' ? provider.languages[0] : 'it')),
          audio: item.audio || 'both'
        }));
      } catch (err) {
        return [];
      }
    });

    const settled = await Promise.allSettled(searchPromises);
    const arrays = [];
    for (const res of settled) {
      if (res.status === 'fulfilled' && Array.isArray(res.value) && res.value.length > 0) {
        arrays.push(res.value);
      }
    }
    return this.interleaveArrays(arrays);
  }

  /**
   * Retrieves the manga catalog (either all providers or a specific provider)
   */
  async getMangaCatalog(sourceFilter = null, lang = null, filters = {}) {
    let providers = this.getMangaProviders();

    if (sourceFilter) {
      providers = providers.filter(p => this.matchesSource(p, sourceFilter));
    }

    if (providers.length === 0) {
      return [];
    }

    const promises = providers.map(async (provider) => {
      try {
        let items = [];
        if (typeof provider.getCatalog === 'function') {
          items = await provider.getCatalog(lang, filters);
        } else if (typeof provider.search === 'function') {
          items = await provider.search('', lang, filters);
        }
        if (!Array.isArray(items)) return [];
        return items.map(item => ({
          ...item,
          type: 'manga',
          source: item.source || provider.id,
          sourceName: item.sourceName || provider.name,
          language: item.language || (lang && lang !== 'all' ? lang : (provider.languages[0] !== 'all' ? provider.languages[0] : 'en'))
        }));
      } catch (err) {
        return [];
      }
    });

    const settled = await Promise.allSettled(promises);
    const arrays = [];
    for (const res of settled) {
      if (res.status === 'fulfilled' && Array.isArray(res.value) && res.value.length > 0) {
        arrays.push(res.value);
      }
    }
    return this.interleaveArrays(arrays);
  }

  /**
   * Retrieves the anime catalog (either all providers or a specific provider)
   */
  async getAnimeCatalog(sourceFilter = null, lang = null, filters = {}) {
    let providers = this.getAnimeProviders();

    if (sourceFilter) {
      providers = providers.filter(p => this.matchesSource(p, sourceFilter));
    }

    if (providers.length === 0) {
      return [];
    }

    const promises = providers.map(async (provider) => {
      try {
        let items = [];
        if (typeof provider.getCatalog === 'function') {
          items = await provider.getCatalog(lang, filters);
        } else if (typeof provider.search === 'function') {
          items = await provider.search('', lang, filters);
        }
        if (!Array.isArray(items)) return [];
        return items.map(item => ({
          ...item,
          type: 'anime',
          source: item.source || provider.id,
          sourceName: item.sourceName || provider.name,
          language: item.language || (lang && lang !== 'all' ? lang : (provider.languages[0] !== 'all' ? provider.languages[0] : 'it')),
          audio: item.audio || 'both'
        }));
      } catch (err) {
        return [];
      }
    });

    const settled = await Promise.allSettled(promises);
    const arrays = [];
    for (const res of settled) {
      if (res.status === 'fulfilled' && Array.isArray(res.value) && res.value.length > 0) {
        arrays.push(res.value);
      }
    }
    return this.interleaveArrays(arrays);
  }

  /**
   * Retrieves full catalog (Manga and/or Anime) according to options
   * @param {{ type?: 'all'|'manga'|'anime', source?: string|null, lang?: string|null, filters?: { genre?: string, audio?: string } }} options
   */
  async getFullCatalog({ type = 'all', source = null, lang = null, filters = {} } = {}) {
    const catalog = { manga: [], anime: [] };

    if (source && type === 'all') {
      const hasManga = this.getMangaProviders().some(p => this.matchesSource(p, source));
      const hasAnime = this.getAnimeProviders().some(p => this.matchesSource(p, source));

      if (hasManga && !hasAnime) {
        catalog.manga = await this.getMangaCatalog(source, lang, filters);
      } else if (hasAnime && !hasManga) {
        catalog.anime = await this.getAnimeCatalog(source, lang, filters);
      } else {
        catalog.manga = await this.getMangaCatalog(source, lang, filters);
        catalog.anime = await this.getAnimeCatalog(source, lang, filters);
      }
      return catalog;
    }

    if (type === 'manga' || type === 'all') {
      catalog.manga = await this.getMangaCatalog(source, lang, filters);
    }
    if (type === 'anime' || type === 'all') {
      catalog.anime = await this.getAnimeCatalog(source, lang, filters);
    }

    return catalog;
  }

  addProviderFromFileOrUrl(fileOrUrl) {
    this.ensureDir();
    const isUrl = fileOrUrl.startsWith('http://') || fileOrUrl.startsWith('https://');

    if (isUrl) {
      const urlObj = new URL(fileOrUrl);
      let filename = path.basename(urlObj.pathname);
      if (!filename.endsWith('.js')) {
        filename = `${filename || 'custom-source'}.js`;
      }
      const targetPath = path.join(PROVIDERS_DIR, filename);

      // Fetch code with curl
      const code = execFileSync('curl', ['-s', '-L', fileOrUrl], { encoding: 'utf-8' });
      if (!code || code.trim().length === 0) {
        throw new Error(`Failed to download provider code from: ${fileOrUrl}`);
      }
      fs.writeFileSync(targetPath, code, 'utf-8');
      return { targetPath, filename };
    } else {
      const resolved = path.resolve(fileOrUrl);
      if (!fs.existsSync(resolved)) {
        throw new Error(`Source file not found at: ${resolved}`);
      }
      const filename = path.basename(resolved);
      const targetPath = path.join(PROVIDERS_DIR, filename);
      fs.copyFileSync(resolved, targetPath);
      return { targetPath, filename };
    }
  }

  removeProvider(idOrName) {
    this.ensureDir();
    const clean = idOrName.toLowerCase().replace(/\.js$/, '');
    const files = fs.readdirSync(PROVIDERS_DIR);

    for (const file of files) {
      const name = path.basename(file, '.js').toLowerCase();
      if (name === clean || file.toLowerCase() === `${clean}.js`) {
        const targetPath = path.join(PROVIDERS_DIR, file);
        fs.unlinkSync(targetPath);
        return { success: true, file, targetPath };
      }
    }
    return { success: false, file: idOrName };
  }

  createTemplate(name, type = 'manga') {
    this.ensureDir();
    const cleanSlug = (name || 'my-source')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/^-+|-+$/g, '') || 'my-source';

    const filename = `${cleanSlug}.js`;
    const targetPath = path.join(PROVIDERS_DIR, filename);

    if (fs.existsSync(targetPath)) {
      throw new Error(`A provider file already exists at: ${targetPath}`);
    }

    const templateContent = type === 'anime'
      ? `/**
 * Custom Anime Provider for manga-cli
 * File: ${filename}
 */
module.exports = ({ BaseAnimeProvider, cheerio, fetchHtml, fetchJson }) => {
  return class CustomAnimeProvider extends BaseAnimeProvider {
    constructor() {
      super('${name || 'My Anime Source'}', 'https://example.com', {
        id: '${cleanSlug}',
        languages: ['it'], // List of supported language codes: 'it', 'en', 'es', etc.
      });
    }

    /**
     * 1. Search anime by title
     * @param {string} query Search keyword
     * @param {string|null} lang Filter language (e.g. 'it')
     * @returns {Promise<Array<{ id: string, title: string, url: string, audio?: 'ita'|'subita'|'both' }>>}
     */
    async search(query, lang = null) {
      // Example using HTML scraping:
      // const html = await this.fetchHtml(\`\${this.baseUrl}/search?q=\${encodeURIComponent(query)}\`);
      // const $ = this.cheerio.load(html);
      // const results = [];
      // $('.anime-item').each((_, el) => {
      //   results.push({
      //     id: $(el).find('a').attr('href'),
      //     title: $(el).find('.title').text().trim(),
      //     url: $(el).find('a').attr('href'),
      //     audio: 'subita'
      //   });
      // });
      // return results;

      return [];
    }

    /**
     * 2. Get list of episodes for an anime series
     * @param {string} animeUrl The url returned from search
     * @returns {Promise<Array<{ id: string, title: string, url: string }>>}
     */
    async getEpisodes(animeUrl) {
      // const html = await this.fetchHtml(animeUrl);
      // const $ = this.cheerio.load(html);
      // const episodes = [];
      // $('.episode-item a').each((_, el) => {
      //   episodes.push({
      //     id: $(el).text().trim(),
      //     title: \`Episodio \${$(el).text().trim()}\`,
      //     url: $(el).attr('href')
      //   });
      // });
      // return episodes;

      return [];
    }

    /**
     * 3. Resolve the direct MP4 / HLS streaming URL for an episode
     * @param {string} episodeUrl
     * @param {'subita'|'ita'|string} preferredAudio
     * @returns {Promise<{ streamUrl: string|null, options?: { ita?: string, subita?: string }, availableAudios?: string[] }>}
     */
    async getEpisodeStream(episodeUrl, preferredAudio = 'subita') {
      // const html = await this.fetchHtml(episodeUrl);
      // const $ = this.cheerio.load(html);
      // const streamUrl = $('video source').attr('src') || $('video').attr('src');
      // return {
      //   streamUrl,
      //   availableAudios: ['subita']
      // };

      return { streamUrl: null };
    }
  };
};
`
      : `/**
 * Custom Manga Provider for manga-cli
 * File: ${filename}
 */
module.exports = ({ BaseMangaProvider, cheerio, fetchHtml, fetchJson }) => {
  return class CustomMangaProvider extends BaseMangaProvider {
    constructor() {
      super('${name || 'My Manga Source'}', 'https://example.com', {
        id: '${cleanSlug}',
        languages: ['it', 'en'], // List of supported languages: 'it', 'en', 'es', etc.
      });
    }

    /**
     * 1. Search manga by title
     * @param {string} query Search keyword
     * @param {string|null} lang Filter language (e.g. 'it')
     * @returns {Promise<Array<{ id: string, title: string, url: string, author?: string, genres?: string }>>}
     */
    async search(query, lang = null) {
      // Example using HTML scraping:
      // const html = await this.fetchHtml(\`\${this.baseUrl}/search?q=\${encodeURIComponent(query)}\`);
      // const $ = this.cheerio.load(html);
      // const results = [];
      // $('.manga-card').each((_, el) => {
      //   results.push({
      //     id: $(el).find('a').attr('href'),
      //     title: $(el).find('.title').text().trim(),
      //     url: $(el).find('a').attr('href'),
      //     author: $(el).find('.author').text().trim()
      //   });
      // });
      // return results;

      return [];
    }

    /**
     * 2. Get list of chapters for a manga
     * @param {string} mangaUrl The url returned from search
     * @param {string|null} lang
     * @returns {Promise<Array<{ id: string, title: string, url: string, number?: number|string }>>}
     */
    async getChapters(mangaUrl, lang = null) {
      // const html = await this.fetchHtml(mangaUrl);
      // const $ = this.cheerio.load(html);
      // const chapters = [];
      // $('.chapter-row a').each((_, el) => {
      //   chapters.push({
      //     id: $(el).attr('href'),
      //     title: $(el).text().trim(),
      //     url: $(el).attr('href')
      //   });
      // });
      // return chapters;

      return [];
    }

    /**
     * 3. Extract all page image URLs for a specific chapter
     * @param {string} chapterUrl
     * @returns {Promise<{ title?: string, pages: Array<string> }>}
     */
    async getChapterPages(chapterUrl) {
      // const html = await this.fetchHtml(chapterUrl);
      // const $ = this.cheerio.load(html);
      // const pages = [];
      // $('.chapter-pages img').each((_, el) => {
      //   const src = $(el).attr('src') || $(el).attr('data-src');
      //   if (src) pages.push(src);
      // });
      // return { pages };

      return { pages: [] };
    }
  };
};
`;

    fs.writeFileSync(targetPath, templateContent, 'utf-8');
    return { targetPath, filename };
  }

  reload() {
    this.mangaProviders.clear();
    this.animeProviders.clear();
    this.errors = [];
    this.loadBuiltInProviders();
    this.loadCustomProviders();
  }

  getCommunityCatalog() {
    const registryPath = path.join(__dirname, 'community', 'index.json');
    if (!fs.existsSync(registryPath)) return [];
    try {
      const raw = fs.readFileSync(registryPath, 'utf-8');
      const list = JSON.parse(raw);
      return list.map(item => {
        const isInstalled = this.mangaProviders.has(item.id) || this.animeProviders.has(item.id);
        return {
          ...item,
          isInstalled
        };
      });
    } catch {
      return [];
    }
  }

  installCommunitySource(id) {
    this.ensureDir();
    const catalog = this.getCommunityCatalog();
    const entry = catalog.find(c => c.id.toLowerCase() === id.toLowerCase() || c.name.toLowerCase() === id.toLowerCase());
    if (!entry) {
      throw new Error(`Source "${id}" not found in community catalog`);
    }

    const srcPath = path.join(__dirname, 'community', entry.file);
    if (!fs.existsSync(srcPath)) {
      throw new Error(`Source file ${entry.file} not found in community store`);
    }

    const destPath = path.join(PROVIDERS_DIR, entry.file);
    fs.copyFileSync(srcPath, destPath);
    this.reload();
    return {
      success: true,
      entry,
      destPath
    };
  }

  updateCommunitySources() {
    this.ensureDir();
    const catalog = this.getCommunityCatalog();
    const updated = [];

    for (const item of catalog) {
      const destPath = path.join(PROVIDERS_DIR, item.file);
      if (fs.existsSync(destPath)) {
        const srcPath = path.join(__dirname, 'community', item.file);
        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath);
          updated.push(item);
        }
      }
    }

    this.reload();
    return updated;
  }
}

module.exports = ProviderManager;
