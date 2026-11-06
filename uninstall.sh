#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# 🗑️ Manga GUI - Uninstaller for Linux
# ============================================================

echo "============================================================"
echo "🗑️  MANGA-GUI UNINSTALLER"
echo "============================================================"

REMOVED_ANY=false

# 1. Rimuovi installazione di sistema se presente
if [ -d "/usr/lib/manga-gui" ] || [ -f "/usr/bin/manga-gui" ]; then
    echo "🔍 Trovata installazione di sistema (/usr/lib/manga-gui)..."
    run_pm() {
        if [ "$(id -u)" -eq 0 ]; then
            "$@"
        elif command -v sudo >/dev/null 2>&1; then
            sudo "$@"
        else
            echo "⚠️ Impossibile eseguire con sudo: $*"
        fi
    }
    run_pm rm -rf "/usr/lib/manga-gui"
    run_pm rm -f "/usr/bin/manga-gui"
    run_pm rm -f "/usr/share/applications/manga-gui.desktop"
    run_pm rm -f "/usr/share/pixmaps/manga-gui.png"
    run_pm rm -f "/usr/share/icons/hicolor/256x256/apps/manga-gui.png"
    REMOVED_ANY=true
    echo "✔ Installazione di sistema rimossa."
fi

# 2. Rimuovi installazione utente locale se presente
if [ -d "$HOME/.local/lib/manga-gui" ] || [ -f "$HOME/.local/bin/manga-gui" ]; then
    echo "🔍 Trovata installazione utente ($HOME/.local/lib/manga-gui)..."
    rm -rf "$HOME/.local/lib/manga-gui"
    rm -f "$HOME/.local/bin/manga-gui"
    rm -f "$HOME/.local/share/applications/manga-gui.desktop"
    rm -f "$HOME/.local/share/pixmaps/manga-gui.png"
    rm -f "$HOME/.local/share/icons/hicolor/256x256/apps/manga-gui.png"
    REMOVED_ANY=true
    echo "✔ Installazione utente rimossa."
fi

# 3. Aggiorna cache desktop
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database /usr/share/applications 2>/dev/null || true
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true

if [ "$REMOVED_ANY" = true ]; then
    echo ""
    echo "✅ Manga GUI è stato disinstallato con successo dal sistema."
else
    echo "ℹ️  Nessuna installazione attiva di Manga GUI trovata nei percorsi standard."
fi

