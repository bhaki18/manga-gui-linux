using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using MangaGui.ViewModels;
using MangaGui.Views;

namespace MangaGui;

public partial class App : Application
{
    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (OperatingSystem.IsWindows())
        {
            Task.Run(() => EnsureDesktopShortcut());
        }

        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            desktop.MainWindow = new MainWindow
            {
                DataContext = new MainViewModel(desktop.Args),
            };
        }

        base.OnFrameworkInitializationCompleted();
    }

    public static void EnsureDesktopShortcut()
    {
        try
        {
            var desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
            if (string.IsNullOrEmpty(desktopDir) || !Directory.Exists(desktopDir)) return;

            var shortcutPath = Path.Combine(desktopDir, "Manga GUI.lnk");
            if (File.Exists(shortcutPath)) return;

            var currentExe = Environment.ProcessPath ?? Path.Combine(AppContext.BaseDirectory, "MangaGui.exe");
            if (!File.Exists(currentExe)) return;

            var workingDir = AppContext.BaseDirectory;
            var iconPath = Path.Combine(workingDir, "manga-gui.ico");
            if (!File.Exists(iconPath))
            {
                iconPath = Path.Combine(workingDir, "Assets", "manga-gui.ico");
            }
            if (!File.Exists(iconPath))
            {
                iconPath = currentExe;
            }

            Type? shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType != null)
            {
                dynamic shell = Activator.CreateInstance(shellType)!;
                dynamic shortcut = shell.CreateShortcut(shortcutPath);
                shortcut.TargetPath = currentExe;
                shortcut.WorkingDirectory = workingDir;
                shortcut.IconLocation = $"{iconPath},0";
                shortcut.Description = "Manga GUI - Downloader, Streamer e Reader";
                shortcut.Save();
            }
        }
        catch { }
    }
}
