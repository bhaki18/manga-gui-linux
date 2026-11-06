using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace MangaGui.Models;

public class SourceItem
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("languages")]
    public List<string> Languages { get; set; } = new();

    [JsonPropertyName("baseUrl")]
    public string BaseUrl { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = "all";

    [JsonPropertyName("isBuiltIn")]
    public bool IsBuiltIn { get; set; }

    public string LanguagesString => string.Join(", ", Languages).ToUpper();
    public string StatusBadge => IsBuiltIn ? "Built-in" : "Community Plugin";
}
