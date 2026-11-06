using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace MangaGui.Services;

public class CoverService
{
    private static readonly HttpClient _httpClient = new() 
    { 
        Timeout = TimeSpan.FromSeconds(6) 
    };
    private static readonly ConcurrentDictionary<string, string> _memoryCache = new(StringComparer.OrdinalIgnoreCase);
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

    private static void LoadDiskCache()
    {
        try
        {
            if (File.Exists(_cacheFile))
            {
                var json = File.ReadAllText(_cacheFile);
                var dict = JsonSerializer.Deserialize<System.Collections.Generic.Dictionary<string, string>>(json);
                if (dict != null)
                {
                    foreach (var kvp in dict)
                    {
                        if (!string.IsNullOrWhiteSpace(kvp.Value))
                        {
                            _memoryCache[kvp.Key] = kvp.Value;
                        }
                    }
                }
            }
        }
        catch {}
    }

    private static void SaveDiskCache()
    {
        try
        {
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

        if (_memoryCache.TryGetValue(cacheKey, out var cached) && !string.IsNullOrWhiteSpace(cached))
        {
            return cached;
        }

        // 1. Try Kitsu first (fast, generous limits, high quality posters)
        var url = await QueryKitsuAsync(clean, type);

        // If not found and title has subtitle (e.g. "Series: Subtitle"), try base title
        if (string.IsNullOrWhiteSpace(url) && clean.Contains(':'))
        {
            var baseTitle = clean.Split(':')[0].Trim();
            if (baseTitle.Length > 2)
            {
                url = await QueryKitsuAsync(baseTitle, type);
            }
        }

        // 2. Try AniList as fallback
        if (string.IsNullOrWhiteSpace(url))
        {
            url = await QueryAniListAsync(clean, type);
        }

        if (!string.IsNullOrWhiteSpace(url))
        {
            _memoryCache[cacheKey] = url;
            SaveDiskCache();
            return url;
        }

        return null;
    }

    private static async Task<string?> QueryKitsuAsync(string cleanTitle, string type)
    {
        try
        {
            var endpoint = type.ToLower() == "manga" ? "manga" : "anime";
            var reqUrl = $"https://kitsu.io/api/edge/{endpoint}?filter[text]={Uri.EscapeDataString(cleanTitle)}&page[limit]=5";
            var res = await _httpClient.GetAsync(reqUrl);
            if (res.IsSuccessStatusCode)
            {
                var body = await res.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(body);
                if (doc.RootElement.TryGetProperty("data", out var data) && 
                    data.ValueKind == JsonValueKind.Array)
                {
                    string? firstPosterUrl = null;
                    foreach (var item in data.EnumerateArray())
                    {
                        if (item.TryGetProperty("attributes", out var attrs))
                        {
                            string? itemPosterUrl = null;
                            if (attrs.TryGetProperty("posterImage", out var poster) &&
                                poster.ValueKind == JsonValueKind.Object)
                            {
                                itemPosterUrl = poster.TryGetProperty("medium", out var m) ? m.GetString() :
                                                poster.TryGetProperty("small", out var s) ? s.GetString() :
                                                poster.TryGetProperty("original", out var o) ? o.GetString() : null;
                                if (firstPosterUrl == null && !string.IsNullOrWhiteSpace(itemPosterUrl))
                                {
                                    firstPosterUrl = itemPosterUrl;
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

                            if (matched && !string.IsNullOrWhiteSpace(itemPosterUrl))
                            {
                                return itemPosterUrl;
                            }
                        }
                    }

                    if (!string.IsNullOrWhiteSpace(firstPosterUrl))
                    {
                        return firstPosterUrl;
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
            var query = "query ($search: String, $type: MediaType) { Media(search: $search, type: $type) { title { romaji english } coverImage { large medium } } }";
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
                    data.TryGetProperty("Media", out var media) &&
                    media.ValueKind != JsonValueKind.Null)
                {
                    string? romaji = null;
                    string? english = null;
                    if (media.TryGetProperty("title", out var tObj) && tObj.ValueKind == JsonValueKind.Object)
                    {
                        if (tObj.TryGetProperty("romaji", out var r)) romaji = r.GetString();
                        if (tObj.TryGetProperty("english", out var e)) english = e.GetString();
                    }

                    if (IsTitleMatch(cleanTitle, romaji) || IsTitleMatch(cleanTitle, english))
                    {
                        if (media.TryGetProperty("coverImage", out var cover) && cover.ValueKind == JsonValueKind.Object)
                        {
                            return cover.TryGetProperty("large", out var l) ? l.GetString() :
                                   cover.TryGetProperty("medium", out var m) ? m.GetString() : null;
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
        if (qNorm == cNorm || cNorm.Contains(qNorm) || qNorm.Contains(cNorm)) return true;

        var qWords = qNorm.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var cWords = cNorm.Split(' ', StringSplitOptions.RemoveEmptyEntries);

        if (qWords.Length == 0 || cWords.Length == 0) return false;

        if (qWords.Length <= 2)
        {
            foreach (var w in qWords)
            {
                if (w.Length > 2 && !cNorm.Contains(w)) return false;
            }
            return true;
        }

        int matchCount = 0;
        int totalSignificant = 0;
        foreach (var w in qWords)
        {
            if (w.Length <= 2) continue;
            totalSignificant++;
            if (cNorm.Contains(w)) matchCount++;
        }

        return totalSignificant > 0 && ((double)matchCount / totalSignificant) >= 0.5;
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

        // Strip bracketed content containing metadata
        var s = Regex.Replace(raw, @"\[[^\]]*\]|\([^\)]*\)", m =>
        {
            var val = m.Value.ToLowerInvariant();
            if (val.Contains("sub") || val.Contains("ita") || val.Contains("dub") || 
                val.Contains("eng") || val.Contains("raw") || val.Contains("doppiat") ||
                val.Contains("film") || val.Contains("movie") || val.Contains("special") ||
                val.Contains("edition") || val.Contains("all"))
            {
                return " ";
            }
            return m.Value;
        });

        // Strip standalone keywords
        s = Regex.Replace(s, @"\b(ita|sub|dub|subita|subeng|eng|doppiato|special|specials|movie|film|ova|ona|oav|raw)\b", " ", RegexOptions.IgnoreCase);

        // Strip symbols and normalize spaces
        s = Regex.Replace(s, @"[()\[\]/\\_: -]+", " ");
        s = Regex.Replace(s, @"\s+", " ").Trim();
        return string.IsNullOrWhiteSpace(s) ? raw : s;
    }
}
