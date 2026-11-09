using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace MangaGui.Services;

public class CoverService
{
    private const string CacheSchemaVersion = "3";
    private const string CacheVersionKey = "__cache_version__";

    private static readonly HttpClient _httpClient = new()
    {
        Timeout = TimeSpan.FromSeconds(6)
    };
    private static readonly ConcurrentDictionary<string, string> _memoryCache = new(StringComparer.OrdinalIgnoreCase);
    private static readonly System.Threading.SemaphoreSlim _coverLock = new(1, 1);
    private static readonly string _cacheFile;

    static CoverService()
    {
        _httpClient.DefaultRequestHeaders.Add("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
        _httpClient.DefaultRequestHeaders.Add("Accept", "application/vnd.api+json, application/json");

        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var dir = Path.Combine(home, ".local", "state", "manga-cli");

        if (OperatingSystem.IsWindows())
        {
            var user = Environment.UserName;
            var wineHostDir = Path.Combine("Z:", "home", user, ".local", "state", "manga-cli");
            if (File.Exists(Path.Combine(wineHostDir, "covers.json")))
            {
                dir = wineHostDir;
            }
        }

        Directory.CreateDirectory(dir);
        _cacheFile = Path.Combine(dir, "covers.json");
        LoadDiskCache();
    }

    private static bool IsValidCoverUrl(string? url)
    {
        if (string.IsNullOrWhiteSpace(url)) return false;
        if (!url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
            !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }
        // Reject temporary signed S3 URLs that expire after 15 minutes
        if (url.Contains("X-Amz-Expires", StringComparison.OrdinalIgnoreCase) ||
            url.Contains("X-Amz-Signature", StringComparison.OrdinalIgnoreCase) ||
            url.Contains("backblazeb2.com", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }
        return true;
    }

    private static void LoadDiskCache()
    {
        try
        {
            if (File.Exists(_cacheFile))
            {
                var json = File.ReadAllText(_cacheFile);
                var dict = JsonSerializer.Deserialize<Dictionary<string, string>>(json);
                if (dict != null &&
                    dict.TryGetValue(CacheVersionKey, out var ver) &&
                    ver == CacheSchemaVersion)
                {
                    foreach (var kvp in dict)
                    {
                        if (kvp.Key == CacheVersionKey)
                        {
                            _memoryCache[kvp.Key] = kvp.Value;
                            continue;
                        }
                        if (IsValidCoverUrl(kvp.Value))
                        {
                            _memoryCache[kvp.Key] = kvp.Value;
                        }
                    }
                    return;
                }
            }
        }
        catch {}

        // Reset outdated or polluted cache and initialize clean v2 schema
        _memoryCache.Clear();
        _memoryCache[CacheVersionKey] = CacheSchemaVersion;
        SaveDiskCache();
    }

    private static void SaveDiskCache()
    {
        try
        {
            _memoryCache[CacheVersionKey] = CacheSchemaVersion;
            var json = JsonSerializer.Serialize(_memoryCache);
            File.WriteAllText(_cacheFile, json);
        }
        catch {}
    }

    public static async Task<string?> GetCoverAsync(string title, string type = "anime")
    {
        if (string.IsNullOrWhiteSpace(title)) return null;

        var clean = CleanTitle(title);
        var cacheKey = $"{type.ToLower()}:{clean.ToLower()}";

        if (_memoryCache.TryGetValue(cacheKey, out var cached) && IsValidCoverUrl(cached))
        {
            return cached;
        }

        await _coverLock.WaitAsync();
        try
        {
            if (_memoryCache.TryGetValue(cacheKey, out cached) && IsValidCoverUrl(cached))
            {
                return cached;
            }

            bool isManga = type.Equals("manga", StringComparison.OrdinalIgnoreCase);
            string? url = null;

            if (isManga)
            {
                // 1. For Manga, query AniList first (best catalog coverage for romaji, English, manhwa & synonyms)
                url = await QueryAniListAsync(clean, type);
                if (string.IsNullOrWhiteSpace(url) && title.Contains(':'))
                {
                    var baseTitle = CleanTitle(title.Split(':')[0]);
                    if (baseTitle.Length > 2 && !string.Equals(baseTitle, clean, StringComparison.OrdinalIgnoreCase))
                    {
                        url = await QueryAniListAsync(baseTitle, type);
                    }
                }

                // 2. Try Kitsu with strict title validation
                if (string.IsNullOrWhiteSpace(url))
                {
                    url = await QueryKitsuAsync(clean, type);
                }
                if (string.IsNullOrWhiteSpace(url) && title.Contains(':'))
                {
                    var baseTitle = CleanTitle(title.Split(':')[0]);
                    if (baseTitle.Length > 2 && !string.Equals(baseTitle, clean, StringComparison.OrdinalIgnoreCase))
                    {
                        url = await QueryKitsuAsync(baseTitle, type);
                    }
                }
            }
            else
            {
                // 1. For Anime, try Kitsu first then AniList
                url = await QueryKitsuAsync(clean, type);
                if (string.IsNullOrWhiteSpace(url) && title.Contains(':'))
                {
                    var baseTitle = CleanTitle(title.Split(':')[0]);
                    if (baseTitle.Length > 2 && !string.Equals(baseTitle, clean, StringComparison.OrdinalIgnoreCase))
                    {
                        url = await QueryKitsuAsync(baseTitle, type);
                    }
                }
                if (string.IsNullOrWhiteSpace(url))
                {
                    url = await QueryAniListAsync(clean, type);
                }
            }

            if (IsValidCoverUrl(url))
            {
                _memoryCache[cacheKey] = url!;
                SaveDiskCache();
                return url;
            }

            return null;
        }
        finally
        {
            await Task.Delay(120);
            _coverLock.Release();
        }
    }

    private static async Task<string?> QueryKitsuAsync(string cleanTitle, string type)
    {
        try
        {
            var endpoint = type.ToLower() == "manga" ? "manga" : "anime";
            var reqUrl = $"https://kitsu.io/api/edge/{endpoint}?filter[text]={Uri.EscapeDataString(cleanTitle)}&page[limit]=8";
            var res = await _httpClient.GetAsync(reqUrl);
            if (res.IsSuccessStatusCode)
            {
                var body = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.TryGetProperty("data", out var data) &&
                    data.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in data.EnumerateArray())
                    {
                        if (item.TryGetProperty("attributes", out var attrs))
                        {
                            string? itemPosterUrl = null;
                            if (attrs.TryGetProperty("posterImage", out var poster) &&
                                poster.ValueKind == JsonValueKind.Object)
                            {
                                var candidates = new[]
                                {
                                    poster.TryGetProperty("large", out var l) ? l.GetString() : null,
                                    poster.TryGetProperty("medium", out var m) ? m.GetString() : null,
                                    poster.TryGetProperty("small", out var s) ? s.GetString() : null,
                                    poster.TryGetProperty("original", out var o) ? o.GetString() : null
                                };
                                itemPosterUrl = candidates.FirstOrDefault(IsValidCoverUrl);
                            }

                            if (string.IsNullOrWhiteSpace(itemPosterUrl)) continue;

                            // Skip 18+ adult / hentai entries in Kitsu
                            if (attrs.TryGetProperty("ageRating", out var ageProp) && ageProp.ValueKind == JsonValueKind.String)
                            {
                                var rating = ageProp.GetString();
                                if (string.Equals(rating, "R18", StringComparison.OrdinalIgnoreCase))
                                {
                                    continue;
                                }
                            }

                            var canonical = attrs.TryGetProperty("canonicalTitle", out var ct) ? ct.GetString() : null;
                            bool matched = IsTitleMatch(cleanTitle, canonical);

                            if (!matched && attrs.TryGetProperty("titles", out var titlesObj) && titlesObj.ValueKind == JsonValueKind.Object)
                            {
                                foreach (var prop in titlesObj.EnumerateObject())
                                {
                                    if (prop.Value.ValueKind == JsonValueKind.String && IsTitleMatch(cleanTitle, prop.Value.GetString()))
                                    {
                                        matched = true;
                                        break;
                                    }
                                }
                            }

                            if (!matched && attrs.TryGetProperty("abbreviatedTitles", out var abbrArr) && abbrArr.ValueKind == JsonValueKind.Array)
                            {
                                foreach (var abbr in abbrArr.EnumerateArray())
                                {
                                    if (abbr.ValueKind == JsonValueKind.String && IsTitleMatch(cleanTitle, abbr.GetString()))
                                    {
                                        matched = true;
                                        break;
                                    }
                                }
                            }

                            if (matched)
                            {
                                return itemPosterUrl;
                            }
                        }
                    }
                }
            }
        }
        catch {}

        return null;
    }

    private static async Task<string?> QueryAniListAsync(string cleanTitle, string type)
    {
        try
        {
            var mediaType = type.ToLower() == "manga" ? "MANGA" : "ANIME";
            var query = "query ($search: String, $type: MediaType) { Page(perPage: 10) { media(search: $search, type: $type, isAdult: false, sort: [POPULARITY_DESC]) { isAdult popularity title { romaji english native } synonyms coverImage { extraLarge large medium } } } }";
            var payload = new
            {
                query,
                variables = new { search = cleanTitle, type = mediaType }
            };

            var content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
            var res = await _httpClient.PostAsync("https://graphql.anilist.co", content);
            if (res.IsSuccessStatusCode)
            {
                var body = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.TryGetProperty("data", out var data) &&
                    data.ValueKind == JsonValueKind.Object &&
                    data.TryGetProperty("Page", out var page) &&
                    page.ValueKind == JsonValueKind.Object &&
                    page.TryGetProperty("media", out var mediaArr) &&
                    mediaArr.ValueKind == JsonValueKind.Array)
                {
                    foreach (var media in mediaArr.EnumerateArray())
                    {
                        if (media.TryGetProperty("isAdult", out var adultProp) &&
                            adultProp.ValueKind == JsonValueKind.True)
                        {
                            continue;
                        }

                        var candidateTitles = new List<string?>();
                        if (media.TryGetProperty("title", out var tObj) && tObj.ValueKind == JsonValueKind.Object)
                        {
                            if (tObj.TryGetProperty("romaji", out var r)) candidateTitles.Add(r.GetString());
                            if (tObj.TryGetProperty("english", out var e)) candidateTitles.Add(e.GetString());
                            if (tObj.TryGetProperty("native", out var n)) candidateTitles.Add(n.GetString());
                        }
                        if (media.TryGetProperty("synonyms", out var synArr) && synArr.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var syn in synArr.EnumerateArray())
                            {
                                if (syn.ValueKind == JsonValueKind.String)
                                {
                                    candidateTitles.Add(syn.GetString());
                                }
                            }
                        }

                        if (candidateTitles.Any(t => IsTitleMatch(cleanTitle, t)))
                        {
                            if (media.TryGetProperty("coverImage", out var cover) && cover.ValueKind == JsonValueKind.Object)
                            {
                                var url = cover.TryGetProperty("large", out var l) ? l.GetString() :
                                          cover.TryGetProperty("extraLarge", out var xl) ? xl.GetString() :
                                          cover.TryGetProperty("medium", out var m) ? m.GetString() : null;
                                if (IsValidCoverUrl(url))
                                {
                                    return url;
                                }
                            }
                        }
                    }
                }
            }
        }
        catch {}

        return null;
    }

    private static bool IsTitleMatch(string query, string? candidate)
    {
        if (string.IsNullOrWhiteSpace(candidate)) return false;
        var qNorm = NormalizeForMatch(query);
        var cNorm = NormalizeForMatch(candidate);

        if (string.IsNullOrWhiteSpace(qNorm) || string.IsNullOrWhiteSpace(cNorm)) return false;
        if (qNorm == cNorm) return true;

        var qWords = qNorm.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var cWords = cNorm.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (qWords.Length == 0 || cWords.Length == 0) return false;

        var cWordSet = new HashSet<string>(cWords, StringComparer.OrdinalIgnoreCase);
        var qWordSet = new HashSet<string>(qWords, StringComparer.OrdinalIgnoreCase);

        // If one is a single word and the other has multiple words, only match if the single word is >= 5 chars and is the first word (e.g. "Berserk" -> "Berserk: ...")
        if (qWords.Length == 1 && cWords.Length > 1)
        {
            return qWords[0].Length >= 6 && cWords[0] == qWords[0] && cWords.Length <= 3;
        }
        if (cWords.Length == 1 && qWords.Length > 1)
        {
            return cWords[0].Length >= 6 && qWords[0] == cWords[0] && qWords.Length <= 3;
        }

        // For 2-word queries, require both words to be present as full words in candidate (or exact prefix)
        if (qWords.Length == 2)
        {
            bool bothMatch = qWords.All(w => cWordSet.Contains(w));
            return bothMatch && cWords.Length <= 5;
        }

        // For longer queries, require at least 75% of significant words (length > 2) to match as whole words
        var sigQ = qWords.Where(w => w.Length > 2).ToList();
        if (sigQ.Count == 0) return qNorm == cNorm;

        int matched = sigQ.Count(w => cWordSet.Contains(w));
        double ratio = (double)matched / sigQ.Count;

        var sigC = cWords.Where(w => w.Length > 2).ToList();
        int reverseMatched = sigC.Count(w => qWordSet.Contains(w));
        double reverseRatio = sigC.Count > 0 ? (double)reverseMatched / sigC.Count : 0;

        return (ratio >= 0.75 && reverseRatio >= 0.5) || (ratio >= 0.85);
    }

    private static string NormalizeForMatch(string str)
    {
        return Regex.Replace(str.ToLowerInvariant(), @"[^a-z0-9\s]", " ")
                    .Replace("  ", " ")
                    .Trim();
    }

    public static string CleanTitle(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "";

        // Strip bracketed content containing metadata or copyright notes
        var s = Regex.Replace(raw, @"\[[^\]]*\]|\([^\)]*\)", m =>
        {
            var val = m.Value.ToLowerInvariant();
            if (val.Contains("sub") || val.Contains("ita") || val.Contains("dub") ||
                val.Contains("eng") || val.Contains("raw") || val.Contains("doppiat") ||
                val.Contains("film") || val.Contains("movie") || val.Contains("special") ||
                val.Contains("edition") || val.Contains("all") || val.Contains("color") ||
                val.Contains("oscurat") || val.Contains("copyright") || val.Contains("release"))
            {
                return " ";
            }
            return m.Value;
        });

        // Strip trailing @comic / @manga tags
        s = Regex.Replace(s, @"@\s*(comic|manga)\b", " ", RegexOptions.IgnoreCase);

        // Strip common manga edition suffixes
        s = Regex.Replace(s, @"\b(digital\s+colored\s+comics|full\s+color\s+selection|colored\s+edition|official\s+colored|fan\s+colored|english\s+edition|causa\s+copyright\s+oscurato|oscurato\s+causa\s+copyright)\b", " ", RegexOptions.IgnoreCase);
        s = Regex.Replace(s, @"\(\s*causa\s+copyright[^\)]*\)", " ", RegexOptions.IgnoreCase);
        s = Regex.Replace(s, @"-\s*digital\s+colored\s+comics.*$", " ", RegexOptions.IgnoreCase);

        // Strip standalone keywords
        s = Regex.Replace(s, @"\b(ita|sub|dub|subita|subeng|eng|doppiato|special|specials|movie|film|ova|ona|oav|raw)\b", " ", RegexOptions.IgnoreCase);

        // Strip symbols and normalize spaces
        s = Regex.Replace(s, @"[()\[\]/\\_: -]+", " ");
        s = Regex.Replace(s, @"\s+", " ").Trim();
        return string.IsNullOrWhiteSpace(s) ? raw : s;
    }
}
