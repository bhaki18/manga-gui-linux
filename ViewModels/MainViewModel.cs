using System.Diagnostics;
using System.IO;
using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MangaGui.Models;
using MangaGui.Services;

namespace MangaGui.ViewModels;

public partial class MainViewModel : ViewModelBase
{
    private readonly MangaCliService _cliService;
    private readonly UpdateService _updateService = new();
    private UpdateCheckResult? _latestUpdateCheck;

    [ObservableProperty]
    private bool _isUpdateDialogVisible;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(UpdateConfirmButtonText))]
    private bool _isUpdating;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(AppVersionText))]
    private string _installedVersionText = $"v{UpdateService.GetInstalledVersion()}";

    [ObservableProperty]
    private string _remoteVersionText = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasUpdateNotes))]
    private string _updateNotesText = "";

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasUpdateProgress))]
    private string _updateProgressLog = "";

    public string AppVersionText => $"manga-gui {InstalledVersionText}";
    public bool HasUpdateNotes => !string.IsNullOrWhiteSpace(UpdateNotesText);
    public bool HasUpdateProgress => !string.IsNullOrWhiteSpace(UpdateProgressLog);
    public string UpdateConfirmButtonText => IsUpdating ? "⏳ Updating..." : "⚡ Update Now";

    [ObservableProperty]
    private string _activeTab = "Anime";

    [ObservableProperty]
    private string _searchQuery = string.Empty;

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private string _statusText = "Ready";

    [ObservableProperty]
    private bool _isDownloading;

    [ObservableProperty]
    private string _downloadProgressText = string.Empty;

    public string DownloadedTabColor => (ActiveTab == "Downloaded" || ActiveTab == "Downloads") ? "#FF640A" : "#D0D0D0";
    public bool IsDownloadedTabActive => ActiveTab == "Downloaded" || ActiveTab == "Downloads";
    public string DownloadIconText => IsDownloading ? "⏳" : "⬇";
    public string DownloadButtonText => IsDownloading ? (!string.IsNullOrWhiteSpace(DownloadProgressText) ? $"DOWNLOADING ({DownloadProgressText})" : "DOWNLOADING...") : "DOWNLOAD";


    [ObservableProperty]
    private MediaItem? _selectedItem;

    [ObservableProperty]
    private decimal _selectedNumber = 1;

    [ObservableProperty]
    private string _selectedNumberText = "1";

    [ObservableProperty]
    private decimal _maxNumber = 1;

    [ObservableProperty]
    private string _selectedSource = "All sources";

    [ObservableProperty]
    private string _selectedLanguage = "All languages";

    [ObservableProperty]
    private string _selectedGenre = "All genres";

    [ObservableProperty]
    private string _selectedAudioFilter = "All Audio (Sub & Dub)";

    private bool _isResettingFilters;
    private bool _isUpdatingAudioFilters;

    [ObservableProperty]
    private bool _isSearchHistoryOpen;

    public ObservableCollection<string> SearchHistory { get; } = new();
    public bool HasSearchHistory => SearchHistory.Count > 0;
    public bool ShowSearchHistoryChips => HasSearchHistory && (ActiveTab == "Anime" || ActiveTab == "Manga");
    public bool IsAnimeTabActive => ActiveTab == "Anime";
    public bool IsBrowseTabActive => ActiveTab == "Anime" || ActiveTab == "Manga";
    public bool HasActiveFilters =>
        SelectedGenre != "All genres" ||
        (ActiveTab == "Anime" && MangaCliService.ResolveAudioCode(SelectedAudioFilter) != "all") ||
        SelectedSource != "All sources";

    public string QuickSubButtonText => GetAudioOptionsForLanguage(SelectedLanguage).quickSubText;
    public string QuickDubButtonText => GetAudioOptionsForLanguage(SelectedLanguage).quickDubText;
    public string QuickSubButtonBorder => MangaCliService.ResolveAudioCode(SelectedAudioFilter) == "sub" ? "#FF640A" : "#2C2D35";
    public string QuickDubButtonBorder => MangaCliService.ResolveAudioCode(SelectedAudioFilter) == "dub" ? "#FF640A" : "#2C2D35";

    [ObservableProperty]
    private bool _isConfirmDialogVisible;

    [ObservableProperty]
    private string _confirmDialogTitle = "";

    [ObservableProperty]
    private string _confirmDialogMessage = "";

    private Func<Task>? _pendingConfirmAsyncAction;

    public string ActionButtonText => SelectedItem?.IsDownloaded == true
        ? (SelectedItem?.Type.ToLower() == "manga" ? "📖 READ OFFLINE" : "▶ PLAY OFFLINE")
        : (SelectedItem?.Type.ToLower() == "manga" ? "📖 READ NOW" : "▶ START WATCHING");
    public string NumberLabel => SelectedItem?.Type.ToLower() == "manga" ? "Chapter:" : "Episode:";

    public bool IsCurrentNumberWatched => SelectedItem != null && SelectedItem.WatchedNumbers != null && SelectedItem.WatchedNumbers.Contains((int)SelectedNumber);
    public string WatchedStatusBadge => IsCurrentNumberWatched ? (SelectedItem?.Type.ToLower() == "manga" ? "✔ READ" : "✔ WATCHED") : "";
    public string UnmarkButtonText => SelectedItem?.Type.ToLower() == "manga" ? "✕ Unmark as read" : "✕ Unmark as watched";

    public string AnimeTabColor => ActiveTab == "Anime" ? "#FF640A" : "#D0D0D0";
    public string MangaTabColor => ActiveTab == "Manga" ? "#FF640A" : "#D0D0D0";
    public string HistoryTabColor => (ActiveTab == "History" || ActiveTab == "Cronologia") ? "#FF640A" : "#D0D0D0";
    public bool IsHistoryTabActive => ActiveTab == "History" || ActiveTab == "Cronologia";

    public string PageHeaderTitle => ActiveTab switch
    {
        "Downloaded" or "Downloads" => "Downloaded",
        "History" or "Cronologia" => "History",
        "Anime" => "Most Popular Anime",
        "Manga" => "Most Popular Manga",
        _ => ActiveTab
    };

    public string PageSubHeader
    {
        get
        {
            if (ActiveTab == "Downloaded" || ActiveTab == "Downloads")
                return "Installed Anime & Manga (.config/manga-gui/Downloaded)";
            if (ActiveTab == "History" || ActiveTab == "Cronologia")
                return "Recently Watched & Read";

            var parts = new System.Collections.Generic.List<string> { "Popular" };
            if (!string.IsNullOrWhiteSpace(SelectedGenre) && SelectedGenre != "All genres")
                parts.Add($"Genre: {SelectedGenre}");
            if (ActiveTab == "Anime" && MangaCliService.ResolveAudioCode(SelectedAudioFilter) != "all")
                parts.Add($"Audio: {SelectedAudioFilter}");
            if (!string.IsNullOrWhiteSpace(SelectedSource) && SelectedSource != "All sources")
                parts.Add($"Source: {MangaCliService.FormatSourceName(SelectedSource)}");
            return string.Join("  •  ", parts);
        }
    }

    public ObservableCollection<MediaItem> Items { get; } = new();

    public ObservableCollection<string> Sources { get; } = new()
    {
        "All sources",
        "animeworld",
        "animesaturn",
        "animeunity",
        "onepiecepower",
        "onepiecepower-anime",
        "mangaworld",
        "mangadex",
        "mangapill"
    };

    public ObservableCollection<string> Genres { get; } = new()
    {
        "All genres",
        "Shounen",
        "Seinen",
        "Isekai",
        "Action",
        "Adventure",
        "Fantasy",
        "Comedy",
        "Romance",
        "Drama",
        "Sci-Fi",
        "Horror",
        "Mystery",
        "Supernatural",
        "Slice of Life",
        "Sports",
        "Psychological",
        "Thriller",
        "Ecchi",
        "Mecha",
        "Martial Arts",
        "School",
        "Historical",
        "Shoujo"
    };

    public ObservableCollection<string> QuickGenres { get; } = new()
    {
        "All genres",
        "Shounen",
        "Isekai",
        "Seinen",
        "Action",
        "Fantasy",
        "Comedy",
        "Romance",
        "Horror",
        "Mystery",
        "Sports",
        "Psychological",
        "Slice of Life",
        "Sci-Fi"
    };

    public ObservableCollection<string> AudioFilters { get; } = new()
    {
        "All Audio (Sub & Dub)",
        "Sub (Subtitled)",
        "Dub (Dubbed)"
    };

    private static (string allOption, string subOption, string dubOption, string quickSubText, string quickDubText) GetAudioOptionsForLanguage(string? selectedLanguage)
    {
        var code = MangaCliService.ResolveLanguageCode(selectedLanguage);
        if (string.IsNullOrWhiteSpace(code) || code == "all")
        {
            return (
                "All Audio (Sub & Dub)",
                "Sub (Subtitled)",
                "Dub (Dubbed)",
                "💬 Sub Only",
                "🎙️ Dub Only"
            );
        }

        var upper = code.ToUpperInvariant();
        var (flag, subDesc, dubDesc) = code switch
        {
            "it" => ("🇮🇹", "Subtitled", "Dubbed"),
            "en" => ("🇬🇧", "Subtitled", "Dubbed"),
            "es" => ("🇪🇸", "Subtitulado", "Doblado"),
            "fr" => ("🇫🇷", "Sous-titré", "Doublé"),
            "de" => ("🇩🇪", "Untertitelt", "Synchronisiert"),
            "pt-br" => ("🇧🇷", "Legendado", "Dublado"),
            "ru" => ("🇷🇺", "Субтитры", "Дубляж"),
            "ja" => ("🇯🇵", "Subtitled", "Original / Dub"),
            "ar" => ("🇸🇦", "مترجم", "مدبلج"),
            "pl" => ("🇵🇱", "Napisy", "Dubbing"),
            "tr" => ("🇹🇷", "Altyazılı", "Dublaj"),
            "id" => ("🇮🇩", "Subtitle", "Dubbing"),
            "vi" => ("🇻🇳", "Vietsub", "Thuyết minh"),
            "ko" => ("🇰🇷", "자막", "더빙"),
            "zh" => ("🇨🇳", "字幕", "配音"),
            _ => ("🌐", "Subtitled", "Dubbed")
        };

        return (
            $"All Audio (Sub & Dub - {upper})",
            $"Sub {upper} ({subDesc})",
            $"Dub {upper} ({dubDesc})",
            $"{flag} Sub Only ({upper})",
            $"{flag} Dub Only ({upper})"
        );
    }

    private void UpdateAudioFiltersForLanguage(string? lang)
    {
        var currentAudioCode = MangaCliService.ResolveAudioCode(SelectedAudioFilter);
        var (allOpt, subOpt, dubOpt, _, _) = GetAudioOptionsForLanguage(lang);

        _isUpdatingAudioFilters = true;
        try
        {
            AudioFilters.Clear();
            AudioFilters.Add(allOpt);
            AudioFilters.Add(subOpt);
            AudioFilters.Add(dubOpt);

            SelectedAudioFilter = currentAudioCode switch
            {
                "sub" => subOpt,
                "dub" => dubOpt,
                _ => allOpt
            };
        }
        finally
        {
            _isUpdatingAudioFilters = false;
        }

        OnPropertyChanged(nameof(QuickSubButtonText));
        OnPropertyChanged(nameof(QuickDubButtonText));
        OnPropertyChanged(nameof(QuickSubButtonBorder));
        OnPropertyChanged(nameof(QuickDubButtonBorder));
        OnPropertyChanged(nameof(HasActiveFilters));
        OnPropertyChanged(nameof(PageSubHeader));
    }

    public ObservableCollection<string> Languages { get; } = new()
    {
        "All languages",
        "Italiano (IT)",
        "English (EN)",
        "Español (ES)",
        "Français (FR)",
        "Deutsch (DE)",
        "Português (PT-BR)",
        "Русский (RU)",
        "日本語 (JA)",
        "العربية (AR)",
        "Polski (PL)",
        "Türkçe (TR)",
        "Indonesian (ID)",
        "Tiếng Việt (VI)",
        "한국어 (KO)",
        "中文 (ZH)"
    };

    private bool _isUpdatingSources;

    private void UpdateSourcesForTab(string tab)
    {
        string[] desired = tab == "Manga"
            ? new[] { "All sources", "onepiecepower", "mangaworld", "mangadex", "mangapill" }
            : new[] { "All sources", "animeworld", "animesaturn", "animeunity", "onepiecepower", "onepiecepower-anime" };

        _isUpdatingSources = true;
        try
        {
            var current = SelectedSource;
            Sources.Clear();
            foreach (var s in desired)
            {
                Sources.Add(s);
            }

            if (!string.IsNullOrWhiteSpace(current) && desired.Contains(current))
            {
                SelectedSource = current;
            }
            else
            {
                SelectedSource = "All sources";
            }
        }
        finally
        {
            _isUpdatingSources = false;
        }
    }

    public MainViewModel(string[]? args = null)
    {
        _cliService = new MangaCliService();
        ParseCommandLineArgs(args);
        UpdateSourcesForTab(ActiveTab);
        UpdateAudioFiltersForLanguage(SelectedLanguage);
        _ = LoadSearchHistoryAsync();
        _ = LoadInitialCatalogAsync();
        _ = CheckUpdatesOnStartupAsync();
    }

    private async Task CheckUpdatesOnStartupAsync()
    {
        await Task.Delay(1200);
        await CheckUpdatesInternalAsync(isManual: false);
    }

    [RelayCommand]
    public async Task CheckUpdatesAsync()
    {
        await CheckUpdatesInternalAsync(isManual: true);
    }

    private async Task CheckUpdatesInternalAsync(bool isManual)
    {
        try
        {
            if (isManual)
            {
                StatusText = "Controllo aggiornamenti online in corso...";
            }

            var check = await _updateService.CheckForUpdateAsync();
            _latestUpdateCheck = check;
            InstalledVersionText = $"v{check.InstalledVersion}";

            if (check.CheckSucceeded && check.HasUpdate)
            {
                RemoteVersionText = $"v{check.RemoteVersion}";
                UpdateNotesText = check.ReleaseNotes;
                UpdateProgressLog = string.Empty;
                IsUpdateDialogVisible = true;
                StatusText = $"🚀 Nuova versione disponibile: v{check.RemoteVersion} (installata: v{check.InstalledVersion})";
            }
            else if (isManual)
            {
                if (check.CheckSucceeded)
                {
                    StatusText = $"✔ Nessun aggiornamento necessario: hai già l'ultima versione installata (v{check.InstalledVersion}).";
                }
                else
                {
                    StatusText = $"⚠️ {check.ErrorMessage ?? "Impossibile verificare gli aggiornamenti online."}";
                }
            }
        }
        catch (Exception ex)
        {
            if (isManual)
            {
                StatusText = $"Errore controllo aggiornamenti: {ex.Message}";
            }
        }
    }

    [RelayCommand]
    public void DismissUpdateDialog()
    {
        if (IsUpdating) return;
        IsUpdateDialogVisible = false;
    }

    [RelayCommand]
    public async Task StartUpdateAsync()
    {
        if (IsUpdating || _latestUpdateCheck == null) return;
        IsUpdating = true;
        UpdateProgressLog = "Starting automatic update...";
        StatusText = $"Updating to v{_latestUpdateCheck.RemoteVersion} in progress...";

        try
        {
            var (success, msg) = await _updateService.PerformUpdateAsync(_latestUpdateCheck, line =>
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                {
                    UpdateProgressLog = line;
                    StatusText = line;
                });
            });

            if (!success)
            {
                UpdateProgressLog = $"❌ {msg}";
                StatusText = $"❌ {msg}";
            }
        }
        catch (Exception ex)
        {
            UpdateProgressLog = $"❌ Errore: {ex.Message}";
            StatusText = $"❌ Errore aggiornamento: {ex.Message}";
        }
        finally
        {
            IsUpdating = false;
        }
    }

    private void RefreshSearchHistoryCollection(System.Collections.Generic.List<string> list)
    {
        SearchHistory.Clear();
        foreach (var item in list.Take(5))
        {
            SearchHistory.Add(item);
        }
        OnPropertyChanged(nameof(HasSearchHistory));
        OnPropertyChanged(nameof(ShowSearchHistoryChips));
        if (SearchHistory.Count == 0)
        {
            IsSearchHistoryOpen = false;
        }
    }

    private async Task LoadSearchHistoryAsync()
    {
        var list = await _cliService.GetSearchHistoryAsync();
        RefreshSearchHistoryCollection(list);
    }

    public void OpenSearchHistory()
    {
        if (SearchHistory.Count > 0)
        {
            IsSearchHistoryOpen = true;
        }
    }

    [RelayCommand]
    public void CloseSearchHistory()
    {
        IsSearchHistoryOpen = false;
    }

    [RelayCommand]
    public void ToggleSearchHistory()
    {
        if (SearchHistory.Count == 0)
        {
            IsSearchHistoryOpen = false;
            return;
        }
        IsSearchHistoryOpen = !IsSearchHistoryOpen;
    }

    [RelayCommand]
    public async Task SelectSearchHistoryAsync(string? query)
    {
        if (string.IsNullOrWhiteSpace(query)) return;
        IsSearchHistoryOpen = false;
        SearchQuery = query;
        if (ActiveTab != "Anime" && ActiveTab != "Manga")
        {
            ActiveTab = "Anime";
        }
        await SearchAsync();
    }

    [RelayCommand]
    public async Task RemoveSearchHistoryItemAsync(string? query)
    {
        if (string.IsNullOrWhiteSpace(query)) return;
        var updated = await _cliService.RemoveSearchHistoryItemAsync(query);
        RefreshSearchHistoryCollection(updated);
    }

    [RelayCommand]
    public async Task ClearSearchHistoryAsync()
    {
        await _cliService.ClearSearchHistoryAsync();
        RefreshSearchHistoryCollection(new System.Collections.Generic.List<string>());
    }

    private void ParseCommandLineArgs(string[]? args)
    {
        if (args == null || args.Length == 0) return;

        for (int i = 0; i < args.Length; i++)
        {
            var arg = args[i].ToLowerInvariant();
            if (arg == "--anime" || arg == "-a")
            {
                ActiveTab = "Anime";
            }
            else if (arg == "--manga" || arg == "-m")
            {
                ActiveTab = "Manga";
            }
            else if (arg == "--downloaded" || arg == "--downloads" || arg == "-d")
            {
                ActiveTab = "Downloaded";
            }
            else if (arg == "--history" || arg == "-h" || arg == "-H")
            {
                ActiveTab = "History";
            }
            else if ((arg == "--search" || arg == "-q") && i + 1 < args.Length)
            {
                SearchQuery = args[++i];
            }
            else if (arg == "--source" && i + 1 < args.Length)
            {
                SelectedSource = args[++i];
            }
            else if ((arg == "--lang" || arg == "-l") && i + 1 < args.Length)
            {
                var code = MangaCliService.ResolveLanguageCode(args[++i]);
                var matched = Languages.FirstOrDefault(l => MangaCliService.ResolveLanguageCode(l) == code);
                SelectedLanguage = matched ?? code;
            }
            else if (!arg.StartsWith("-") && string.IsNullOrWhiteSpace(SearchQuery))
            {
                SearchQuery = args[i];
            }
        }
    }

    partial void OnSelectedSourceChanged(string value)
    {
        OnPropertyChanged(nameof(HasActiveFilters));
        OnPropertyChanged(nameof(PageSubHeader));
        if (_isUpdatingSources || _isResettingFilters || string.IsNullOrWhiteSpace(value)) return;
        if (ActiveTab == "Anime" || ActiveTab == "Manga")
        {
            if (!string.IsNullOrWhiteSpace(SearchQuery))
            {
                _ = SearchAsync();
            }
            else
            {
                _ = LoadCatalogAsync();
            }
        }
    }

    partial void OnSelectedLanguageChanged(string value)
    {
        UpdateAudioFiltersForLanguage(value);
        if (_isResettingFilters || string.IsNullOrWhiteSpace(value)) return;
        if (ActiveTab == "Anime" || ActiveTab == "Manga")
        {
            if (!string.IsNullOrWhiteSpace(SearchQuery))
            {
                _ = SearchAsync();
            }
            else
            {
                _ = LoadCatalogAsync();
            }
        }
    }

    partial void OnSelectedGenreChanged(string value)
    {
        OnPropertyChanged(nameof(HasActiveFilters));
        OnPropertyChanged(nameof(PageSubHeader));
        if (_isResettingFilters || string.IsNullOrWhiteSpace(value)) return;
        if (ActiveTab == "Anime" || ActiveTab == "Manga")
        {
            if (!string.IsNullOrWhiteSpace(SearchQuery))
            {
                _ = SearchAsync();
            }
            else
            {
                _ = LoadCatalogAsync();
            }
        }
    }

    partial void OnSelectedAudioFilterChanged(string value)
    {
        OnPropertyChanged(nameof(HasActiveFilters));
        OnPropertyChanged(nameof(PageSubHeader));
        OnPropertyChanged(nameof(QuickSubButtonBorder));
        OnPropertyChanged(nameof(QuickDubButtonBorder));
        if (_isUpdatingAudioFilters || _isResettingFilters || string.IsNullOrWhiteSpace(value)) return;
        if (ActiveTab == "Anime")
        {
            if (!string.IsNullOrWhiteSpace(SearchQuery))
            {
                _ = SearchAsync();
            }
            else
            {
                _ = LoadCatalogAsync();
            }
        }
    }

    [RelayCommand]
    public void SelectQuickGenre(string? genre)
    {
        if (string.IsNullOrWhiteSpace(genre)) return;
        SelectedGenre = genre;
    }

    [RelayCommand]
    public void SelectQuickAudio(string? audio)
    {
        if (string.IsNullOrWhiteSpace(audio)) return;
        var targetCode = MangaCliService.ResolveAudioCode(audio);
        var currentCode = MangaCliService.ResolveAudioCode(SelectedAudioFilter);
        var (allOpt, subOpt, dubOpt, _, _) = GetAudioOptionsForLanguage(SelectedLanguage);

        if (targetCode == currentCode && targetCode != "all")
        {
            SelectedAudioFilter = allOpt;
            return;
        }

        SelectedAudioFilter = targetCode switch
        {
            "sub" => subOpt,
            "dub" => dubOpt,
            _ => allOpt
        };
    }

    [RelayCommand]
    public async Task ResetFiltersAsync()
    {
        _isResettingFilters = true;
        try
        {
            SelectedGenre = "All genres";
            SelectedAudioFilter = GetAudioOptionsForLanguage(SelectedLanguage).allOption;
            SelectedSource = "All sources";
            SearchQuery = string.Empty;
        }
        finally
        {
            _isResettingFilters = false;
        }
        OnPropertyChanged(nameof(HasActiveFilters));
        OnPropertyChanged(nameof(PageSubHeader));
        OnPropertyChanged(nameof(QuickSubButtonBorder));
        OnPropertyChanged(nameof(QuickDubButtonBorder));
        await LoadCatalogAsync();
    }

    partial void OnActiveTabChanged(string value)
    {
        if (value == "Anime" || value == "Manga")
        {
            UpdateSourcesForTab(value);
        }
        OnPropertyChanged(nameof(AnimeTabColor));
        OnPropertyChanged(nameof(MangaTabColor));
        OnPropertyChanged(nameof(DownloadedTabColor));
        OnPropertyChanged(nameof(HistoryTabColor));
        OnPropertyChanged(nameof(PageHeaderTitle));
        OnPropertyChanged(nameof(PageSubHeader));
        OnPropertyChanged(nameof(IsHistoryTabActive));
        OnPropertyChanged(nameof(IsDownloadedTabActive));
        OnPropertyChanged(nameof(IsAnimeTabActive));
        OnPropertyChanged(nameof(IsBrowseTabActive));
        OnPropertyChanged(nameof(HasActiveFilters));
        OnPropertyChanged(nameof(ShowSearchHistoryChips));
    }

    partial void OnSelectedItemChanged(MediaItem? value)
    {
        if (value != null && value.Type.ToLower() == "anime")
        {
            if (value.HasDub && !value.HasSub)
            {
                SelectedItemAudio = "dub";
            }
            else if (value.HasSub && !value.HasDub)
            {
                SelectedItemAudio = "sub";
            }
            else if (SelectedItemAudio == "dub" && !value.HasDub)
            {
                SelectedItemAudio = "sub";
            }
            else if (SelectedItemAudio == "sub" && !value.HasSub)
            {
                SelectedItemAudio = "dub";
            }
        }

        OnPropertyChanged(nameof(SelectedItemAudio));
        OnPropertyChanged(nameof(CanSelectSub));
        OnPropertyChanged(nameof(CanSelectDub));
        OnPropertyChanged(nameof(IsAudioSelectorVisible));
        OnPropertyChanged(nameof(SubOptionBackground));
        OnPropertyChanged(nameof(DubOptionBackground));
        OnPropertyChanged(nameof(SubOptionForeground));
        OnPropertyChanged(nameof(DubOptionForeground));
        OnPropertyChanged(nameof(ActionButtonText));
        OnPropertyChanged(nameof(NumberLabel));
        OnPropertyChanged(nameof(IsCurrentNumberWatched));
        OnPropertyChanged(nameof(WatchedStatusBadge));
        OnPropertyChanged(nameof(UnmarkButtonText));
    }

    [ObservableProperty]
    private string _selectedItemAudio = "sub";

    public bool CanSelectSub => SelectedItem?.Type?.ToLower() == "anime" && SelectedItem.HasSub;
    public bool CanSelectDub => SelectedItem?.Type?.ToLower() == "anime" && SelectedItem.HasDub;
    public bool IsAudioSelectorVisible => SelectedItem?.Type?.ToLower() == "anime" && !SelectedItem.IsDownloaded;

    public string SubOptionBackground => SelectedItemAudio == "sub" ? "#0066CC" : "#1E1F26";
    public string DubOptionBackground => SelectedItemAudio == "dub" ? "#1B8A44" : "#1E1F26";
    public string SubOptionForeground => SelectedItemAudio == "sub" ? "#FFFFFF" : (CanSelectSub ? "#CCCCCC" : "#555555");
    public string DubOptionForeground => SelectedItemAudio == "dub" ? "#FFFFFF" : (CanSelectDub ? "#CCCCCC" : "#555555");

    [RelayCommand]
    public void ChooseSubAudio()
    {
        if (CanSelectSub)
        {
            SelectedItemAudio = "sub";
            OnPropertyChanged(nameof(SelectedItemAudio));
            OnPropertyChanged(nameof(SubOptionBackground));
            OnPropertyChanged(nameof(DubOptionBackground));
            OnPropertyChanged(nameof(SubOptionForeground));
            OnPropertyChanged(nameof(DubOptionForeground));
        }
    }

    [RelayCommand]
    public void ChooseDubAudio()
    {
        if (CanSelectDub)
        {
            SelectedItemAudio = "dub";
            OnPropertyChanged(nameof(SelectedItemAudio));
            OnPropertyChanged(nameof(SubOptionBackground));
            OnPropertyChanged(nameof(DubOptionBackground));
            OnPropertyChanged(nameof(SubOptionForeground));
            OnPropertyChanged(nameof(DubOptionForeground));
        }
    }

    [RelayCommand]
    public void DecrementNumber()
    {
        if (SelectedNumber > 1)
        {
            SelectedNumber--;
        }
    }

    [RelayCommand]
    public void IncrementNumber()
    {
        if (SelectedNumber < MaxNumber)
        {
            SelectedNumber++;
        }
    }

    [RelayCommand]
    public void JumpToMaxNumber()
    {
        if (MaxNumber >= 1)
        {
            SelectedNumber = MaxNumber;
        }
    }

    [RelayCommand]
    public void JumpToFirstNumber()
    {
        SelectedNumber = 1;
    }

    partial void OnSelectedNumberChanged(decimal value)
    {
        var str = ((int)value).ToString();
        if (SelectedNumberText != str)
        {
            SelectedNumberText = str;
        }
        OnPropertyChanged(nameof(IsCurrentNumberWatched));
        OnPropertyChanged(nameof(WatchedStatusBadge));
    }

    partial void OnSelectedNumberTextChanged(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return;
        }

        if (int.TryParse(value, out var n))
        {
            var max = Math.Max(1, (int)MaxNumber);
            var clamped = Math.Clamp(n, 1, max);

            if ((int)SelectedNumber != clamped)
            {
                SelectedNumber = clamped;
            }

            if (n != clamped)
            {
                SelectedNumberText = clamped.ToString();
            }
        }
        else
        {
            SelectedNumberText = ((int)SelectedNumber).ToString();
        }
    }

    public void ValidateSelectedNumberText()
    {
        if (string.IsNullOrWhiteSpace(SelectedNumberText) || !int.TryParse(SelectedNumberText, out var n))
        {
            SelectedNumberText = ((int)SelectedNumber).ToString();
        }
        else
        {
            var max = Math.Max(1, (int)MaxNumber);
            var clamped = Math.Clamp(n, 1, max);
            SelectedNumber = clamped;
            SelectedNumberText = clamped.ToString();
        }
    }

    partial void OnMaxNumberChanged(decimal value)
    {
        if (value >= 1 && SelectedNumber > value)
        {
            SelectedNumber = value;
        }
    }

    [RelayCommand]
    public async Task ShowDownloadedAsync()
    {
        ActiveTab = "Downloaded";
        SelectedItem = null;
        SearchQuery = string.Empty;
        IsLoading = true;
        StatusText = "Scanning installed files in ~/.config/manga-gui/Downloaded...";
        Items.Clear();

        try
        {
            var downloaded = await _cliService.GetDownloadedItemsAsync();
            foreach (var item in downloaded)
            {
                Items.Add(item);
            }
            StatusText = Items.Count == 0 
                ? "No downloaded anime or manga found in ~/.config/manga-gui/Downloaded." 
                : $"Downloaded: {Items.Count} titles installed offline.";
        }
        catch (Exception ex)
        {
            StatusText = $"Downloads error: {ex.Message}";
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    public void OpenDownloadsFolder()
    {
        try
        {
            var baseDir = MangaCliService.GetBaseDownloadDirectory();
            if (!Directory.Exists(baseDir)) Directory.CreateDirectory(baseDir);
            Process.Start(new ProcessStartInfo("xdg-open", baseDir) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            StatusText = $"Could not open folder: {ex.Message}";
        }
    }

    [RelayCommand]
    public async Task DownloadCurrentItemAsync()
    {
        if (SelectedItem == null || IsDownloading) return;
        var num = (int)SelectedNumber;
        var title = SelectedItem.Title;
        var unit = SelectedItem.Type.ToLower() == "manga" ? "Chapter" : "Episode";

        IsDownloading = true;
        OnPropertyChanged(nameof(IsDownloading));
        OnPropertyChanged(nameof(DownloadIconText));
        OnPropertyChanged(nameof(DownloadButtonText));
        StatusText = $"Downloading {title} ({unit} {num})...";

        try
        {
            DownloadProgressText = string.Empty;
            var audioToUse = SelectedItem.Type.ToLower() == "anime" ? SelectedItemAudio : SelectedAudioFilter;
            var (success, msg, dest) = await _cliService.DownloadMediaAsync(SelectedItem, num, (string prog) =>
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                {
                    DownloadProgressText = prog;
                    StatusText = $"Downloading {title} ({unit} {num}): {prog}";
                    OnPropertyChanged(nameof(DownloadButtonText));
                });
            }, SelectedLanguage, audioToUse);
            StatusText = msg;
            if (success && (ActiveTab == "Downloaded" || ActiveTab == "Downloads"))
            {
                await ShowDownloadedAsync();
            }
        }
        catch (Exception ex)
        {
            StatusText = $"Download error: {ex.Message}";
        }
        finally
        {
            IsDownloading = false;
            DownloadProgressText = string.Empty;
            OnPropertyChanged(nameof(IsDownloading));
            OnPropertyChanged(nameof(DownloadIconText));
            OnPropertyChanged(nameof(DownloadButtonText));
        }
    }

    [RelayCommand]
    public async Task ShowHistoryAsync()
    {
        ActiveTab = "History";
        SelectedItem = null;
        SearchQuery = string.Empty;
        IsLoading = true;
        StatusText = "Loading watch and read history...";
        Items.Clear();

        try
        {
            var history = await _cliService.GetHistoryAsync();
            foreach (var item in history)
            {
                Items.Add(item);
            }
            StatusText = $"History: {Items.Count} titles watched / read";
        }
        catch (Exception ex)
        {
            StatusText = $"History error: {ex.Message}";
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    public async Task SwitchTab(string tabName)
    {
        if (ActiveTab == tabName) return;
        ActiveTab = tabName;
        SelectedItem = null;
        SearchQuery = string.Empty;

        if (tabName == "Downloaded" || tabName == "Downloads")
        {
            await ShowDownloadedAsync();
        }
        else if (tabName == "History" || tabName == "Cronologia")
        {
            await ShowHistoryAsync();
        }
        else
        {
            await LoadCatalogAsync();
        }
    }

    [RelayCommand]
    public async Task SearchAsync()
    {
        IsSearchHistoryOpen = false;
        if (string.IsNullOrWhiteSpace(SearchQuery))
        {
            await LoadCatalogAsync();
            return;
        }

        if (ActiveTab != "Anime" && ActiveTab != "Manga")
        {
            ActiveTab = "Anime";
        }

        var updatedHistory = await _cliService.AddSearchHistoryAsync(SearchQuery);
        RefreshSearchHistoryCollection(updatedHistory);

        IsLoading = true;
        StatusText = $"Searching for \"{SearchQuery}\"...";
        Items.Clear();

        try
        {
            var src = SelectedSource == "All sources" || SelectedSource == "Tutte le fonti" || SelectedSource == "all" ? null : SelectedSource;
            var lang = SelectedLanguage;
            var genre = SelectedGenre;
            var audio = SelectedAudioFilter;
            if (ActiveTab == "Anime")
            {
                var results = await _cliService.SearchAnimeAsync(SearchQuery, src, lang, genre, audio);
                foreach (var item in results) Items.Add(item);
                StatusText = $"Found {Items.Count} anime for \"{SearchQuery}\" ({SelectedLanguage})";
            }
            else
            {
                var results = await _cliService.SearchMangaAsync(SearchQuery, src, lang, genre);
                foreach (var item in results) Items.Add(item);
                StatusText = $"Found {Items.Count} manga for \"{SearchQuery}\" ({SelectedLanguage})";
            }
        }
        catch (Exception ex)
        {
            StatusText = $"Search error: {ex.Message}";
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    public async Task LoadCatalogAsync()
    {
        IsLoading = true;
        StatusText = $"Loading {ActiveTab} catalog ({SelectedLanguage})...";
        Items.Clear();

        try
        {
            var src = SelectedSource == "All sources" || SelectedSource == "Tutte le fonti" || SelectedSource == "all" ? null : SelectedSource;
            var lang = SelectedLanguage;
            var genre = SelectedGenre;
            var audio = SelectedAudioFilter;
            if (ActiveTab == "Anime")
            {
                var catalog = await _cliService.GetAnimeCatalogAsync(src, lang, genre, audio);
                foreach (var item in catalog) Items.Add(item);
                StatusText = $"Anime Catalog: {Items.Count} titles ready ({SelectedLanguage})";
            }
            else
            {
                var catalog = await _cliService.GetMangaCatalogAsync(src, lang, genre);
                foreach (var item in catalog) Items.Add(item);
                StatusText = $"Manga Catalog: {Items.Count} titles ready ({SelectedLanguage})";
            }
        }
        catch (Exception ex)
        {
            StatusText = $"Catalog error: {ex.Message}";
        }
        finally
        {
            IsLoading = false;
        }
    }

    [RelayCommand]
    public void SelectItem(MediaItem item)
    {
        SelectedItem = item;
        var highestWatched = (item.WatchedNumbers != null && item.WatchedNumbers.Count > 0)
            ? item.WatchedNumbers.Max()
            : 1;

        MaxNumber = Math.Max(highestWatched, item.Count > 0 ? item.Count : 1);
        SelectedNumber = highestWatched;

        _ = LoadMediaDetailsAsync(item);
    }

    private async Task LoadMediaDetailsAsync(MediaItem item)
    {
        try
        {
            var total = await _cliService.GetMediaDetailsAsync(item, SelectedLanguage);
            if (SelectedItem == item && total > 0)
            {
                MaxNumber = (decimal)total;
                if (SelectedNumber > MaxNumber)
                {
                    SelectedNumber = MaxNumber;
                }
            }
        }
        catch {}
    }

    [RelayCommand]
    public void CloseDetails()
    {
        SelectedItem = null;
    }

    [RelayCommand]
    public async Task UnmarkCurrentNumberAsync()
    {
        if (SelectedItem == null) return;
        var num = (int)SelectedNumber;
        var title = SelectedItem.Title;
        var unit = SelectedItem.Type.ToLower() == "manga" ? "Chapter" : "Episode";

        StatusText = $"Removing {unit} {num} from {title} history...";
        var success = await _cliService.UnmarkItemAsync(SelectedItem, num);
        if (success)
        {
            if (SelectedItem.WatchedNumbers != null)
            {
                SelectedItem.WatchedNumbers.Remove(num);
                SelectedItem.Count = SelectedItem.WatchedNumbers.Count;
                SelectedItem.UpdateWatchedSummary();
            }

            OnPropertyChanged(nameof(IsCurrentNumberWatched));
            OnPropertyChanged(nameof(WatchedStatusBadge));
            StatusText = $"✔ {unit} {num} removed from \"{title}\" history.";

            if ((ActiveTab == "History" || ActiveTab == "Cronologia") && SelectedItem.Count == 0)
            {
                Items.Remove(SelectedItem);
                SelectedItem = null;
            }
        }
        else
        {
            StatusText = $"Failed to remove {unit} {num} from history.";
        }
    }

    [RelayCommand]
    public void RequestClearAllHistory()
    {
        ConfirmDialogTitle = "Clear All History?";
        ConfirmDialogMessage = "Are you sure you want to permanently delete the ENTIRE history of watched anime and read manga? This action cannot be undone.";
        _pendingConfirmAsyncAction = async () =>
        {
            StatusText = "Clearing entire history...";
            await _cliService.ClearAllHistoryAsync();
            Items.Clear();
            SelectedItem = null;
            StatusText = "✔ All history has been successfully cleared.";
        };
        IsConfirmDialogVisible = true;
    }

    [RelayCommand]
    public void RequestRemoveItem()
    {
        if (SelectedItem == null) return;
        var title = SelectedItem.Title;

        if (SelectedItem.IsDownloaded)
        {
            ConfirmDialogTitle = "Delete Downloaded Title?";
            ConfirmDialogMessage = $"Are you sure you want to delete \"{title}\" and all its downloaded files from disk?";
            _pendingConfirmAsyncAction = async () =>
            {
                StatusText = $"Deleting \"{title}\" from disk...";
                var ok = await _cliService.DeleteDownloadedItemAsync(SelectedItem);
                if (ok)
                {
                    Items.Remove(SelectedItem);
                    SelectedItem = null;
                    StatusText = $"✔ Deleted \"{title}\" from disk.";
                }
                else
                {
                    StatusText = $"Could not delete \"{title}\".";
                }
            };
            IsConfirmDialogVisible = true;
            return;
        }
        ConfirmDialogTitle = "Remove from History?";
        ConfirmDialogMessage = $"Are you sure you want to remove \"{title}\" from history?";
        _pendingConfirmAsyncAction = async () =>
        {
            await RemoveItemFromHistoryAsync();
        };
        IsConfirmDialogVisible = true;
    }

    [RelayCommand]
    public async Task ConfirmDialogActionAsync()
    {
        IsConfirmDialogVisible = false;
        if (_pendingConfirmAsyncAction != null)
        {
            var action = _pendingConfirmAsyncAction;
            _pendingConfirmAsyncAction = null;
            await action();
        }
    }

    [RelayCommand]
    public void CancelDialogAction()
    {
        IsConfirmDialogVisible = false;
        _pendingConfirmAsyncAction = null;
    }

    [RelayCommand]
    public async Task RemoveItemFromHistoryAsync()
    {
        if (SelectedItem == null) return;
        var title = SelectedItem.Title;
        StatusText = $"Removing \"{title}\" from history...";
        var success = await _cliService.RemoveFromHistoryAsync(SelectedItem);
        if (success)
        {
            if (ActiveTab == "History" || ActiveTab == "Cronologia")
            {
                Items.Remove(SelectedItem);
            }
            SelectedItem = null;
            StatusText = $"✔ \"{title}\" completely removed from history.";
        }
        else
        {
            StatusText = $"Failed to remove \"{title}\" from history.";
        }
    }

    [RelayCommand]
    public async Task PlayOrReadAsync()
    {
        if (SelectedItem == null) return;
        var num = (int)SelectedNumber;

        if (SelectedItem.IsDownloaded && !string.IsNullOrWhiteSpace(SelectedItem.LocalPath))
        {
            try
            {
                if (SelectedItem.Type.ToLower() == "anime")
                {
                    var videoFiles = Directory.GetFiles(SelectedItem.LocalPath, "*.*", SearchOption.AllDirectories)
                        .Where(f => f.EndsWith(".mp4", StringComparison.OrdinalIgnoreCase) || 
                                    f.EndsWith(".mkv", StringComparison.OrdinalIgnoreCase) ||
                                    f.EndsWith(".webm", StringComparison.OrdinalIgnoreCase))
                        .ToList();

                    var targetFile = videoFiles.FirstOrDefault(f => f.Contains($"{num}")) ?? videoFiles.FirstOrDefault();
                    if (targetFile != null)
                    {
                        var launched = MangaCliService.LaunchVideo(targetFile, $"{SelectedItem.Title} (Episode {num} - Offline)");
                        if (launched)
                        {
                            StatusText = $"Playing offline: {SelectedItem.Title} ({Path.GetFileName(targetFile)})";
                        }
                        else
                        {
                            StatusText = $"Could not launch video player for: {Path.GetFileName(targetFile)}";
                        }
                        return;
                    }
                }
                else
                {
                    var subDirs = Directory.GetDirectories(SelectedItem.LocalPath);
                    var targetDir = subDirs.FirstOrDefault(d => d.Contains($"{num}")) ?? subDirs.FirstOrDefault() ?? SelectedItem.LocalPath;
                    var launched = MangaCliService.LaunchMangaReader(targetDir, $"{SelectedItem.Title} (Chapter {num} - Offline)");
                    if (launched)
                    {
                        StatusText = $"Reading offline: {SelectedItem.Title} ({Path.GetFileName(targetDir)})";
                    }
                    else
                    {
                        StatusText = $"Could not open manga reader for: {Path.GetFileName(targetDir)}";
                    }
                    return;
                }
            }
            catch (Exception ex)
            {
                StatusText = $"Offline playback error: {ex.Message}";
                return;
            }
        }
        if (SelectedItem.Type.ToLower() == "anime")
        {
            StatusText = $"Loading stream for {SelectedItem.Title} (Episode {num})...";
            var (success, msg) = await _cliService.PlayStreamAsync(SelectedItem, num, SelectedItemAudio);
            StatusText = msg;
        }
        else
        {
            StatusText = $"Loading pages for {SelectedItem.Title} (Chapter {num})...";
            var (success, msg) = await _cliService.ReadMangaAsync(SelectedItem, num, SelectedLanguage);
            StatusText = msg;
        }
    }

    private async Task LoadInitialCatalogAsync()
    {
        if (!string.IsNullOrWhiteSpace(SearchQuery))
        {
            await SearchAsync();
        }
        else if (ActiveTab == "Downloaded")
        {
            await ShowDownloadedAsync();
        }
        else if (ActiveTab == "History")
        {
            await ShowHistoryAsync();
        }
        else
        {
            await LoadCatalogAsync();
        }
    }
}
