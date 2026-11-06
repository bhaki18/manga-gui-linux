using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Serialization;
using CommunityToolkit.Mvvm.ComponentModel;

namespace MangaGui.Models;

public partial class MediaItem : ObservableObject
{
    [JsonPropertyName("id")]
    public string? Id { get; set; }

    [JsonPropertyName("title")]
    public string Title { get; set; } = string.Empty;

    [JsonPropertyName("url")]
    public string? Url { get; set; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasImage))]
    [property: JsonPropertyName("image")]
    private string? _image;

    [JsonPropertyName("type")]
    public string Type { get; set; } = "anime"; // "anime" or "manga"

    [JsonPropertyName("source")]
    public string Source { get; set; } = string.Empty;

    [JsonPropertyName("sourceName")]
    public string SourceName { get; set; } = string.Empty;

    [JsonPropertyName("language")]
    public string Language { get; set; } = "it";

    [JsonPropertyName("audio")]
    public string? Audio { get; set; } // "ita", "subita", "both"

    [JsonPropertyName("genres")]
    public string? Genres { get; set; }

    [JsonPropertyName("author")]
    public string? Author { get; set; }

    [ObservableProperty]
    private bool _isDownloaded;

    [ObservableProperty]
    private string? _localPath;

    [ObservableProperty]
    private string? _downloadSizeText;

    [ObservableProperty]
    private string? _customSubDubText;

    [ObservableProperty]
    [property: JsonPropertyName("count")]
    private int _count;

    [ObservableProperty]
    [property: JsonPropertyName("lastItem")]
    private string? _lastItem;

    [JsonPropertyName("lastAccessedAt")]
    public string? LastAccessedAt { get; set; }

    [ObservableProperty]
    [property: JsonPropertyName("watchedSummary")]
    private string? _watchedSummary;

    [JsonPropertyName("watchedNumbers")]
    public List<int>? WatchedNumbers { get; set; } = new();

    public void UpdateWatchedSummary()
    {
        if (WatchedNumbers == null || WatchedNumbers.Count == 0)
        {
            WatchedSummary = null;
            LastItem = null;
            OnPropertyChanged(nameof(SubDubText));
            return;
        }

        var sorted = WatchedNumbers.Distinct().OrderBy(n => n).ToList();
        var ranges = new List<string>();
        int start = sorted[0];
        int prev = sorted[0];

        for (int i = 1; i < sorted.Count; i++)
        {
            int cur = sorted[i];
            if (cur == prev + 1)
            {
                prev = cur;
            }
            else
            {
                ranges.Add(start == prev ? $"{start}" : $"{start}-{prev}");
                start = cur;
                prev = cur;
            }
        }
        ranges.Add(start == prev ? $"{start}" : $"{start}-{prev}");

        var prefix = Type.ToLower() == "manga" ? "Ch." : "Ep.";
        WatchedSummary = $"{prefix} {string.Join(", ", ranges)}";
        LastItem = $"{prefix} {sorted.Last()}";
        OnPropertyChanged(nameof(SubDubText));
    }

    // Caption under the poster
    public string SubDubText
    {
        get
        {
                        if (!string.IsNullOrWhiteSpace(CustomSubDubText))
            {
                return CustomSubDubText;
            }

            if (IsDownloaded)
            {
                var unit = Type.ToLower() == "manga" ? "chapters" : "episodes";
                var size = !string.IsNullOrWhiteSpace(DownloadSizeText) ? $" ({DownloadSizeText})" : "";
                return $"{Count} {unit} downloaded{size}";
            }

            if (!string.IsNullOrWhiteSpace(WatchedSummary))
            {
                var label = Type.ToLower() == "manga" ? "Read" : "Watched";
                var unit = Type.ToLower() == "manga" ? "ch." : "ep.";
                return $"{label}: {WatchedSummary} ({Count} {unit})";
            }

            if (!string.IsNullOrWhiteSpace(LastItem))
            {
                var label = Type.ToLower() == "manga" ? "Read" : "Watched";
                var unit = Type.ToLower() == "manga" ? "ch." : "ep.";
                return $"{label}: {LastItem} ({Count} {unit})";
            }

            var langBadge = !string.IsNullOrWhiteSpace(Language) ? Language.ToUpperInvariant() : "IT";
            return Audio?.ToLower() switch
            {
                "both" => $"Sub | Dub ({langBadge})",
                "ita" or "dub" => $"Dubbed (DUB {langBadge})",
                "subita" or "sub" => $"Subtitled (SUB {langBadge})",
                _ => Type.ToLower() == "manga" ? $"Manga ({langBadge})" : $"Sub | Dub ({langBadge})"
            };
        }
    }

    public bool HasImage => !string.IsNullOrWhiteSpace(Image);

    public string AudioBadge => IsDownloaded ? "OFFLINE" : Audio?.ToLower() switch
    {
        "ita" or "dub" => !string.IsNullOrWhiteSpace(Language) ? $"DUB {Language.ToUpperInvariant()}" : "DUB",
        "subita" or "sub" => !string.IsNullOrWhiteSpace(Language) ? $"SUB {Language.ToUpperInvariant()}" : "SUB",
        "both" => !string.IsNullOrWhiteSpace(Language) ? $"SUB | DUB ({Language.ToUpperInvariant()})" : "SUB | DUB",
        _ => !string.IsNullOrWhiteSpace(Language) ? $"{Type.ToUpper()} • {Language.ToUpperInvariant()}" : Type.ToUpper()
    };

    public string SourceLabel => !string.IsNullOrWhiteSpace(SourceName) ? SourceName : Source;

    public string TypeIcon => Type.ToLower() == "anime" ? "🎬" : "📖";
}
