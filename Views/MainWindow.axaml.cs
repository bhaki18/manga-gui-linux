using Avalonia.Controls;
using Avalonia.Interactivity;
using MangaGui.ViewModels;

namespace MangaGui.Views;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }

    private void OnSearchBoxGotFocus(object? sender, RoutedEventArgs e)
    {
        if (DataContext is MainViewModel vm)
        {
            vm.OpenSearchHistory();
        }
    }

    private void OnSearchBoxTapped(object? sender, RoutedEventArgs e)
    {
        if (DataContext is MainViewModel vm)
        {
            vm.OpenSearchHistory();
        }
    }

    private void OnSelectedNumberLostFocus(object? sender, RoutedEventArgs e)
    {
        if (DataContext is MainViewModel vm)
        {
            vm.ValidateSelectedNumberText();
        }
    }
}
