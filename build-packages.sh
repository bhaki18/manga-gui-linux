#!/usr/bin/env bash
set -euo pipefail

# Posizionati sempre nella root del progetto (dove risiede questo script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BUILD_LINUX=true
BUILD_ARCH=true
BUILD_DEB=true
BUILD_TAR=true
BUILD_WINDOWS=false
INSTALL_PKG=false
PUSH_GH_PAGES=false

for arg in "$@"; do
    case "$arg" in
        --linux-only)
            BUILD_LINUX=true
            BUILD_ARCH=true
            BUILD_DEB=true
            BUILD_TAR=true
            BUILD_WINDOWS=false
            ;;
        --windows-only)
            BUILD_LINUX=false
            BUILD_ARCH=false
            BUILD_DEB=false
            BUILD_TAR=false
            BUILD_WINDOWS=true
            ;;
        --arch-only)
            BUILD_LINUX=true
            BUILD_ARCH=true
            BUILD_DEB=false
            BUILD_TAR=false
            BUILD_WINDOWS=false
            ;;
        --deb-only)
            BUILD_LINUX=true
            BUILD_ARCH=false
            BUILD_DEB=true
            BUILD_TAR=false
            BUILD_WINDOWS=false
            ;;
        --tar-only)
            BUILD_LINUX=true
            BUILD_ARCH=false
            BUILD_DEB=false
            BUILD_TAR=true
            BUILD_WINDOWS=false
            ;;
        --no-arch)
            BUILD_ARCH=false
            ;;
        --no-deb)
            BUILD_DEB=false
            ;;
        --no-tar)
            BUILD_TAR=false
            ;;
        --no-win|--no-windows)
            BUILD_WINDOWS=false
            ;;
        --install|-i)
            INSTALL_PKG=true
            ;;
        --gh-pages|--push)
            PUSH_GH_PAGES=true
            ;;
        --help|-h)
            echo "Utilizzo: ./build-packages.sh [OPZIONI]"
            echo ""
            echo "Opzioni:"
            echo "  (nessuna)        Compila tutti i pacchetti (Arch, Debian .deb, Tarball Linux universale, Windows Setup)"
            echo "  --linux-only     Compila solo i formati Linux (Arch, Debian, Tarball universale)"
            echo "  --deb-only       Compila solo il pacchetto Debian / Ubuntu (.deb)"
            echo "  --arch-only      Compila solo il pacchetto Arch Linux (.pkg.tar.zst)"
            echo "  --tar-only       Compila solo l'archivio universale Linux (.tar.gz con installer)"
            echo "  --windows-only   Compila solo i binari Windows, l'installer Setup.exe e l'archivio .zip"
            echo "  --no-arch        Salta la creazione del pacchetto Arch (.pkg.tar.zst)"
            echo "  --no-deb         Salta la creazione del pacchetto Debian (.deb)"
            echo "  --no-tar         Salta la creazione dell'archivio universale Linux (.tar.gz)"
            echo "  --no-win         Salta la creazione dei pacchetti Windows"
            echo "  --install, -i    Installa automaticamente il pacchetto generato adatto alla distro corrente"
            echo "  --gh-pages       Pubblica automaticamente il pacchetto Arch sul branch gh-pages di bhaki18/manga-cli"
            echo "  --help, -h       Mostra questo messaggio"
            exit 0
            ;;
    esac
done

echo "============================================================"
echo "🚀 MANGA-GUI PACKAGE BUILDER"
echo "============================================================"

# 0. Sincronizza version.json con PKGBUILD
if [ -f "./PKGBUILD" ]; then
    PKG_VER=$(grep -E '^pkgver=' PKGBUILD | cut -d'=' -f2 | tr -d '[:space:]')
    PKG_REL=$(grep -E '^pkgrel=' PKGBUILD | cut -d'=' -f2 | tr -d '[:space:]')
    FULL_VER="${PKG_VER}-${PKG_REL}"
    TODAY=$(date +%Y-%m-%d)
    EXISTING_NOTES="Aggiornamento Manga GUI Linux v${FULL_VER}."
    if [ -f "./linux_version.json" ] && command -v node >/dev/null 2>&1; then
        EXISTING_NOTES=$(node -e 'try { const v = require("./linux_version.json"); console.log(v.notes || ""); } catch { console.log(""); }')
    fi
    [ -z "$EXISTING_NOTES" ] && EXISTING_NOTES="Aggiornamento Manga GUI Linux v${FULL_VER}."
    cat <<EOF > ./linux_version.json
{
  "version": "${FULL_VER}",
  "pkgver": "${PKG_VER}",
  "pkgrel": "${PKG_REL}",
  "releaseDate": "${TODAY}",
  "repoUrl": "https://github.com/bhaki18/manga-gui-linux.git",
  "rawVersionUrl": "https://raw.githubusercontent.com/bhaki18/manga-gui-linux/main/linux_version.json",
  "ghPagesVersionUrl": "https://raw.githubusercontent.com/bhaki18/manga-cli/gh-pages/linux_version.json",
  "archPackageUrl": "https://raw.githubusercontent.com/bhaki18/manga-cli/gh-pages/x86_64/manga-gui-bin-${FULL_VER}-x86_64.pkg.tar.zst",
  "debPackageUrl": "https://raw.githubusercontent.com/bhaki18/manga-cli/gh-pages/manga-gui_${FULL_VER}_amd64.deb",
  "linuxTarballUrl": "https://raw.githubusercontent.com/bhaki18/manga-cli/gh-pages/manga-gui-linux-x64.tar.gz",
  "notes": $(node -e 'console.log(JSON.stringify(process.argv[1]))' "$EXISTING_NOTES" 2>/dev/null || echo "\"$EXISTING_NOTES\"")
}
EOF
    echo "🔖 Versione corrente sincronizzata in linux_version.json: v${FULL_VER}"
fi

# 1. Verifica dipendenze di sistema e Node per la CLI
MISSING_SYS_DEPS=()
command -v git >/dev/null 2>&1 || MISSING_SYS_DEPS+=("git")
command -v curl >/dev/null 2>&1 || MISSING_SYS_DEPS+=("curl")
command -v node >/dev/null 2>&1 || MISSING_SYS_DEPS+=("nodejs")
command -v npm >/dev/null 2>&1 || MISSING_SYS_DEPS+=("npm")
command -v dotnet >/dev/null 2>&1 || MISSING_SYS_DEPS+=("dotnet-sdk")

if [ ${#MISSING_SYS_DEPS[@]} -gt 0 ]; then
    echo "⚠️ Dipendenze di compilazione mancanti (${MISSING_SYS_DEPS[*]}). Tentativo di installazione..."
    if command -v pacman >/dev/null 2>&1; then
        sudo pacman -S --needed --noconfirm "${MISSING_SYS_DEPS[@]}"
    fi
fi

if [ ! -d "./cli/node_modules" ]; then
    echo "📦 [1/5] Installazione dipendenze npm per cli/..."
    (cd ./cli && npm install)
else
    echo "✔ [1/5] Dipendenze CLI (node_modules) già presenti."
fi

# 2. Build Linux
if [ "$BUILD_LINUX" = true ]; then
    echo ""
    echo "🐧 [2/5] Compilazione binari Linux (linux-x64)..."
    dotnet publish MangaGui.csproj -c Release -r linux-x64 \
        --self-contained true \
        -p:PublishSingleFile=true \
        -o ./publish/linux-x64

    dotnet publish MangaGui.csproj -c Release -r linux-x64 \
        --self-contained false \
        -o ./publish/linux-x64-framework

    mkdir -p ./publish/linux-x64/cli/src
    cp -r ./cli/src/* ./publish/linux-x64/cli/src/
    if [ -d ./cli/node_modules ]; then
        cp -rf ./cli/node_modules ./publish/linux-x64/cli/
    fi
    cp -f ./cli/package*.json ./publish/linux-x64/cli/ 2>/dev/null || true
    if [ -f ./linux_version.json ]; then
        cp -f ./linux_version.json ./publish/linux-x64/linux_version.json
    fi
    if [ -f ./version.json ]; then
        cp -f ./version.json ./publish/linux-x64/version.json
    fi
    chmod +x ./publish/linux-x64/MangaGui
    echo "✔ Binari Linux aggiornati in ./publish/linux-x64/"
fi

# 3. Build Pacchetti Linux (Arch .pkg.tar.zst, Debian/Ubuntu .deb, Tarball Universale .tar.gz)
LATEST_ARCH_PKG=""
LATEST_DEB_PKG=""

if [ "$BUILD_ARCH" = true ]; then
    echo ""
    if command -v makepkg >/dev/null 2>&1; then
        echo "📦 [3a] Generazione pacchetto Arch Linux (.pkg.tar.zst)..."
        makepkg -f
        echo "✔ Pacchetto Arch generato con successo."
        LATEST_ARCH_PKG=$(ls -t manga-gui-bin-*.pkg.tar.zst 2>/dev/null | grep -v "\-debug\-" | head -n 1 || true)
    else
        echo "⚠️ [3a] 'makepkg' non trovato sul sistema, salto creazione .pkg.tar.zst."
    fi
fi

if [ "$BUILD_DEB" = true ]; then
    echo ""
    echo "📦 [3b] Generazione pacchetto Debian / Ubuntu (.deb)..."
    DEB_NAME="manga-gui_${FULL_VER}_amd64.deb"
    TMP_DEB_BASE=$(mktemp -d)
    TMP_DEB_ROOT="$TMP_DEB_BASE/root"
    mkdir -p "$TMP_DEB_ROOT/DEBIAN"
    mkdir -p "$TMP_DEB_ROOT/usr/lib/manga-gui"
    mkdir -p "$TMP_DEB_ROOT/usr/bin"
    mkdir -p "$TMP_DEB_ROOT/usr/share/applications"
    mkdir -p "$TMP_DEB_ROOT/usr/share/pixmaps"
    mkdir -p "$TMP_DEB_ROOT/usr/share/icons/hicolor/256x256/apps"

    cat << EOF > "$TMP_DEB_ROOT/DEBIAN/control"
Package: manga-gui
Version: ${PKG_VER}-${PKG_REL}
Section: video
Priority: optional
Architecture: amd64
Depends: nodejs, npm, mpv, git, curl
Maintainer: bhaki18 <https://github.com/bhaki18>
Description: Modern desktop client to stream anime and read manga with MPV integration and offline downloads
EOF

    cp -r ./publish/linux-x64/. "$TMP_DEB_ROOT/usr/lib/manga-gui/"
    cat << 'EOF' > "$TMP_DEB_ROOT/usr/bin/manga-gui"
#!/bin/bash
exec /usr/lib/manga-gui/MangaGui "$@"
EOF
    chmod +x "$TMP_DEB_ROOT/usr/bin/manga-gui"
    chmod +x "$TMP_DEB_ROOT/usr/lib/manga-gui/MangaGui"

    cp -f ./manga-gui.desktop "$TMP_DEB_ROOT/usr/share/applications/manga-gui.desktop"
    cp -f ./Assets/manga-gui.png "$TMP_DEB_ROOT/usr/share/pixmaps/manga-gui.png"
    cp -f ./Assets/manga-gui.png "$TMP_DEB_ROOT/usr/share/icons/hicolor/256x256/apps/manga-gui.png"

    if command -v dpkg-deb >/dev/null 2>&1; then
        dpkg-deb -b "$TMP_DEB_ROOT" "$DEB_NAME"
    else
        echo "2.0" > "$TMP_DEB_BASE/debian-binary"
        tar -czf "$TMP_DEB_BASE/control.tar.gz" -C "$TMP_DEB_ROOT/DEBIAN" .
        tar -czf "$TMP_DEB_BASE/data.tar.gz" --owner=0 --group=0 -C "$TMP_DEB_ROOT" --exclude="./DEBIAN" .
        ar rcs "$DEB_NAME" "$TMP_DEB_BASE/debian-binary" "$TMP_DEB_BASE/control.tar.gz" "$TMP_DEB_BASE/data.tar.gz"
    fi
    mkdir -p ./publish
    cp -f "$DEB_NAME" "./publish/$DEB_NAME"
    rm -rf "$TMP_DEB_BASE"
    LATEST_DEB_PKG="$DEB_NAME"
    echo "✔ Pacchetto Debian generato: ./publish/$DEB_NAME"
fi

if [ "$BUILD_TAR" = true ]; then
    echo ""
    echo "📦 [3c] Generazione Archivio Universale Linux (.tar.gz)..."
    TAR_NAME="manga-gui-${FULL_VER}-linux-x64.tar.gz"
    TMP_TAR_DIR="./publish/manga-gui-linux-x64"
    rm -rf "$TMP_TAR_DIR"
    mkdir -p "$TMP_TAR_DIR"
    cp -r ./publish/linux-x64/. "$TMP_TAR_DIR/"
    cp -f ./install.sh "$TMP_TAR_DIR/install.sh"
    cp -f ./uninstall.sh "$TMP_TAR_DIR/uninstall.sh"
    cp -f ./manga-gui.desktop "$TMP_TAR_DIR/manga-gui.desktop"
    mkdir -p "$TMP_TAR_DIR/Assets"
    cp -f ./Assets/manga-gui.png "$TMP_TAR_DIR/Assets/manga-gui.png"
    (
        cd ./publish
        tar -czf "$TAR_NAME" manga-gui-linux-x64
        cp -f "$TAR_NAME" manga-gui-linux-x64.tar.gz
    )
    cp -f "./publish/$TAR_NAME" "./$TAR_NAME"
    rm -rf "$TMP_TAR_DIR"
    echo "✔ Archivio Universale generato: ./publish/manga-gui-linux-x64.tar.gz"
fi

if [ "$INSTALL_PKG" = true ]; then
    echo ""
    echo "📥 Installazione del pacchetto sulla distribuzione..."
    if command -v pacman >/dev/null 2>&1 && [ -n "$LATEST_ARCH_PKG" ] && [ -f "$LATEST_ARCH_PKG" ]; then
        echo "📥 Installazione di $LATEST_ARCH_PKG con pacman..."
        sudo pacman -U --noconfirm "$LATEST_ARCH_PKG"
    elif command -v apt-get >/dev/null 2>&1 && [ -n "$LATEST_DEB_PKG" ] && [ -f "$LATEST_DEB_PKG" ]; then
        echo "📥 Installazione di $LATEST_DEB_PKG con apt..."
        sudo apt-get install -y "./$LATEST_DEB_PKG"
    elif [ -f "./install.sh" ]; then
        echo "📥 Esecuzione install.sh..."
        ./install.sh
    fi
fi

# 4. Build Windows Standalone + Installer + ZIP
if [ "$BUILD_WINDOWS" = true ]; then
    echo ""
    echo "🪟 [4/5] Compilazione eseguibile Windows (win-x64)..."
    dotnet publish MangaGui.csproj -c Release -r win-x64 \
        --self-contained true \
        -p:PublishSingleFile=true \
        -p:IncludeNativeLibrariesForSelfExtract=true \
        -p:EnableCompressionInSingleFile=true \
        -o ./publish/win-x64

    # Rimuovi file debug PDB che eccedono il limite GitHub di 100MB
    rm -f ./publish/win-x64/*.pdb

    mkdir -p ./publish/win-x64/cli/src
    cp -r ./cli/src/* ./publish/win-x64/cli/src/
    cp -f ./Assets/manga-gui.ico ./publish/win-x64/manga-gui.ico
    if [ -f ./version.json ]; then
        cp -f ./version.json ./publish/win-x64/version.json
    fi
    # Compila l'installer nativo MangaGui-Setup.exe con Go e icona incorporata
    if [ -f ./installer/main.go ] && command -v go >/dev/null 2>&1; then
        (
            cd ./installer
            [ -x /home/adp/go/bin/rsrc ] && /home/adp/go/bin/rsrc -ico ../Assets/manga-gui.ico -o rsrc.syso
            GOOS=windows GOARCH=amd64 go build -ldflags="-s -w -H=windowsgui" -o "$SCRIPT_DIR/publish/win-x64/MangaGui-Setup.exe"
        )
        echo "✔ Installer nativo MangaGui-Setup.exe generato con successo."
    fi

    # Rimuovi file di test e documentazione non necessari da node_modules per rimanere sotto il limite GitHub (100MB)
    rm -rf ./publish/win-x64/cli/node_modules/rxjs/dist/bundles \
           ./publish/win-x64/cli/node_modules/rxjs/dist/esm \
           ./publish/win-x64/cli/node_modules/lodash/fp \
           ./publish/win-x64/cli/node_modules/axios/dist \
           ./publish/win-x64/cli/node_modules/.package-lock.json 2>/dev/null || true
    find ./publish/win-x64/cli/node_modules -type d \( -name "test" -o -name "tests" -o -name "doc" -o -name "docs" -o -name "example" -o -name "examples" \) -exec rm -rf {} + 2>/dev/null || true
    find ./publish/win-x64/cli -type f \( -name "*.d.ts" -o -name "*.d.ts.map" -o -name "*.md" -o -name "*.markdown" -o -name "*.map" -o -name "LICENSE*" -o -name "CHANGELOG*" \) -delete 2>/dev/null || true

    # Rimuovi tutti i file .bat (l'installer offre solo eseguibili .exe)
    rm -f ./publish/win-x64/*.bat

    echo "✔ Eseguibile Windows aggiornato in ./publish/win-x64/MangaGui.exe"

    echo ""
    echo "🧰 [5/5] Creazione archivi Windows (.zip)..."

    # Rigenera publish/manga-gui-windows.zip e publish/manga-gui-win-x64.zip con cartella radice manga-gui-win-x64/
    rm -f ./publish/manga-gui-windows.zip ./publish/manga-gui-win-x64.zip
    TMP_WIN_DIR="./publish/manga-gui-win-x64"
    rm -rf "$TMP_WIN_DIR"
    ln -s win-x64 "$TMP_WIN_DIR"
    (
        cd ./publish
        zip -9 -r -q manga-gui-windows.zip manga-gui-win-x64 -x "*.pdb"
        cp -f manga-gui-windows.zip manga-gui-win-x64.zip
    )
    rm -f "$TMP_WIN_DIR"

    echo "✔ Archivi Windows aggiornati: ./publish/manga-gui-windows.zip e ./publish/manga-gui-win-x64.zip"
fi

if [ "$PUSH_GH_PAGES" = true ]; then
    echo ""
    ./publish-gh-pages.sh
fi

echo ""
echo "============================================================"
echo "✅ COMPILAZIONE PACCHETTI COMPLETATA CON SUCCESSO!"
echo "============================================================"

