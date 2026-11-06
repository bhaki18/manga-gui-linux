#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# 🚀 Manga GUI - Universal Linux Installer
# Compatible with: Ubuntu, Debian, Linux Mint, Fedora, openSUSE,
#                  Arch Linux, Manjaro, Alpine, Void, etc.
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================================"
echo "🚀 MANGA-GUI UNIVERSAL LINUX INSTALLER"
echo "============================================================"

# 1. Determina la modalità di installazione (Sistema con root vs Utente locale)
if [ "$(id -u)" -eq 0 ]; then
    IS_ROOT=true
    INSTALL_DIR="/usr/lib/manga-gui"
    BIN_DIR="/usr/bin"
    DESKTOP_DIR="/usr/share/applications"
    ICON_DIR="/usr/share/icons/hicolor/256x256/apps"
    PIXMAPS_DIR="/usr/share/pixmaps"
    echo "ℹ️  Installazione a livello di sistema (/usr/lib/manga-gui)"
else
    IS_ROOT=false
    INSTALL_DIR="$HOME/.local/lib/manga-gui"
    BIN_DIR="$HOME/.local/bin"
    DESKTOP_DIR="$HOME/.local/share/applications"
    ICON_DIR="$HOME/.local/share/icons/hicolor/256x256/apps"
    PIXMAPS_DIR="$HOME/.local/share/pixmaps"
    echo "ℹ️  Installazione utente (~/.local/lib/manga-gui) [nessun sudo richiesto]"
fi

# 2. Controllo e installazione dipendenze di sistema (mpv, node, npm, git, curl)
MISSING_DEPS=()
command -v mpv >/dev/null 2>&1 || MISSING_DEPS+=("mpv")
command -v node >/dev/null 2>&1 || MISSING_DEPS+=("node")
command -v npm >/dev/null 2>&1 || MISSING_DEPS+=("npm")
command -v git >/dev/null 2>&1 || MISSING_DEPS+=("git")
command -v curl >/dev/null 2>&1 || MISSING_DEPS+=("curl")

run_pm() {
    if [ "$IS_ROOT" = true ]; then
        "$@"
    elif command -v sudo >/dev/null 2>&1; then
        sudo "$@"
    else
        echo "⚠️ Impossibile eseguire con privilegi amministrativi. Esegui il comando manualmente: $*"
    fi
}

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    echo "⚠️  Dipendenze mancanti rilevate: ${MISSING_DEPS[*]}"
    echo "📦 Tentativo di installazione automatica dipendenze..."
    if command -v apt-get >/dev/null 2>&1; then
        echo "➡ Rilevato gestore pacchetti APT (Debian/Ubuntu/Mint)..."
        run_pm apt-get update && run_pm apt-get install -y mpv nodejs npm git curl
    elif command -v dnf >/dev/null 2>&1; then
        echo "➡ Rilevato gestore pacchetti DNF (Fedora/RHEL)..."
        run_pm dnf install -y mpv nodejs npm git curl
    elif command -v pacman >/dev/null 2>&1; then
        echo "➡ Rilevato gestore pacchetti Pacman (Arch/Manjaro)..."
        run_pm pacman -S --needed --noconfirm mpv nodejs npm git curl
    elif command -v zypper >/dev/null 2>&1; then
        echo "➡ Rilevato gestore pacchetti Zypper (openSUSE)..."
        run_pm zypper install -y mpv nodejs npm git curl
    elif command -v apk >/dev/null 2>&1; then
        echo "➡ Rilevato gestore pacchetti APK (Alpine)..."
        run_pm apk add mpv nodejs npm git curl
    elif command -v xbps-install >/dev/null 2>&1; then
        echo "➡ Rilevato gestore pacchetti XBPS (Void)..."
        run_pm xbps-install -Sy mpv nodejs npm git curl
    else
        echo "⚠️ Gestore pacchetti non riconosciuto. Assicurati di installare manualmente: mpv, nodejs, npm, git, curl."
    fi
else
    echo "✔ Tutte le dipendenze richieste (mpv, node, npm, git, curl) sono presenti."
fi

# 3. Individuazione file sorgente / binari precompilati
SOURCE_DIR=""
if [ -f "$SCRIPT_DIR/MangaGui" ] && [ -d "$SCRIPT_DIR/cli" ]; then
    # Eseguito all'interno del bundle tar.gz precompilato
    SOURCE_DIR="$SCRIPT_DIR"
elif [ -f "$SCRIPT_DIR/publish/linux-x64/MangaGui" ]; then
    # Eseguito nella root del repository con build già pronta
    SOURCE_DIR="$SCRIPT_DIR/publish/linux-x64"
else
    # Necessita compilazione da sorgente
    echo "🔨 Compilazione di Manga GUI in corso (dotnet publish)..."
    if ! command -v dotnet >/dev/null 2>&1; then
        echo "❌ .NET SDK non trovato. Installalo oppure usa il pacchetto precompilato (manga-gui-linux-x64.tar.gz o .deb)."
        exit 1
    fi
    dotnet publish MangaGui.csproj -c Release -r linux-x64 --self-contained true -p:PublishSingleFile=true -o ./publish/linux-x64
    mkdir -p ./publish/linux-x64/cli/src
    cp -r ./cli/src/* ./publish/linux-x64/cli/src/
    if [ -d ./cli/node_modules ]; then
        cp -rf ./cli/node_modules ./publish/linux-x64/cli/
    fi
    if [ -f ./linux_version.json ]; then
        cp -f ./linux_version.json ./publish/linux-x64/linux_version.json
    fi
    if [ -f ./version.json ]; then
        cp -f ./version.json ./publish/linux-x64/version.json
    fi
    SOURCE_DIR="$SCRIPT_DIR/publish/linux-x64"
fi

# Verifica finale presenza file eseguibile
if [ ! -f "$SOURCE_DIR/MangaGui" ]; then
    echo "❌ Errore: file MangaGui non trovato in $SOURCE_DIR."
    exit 1
fi

# 4. Copia file applicazione
echo "📁 Copia dei file in $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cp -rf "$SOURCE_DIR/." "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/MangaGui"

# 5. Creazione script lanciatore in PATH
echo "🔗 Creazione collegamento eseguibile in $BIN_DIR/manga-gui..."
mkdir -p "$BIN_DIR"
cat << EOF > "$BIN_DIR/manga-gui"
#!/bin/bash
exec "$INSTALL_DIR/MangaGui" "\$@"
EOF
chmod +x "$BIN_DIR/manga-gui"

# 6. Installazione Icone
echo "🎨 Installazione icone..."
mkdir -p "$ICON_DIR" "$PIXMAPS_DIR"
ICON_SRC=""
if [ -f "$SCRIPT_DIR/Assets/manga-gui.png" ]; then
    ICON_SRC="$SCRIPT_DIR/Assets/manga-gui.png"
elif [ -f "$SOURCE_DIR/Assets/manga-gui.png" ]; then
    ICON_SRC="$SOURCE_DIR/Assets/manga-gui.png"
elif [ -f "$INSTALL_DIR/Assets/manga-gui.png" ]; then
    ICON_SRC="$INSTALL_DIR/Assets/manga-gui.png"
fi

if [ -n "$ICON_SRC" ] && [ -f "$ICON_SRC" ]; then
    cp -f "$ICON_SRC" "$ICON_DIR/manga-gui.png"
    cp -f "$ICON_SRC" "$PIXMAPS_DIR/manga-gui.png"
fi

# 7. Installazione Desktop Launcher (.desktop)
echo "🖥️  Installazione scorciatoia desktop ($DESKTOP_DIR/manga-gui.desktop)..."
mkdir -p "$DESKTOP_DIR"
DESKTOP_SRC=""
if [ -f "$SCRIPT_DIR/manga-gui.desktop" ]; then
    DESKTOP_SRC="$SCRIPT_DIR/manga-gui.desktop"
elif [ -f "$SOURCE_DIR/manga-gui.desktop" ]; then
    DESKTOP_SRC="$SOURCE_DIR/manga-gui.desktop"
fi

if [ -n "$DESKTOP_SRC" ] && [ -f "$DESKTOP_SRC" ]; then
    cp -f "$DESKTOP_SRC" "$DESKTOP_DIR/manga-gui.desktop"
else
    cat << EOF > "$DESKTOP_DIR/manga-gui.desktop"
[Desktop Entry]
Name=Manga GUI
Comment=Modern desktop client to stream anime and read manga with MPV integration and offline downloads
Exec=manga-gui %U
Icon=manga-gui
Terminal=false
Type=Application
Categories=AudioVideo;Video;Viewer;Graphics;
Keywords=anime;manga;stream;reader;
StartupNotify=true
EOF
fi
chmod +x "$DESKTOP_DIR/manga-gui.desktop"

# 8. Aggiorna database icone e menu desktop se disponibili
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t "$(dirname "$ICON_DIR")" 2>/dev/null || true

# Se installato come utente, verifica che ~/.local/bin sia nel PATH
if [ "$IS_ROOT" = false ]; then
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        echo ""
        echo "⚠️  Nota: '$HOME/.local/bin' potrebbe non essere nel tuo PATH attuale."
        echo "   Puoi aggiungerlo inserendo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' nel tuo ~/.bashrc o ~/.zshrc."
    fi
fi

echo ""
echo "============================================================"
echo "✅ MANGA GUI INSTALLATO CON SUCCESSO!"
echo "   Avvio da terminale:  manga-gui"
echo "   Avvio da interfaccia: Cerca 'Manga GUI' nel menu applicazioni"
echo "============================================================"

