using Avalonia;
using System;

namespace MangaGui;

sealed class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        if (args.Length > 0)
        {
            var first = args[0].ToLowerInvariant();
            if (first == "--help" || first == "-h")
            {
                Console.WriteLine("Manga GUI v1.0.0 - Anime & Manga Streaming & Reader Desktop Client\n");
                Console.WriteLine("Usage: manga-gui [options] [query]\n");
                Console.WriteLine("Options:");
                Console.WriteLine("  -a, --anime              Open directly in Anime catalog tab");
                Console.WriteLine("  -m, --manga              Open directly in Manga catalog tab");
                Console.WriteLine("  -d, --downloaded         Open directly in Downloaded offline library tab");
                Console.WriteLine("  -H, --history            Open directly in History view");
                Console.WriteLine("  -q, --search <query>     Search immediately for anime or manga");
                Console.WriteLine("  -s, --source <source>    Filter by provider source (onepiecepower, mangadex, mangapill)");
                Console.WriteLine("  -v, --version            Display version information");
                Console.WriteLine("  -h, --help               Display this help message\n");
                Console.WriteLine("Examples:");
                Console.WriteLine("  manga-gui --manga");
                Console.WriteLine("  manga-gui -q \"One Piece\"");
                Console.WriteLine("  manga-gui --downloaded");
                return;
            }
            if (first == "--version" || first == "-v")
            {
                Console.WriteLine($"manga-gui v{MangaGui.Services.UpdateService.GetInstalledVersion()}");
                return;
            }
        }

        BuildAvaloniaApp().StartWithClassicDesktopLifetime(args);
    }

    public static AppBuilder BuildAvaloniaApp()
        => AppBuilder.Configure<App>()
            .UsePlatformDetect()
#if DEBUG
            .WithDeveloperTools()
#endif
            .WithInterFont()
            .LogToTrace();
}
