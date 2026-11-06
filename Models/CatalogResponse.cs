using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace MangaGui.Models;

public class CatalogResponse
{
    [JsonPropertyName("manga")]
    public List<MediaItem> Manga { get; set; } = new();

    [JsonPropertyName("anime")]
    public List<MediaItem> Anime { get; set; } = new();
}
