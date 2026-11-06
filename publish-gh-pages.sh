#!/usr/bin/env bash
set -euo pipefail

# Posizionati sempre nella root del progetto
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

REPO_URL="git@github.com:bhaki18/manga-cli.git"
BRANCH="gh-pages"
TMP_DIR="$SCRIPT_DIR/.gh-pages-tmp"
DO_BUILD=false
DO_BUMP=false
PUB_ARCH=true
PUB_DEB=false
PUB_TAR=false
PUB_WIN=false
NEW_PKGVER=""
CUSTOM_NOTES=""
CUSTOM_MSG=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --build|-b)
            DO_BUILD=true
            shift
            ;;
        --bump)
            DO_BUMP=true
            DO_BUILD=true
            shift
            ;;
        --arch-only)
            PUB_ARCH=true
            PUB_DEB=false
            PUB_TAR=false
            shift
            ;;
        --deb-only)
            PUB_ARCH=false
            PUB_DEB=true
            PUB_TAR=false
            shift
            ;;
        --with-deb|--deb)
            PUB_DEB=true
            shift
            ;;
        --with-tar|--tar)
            PUB_TAR=true
            shift
            ;;
        --with-win|--win)
            PUB_WIN=true
            shift
            ;;
        --win-only)
            PUB_ARCH=false
            PUB_DEB=false
            PUB_TAR=false
            PUB_WIN=true
            shift
            ;;
        --all)
            PUB_ARCH=true
            PUB_DEB=true
            PUB_TAR=true
            PUB_WIN=true
            shift
            ;;
        --version|-v)
            NEW_PKGVER="${2:-}"
            DO_BUILD=true
            shift 2
            ;;
        --notes|-n)
            CUSTOM_NOTES="${2:-}"
            shift 2
            ;;
        -m|--message)
            CUSTOM_MSG="${2:-}"
            shift 2
            ;;
        --help|-h)
            echo "Utilizzo: ./publish-gh-pages.sh [OPZIONI]"
            echo ""
            echo "Pubblica i pacchetti selezionati sul branch 'gh-pages' di bhaki18/manga-cli.git in cartelle rigorosamente isolate."
            echo "I pacchetti Arch risiedono in x86_64/ con repo-add (nessun file Debian o tarball entra nel server Arch)."
            echo ""
            echo "Opzioni:"
            echo "  (nessuna)              Pubblica solo il pacchetto Arch (.pkg.tar.zst) in x86_64/ e version.json"
            echo "  --arch-only            Pubblica SOLO il pacchetto Arch in x86_64/"
            echo "  --deb-only             Pubblica SOLO il pacchetto Debian (.deb) nella cartella deb/"
            echo "  --with-deb, --deb      Includi anche il pacchetto Debian (.deb) nella cartella deb/"
            echo "  --with-tar, --tar      Includi anche l'archivio universale Linux (.tar.gz) nella cartella tar/"
            echo "  --all                  Pubblica tutti i pacchetti (Arch in x86_64/, Debian in deb/, Tarball in tar/)"
            echo "  --build, -b            Ricompila prima i pacchetti tramite ./build-packages.sh"
            echo "  --bump                 Incrementa automaticamente 'pkgrel' nel PKGBUILD, aggiorna version.json, ricompila e pubblica"
            echo "  --version, -v <ver>    Imposta una nuova 'pkgver' (es. 1.1.0) e resetta pkgrel=1, ricompila e pubblica"
            echo "  --notes, -n <testo>    Imposta le note di rilascio mostrate nel popup dell'Updater agli utenti"
            echo "  -m, --message <msg>    Usa un messaggio di commit personalizzato"
            echo "  --help, -h             Mostra questo messaggio"
            exit 0
            ;;
        *)
            echo "Opzione non riconosciuta: $1 (usa --help per la guida)"
            exit 1
            ;;
    esac
done

echo "============================================================"
echo "🌐 MANGA-GUI -> GH-PAGES PACMAN & UPDATER PUBLISHER"
echo "   Repo:   $REPO_URL (branch: $BRANCH)"
echo "============================================================"

# 1. Eventuale aggiornamento versione nel PKGBUILD e version.json
if [ -n "$NEW_PKGVER" ]; then
    sed -i "s/^pkgver=.*/pkgver=${NEW_PKGVER}/" PKGBUILD
    sed -i "s/^pkgrel=.*/pkgrel=1/" PKGBUILD
    echo "🔼 Impostata nuova versione nel PKGBUILD: pkgver=${NEW_PKGVER}, pkgrel=1"
elif [ "$DO_BUMP" = true ]; then
    CURRENT_REL=$(grep -E '^pkgrel=' PKGBUILD | cut -d'=' -f2 | tr -d '[:space:]')
    NEXT_REL=$((CURRENT_REL + 1))
    sed -i "s/^pkgrel=.*/pkgrel=${NEXT_REL}/" PKGBUILD
    echo "🔼 Incrementato pkgrel nel PKGBUILD: ${CURRENT_REL} -> ${NEXT_REL}"
fi

if [ -n "$CUSTOM_NOTES" ] && [ -f "./linux_version.json" ] && command -v node >/dev/null 2>&1; then
    node -e '
      const fs = require("fs");
      const v = JSON.parse(fs.readFileSync("./linux_version.json", "utf8"));
      v.notes = process.argv[1];
      fs.writeFileSync("./linux_version.json", JSON.stringify(v, null, 2) + "\n");
    ' "$CUSTOM_NOTES"
fi

# 2. Eventuale compilazione
if [ "$DO_BUILD" = true ]; then
    echo "🔨 Avvio compilazione pacchetto Linux/Arch..."
    ./build-packages.sh --linux-only
fi

# 3. Individua i pacchetti da pubblicare
LATEST_ARCH=$(ls -t manga-gui-bin-*.pkg.tar.zst 2>/dev/null | grep -v "\-debug\-" | head -n 1 || true)
LATEST_DEB=$(ls -t publish/manga-gui_*_amd64.deb manga-gui_*_amd64.deb 2>/dev/null | head -n 1 || true)
LATEST_TAR=$(ls -t publish/manga-gui-*-linux-x64.tar.gz publish/manga-gui-linux-x64.tar.gz 2>/dev/null | head -n 1 || true)
LATEST_WIN=$(ls -t publish/manga-gui-windows.zip publish/manga-gui-win-x64.zip 2>/dev/null | head -n 1 || true)

if [ "$PUB_ARCH" = true ] && { [ -z "$LATEST_ARCH" ] || [ ! -f "$LATEST_ARCH" ]; }; then
    echo "⚠️ Nessun pacchetto manga-gui-bin-*.pkg.tar.zst trovato. Avvio compilazione..."
    ./build-packages.sh --linux-only
    LATEST_ARCH=$(ls -t manga-gui-bin-*.pkg.tar.zst 2>/dev/null | grep -v "\-debug\-" | head -n 1 || true)
fi

PKG_VERSION="${NEW_PKGVER:-}"
if [ -z "$PKG_VERSION" ] && [ -n "$LATEST_ARCH" ]; then
    PKG_VERSION=$( sed -E 's/^manga-gui-bin-(.*)-x86_64\.pkg\.tar\.zst$/\1/' <<< "$LATEST_ARCH" )
fi
[ -z "$PKG_VERSION" ] && PKG_VERSION="latest"

echo "📦 Modalità di pubblicazione configurata:"
echo "   - Arch Linux (x86_64/): $PUB_ARCH ($LATEST_ARCH)"
echo "   - Debian/Ubuntu (deb/): $PUB_DEB ($LATEST_DEB)"
echo "   - Tarball universale (tar/): $PUB_TAR ($LATEST_TAR)"
echo "   - Windows ZIP (windows/): $PUB_WIN ($LATEST_WIN)"

# 4. Clona il branch gh-pages di bhaki18/manga-cli.git in una cartella temporanea locale
cleanup() {
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT

rm -rf "$TMP_DIR"
echo "📥 Clonazione branch '$BRANCH' da $REPO_URL..."
git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TMP_DIR"

STAGED_PATHS=()

# 5. Sezione Arch Linux (RIGOROSAMENTE ISOLATA IN x86_64/)
if [ "$PUB_ARCH" = true ] && [ -n "$LATEST_ARCH" ] && [ -f "$SCRIPT_DIR/$LATEST_ARCH" ]; then
    echo "🔄 [Arch] Aggiornamento pacchetto e database Pacman in x86_64/..."
    mkdir -p "$TMP_DIR/x86_64"
    rm -f "$TMP_DIR"/x86_64/manga-gui-bin-*.pkg.tar.zst
    cp -f "$SCRIPT_DIR/$LATEST_ARCH" "$TMP_DIR/x86_64/"
    if [ -f "$SCRIPT_DIR/linux_version.json" ]; then
        cp -f "$SCRIPT_DIR/linux_version.json" "$TMP_DIR/x86_64/linux_version.json"
    fi
    (
        cd "$TMP_DIR/x86_64"
        repo-add manga-cli.db.tar.gz "$LATEST_ARCH"
    )
    STAGED_PATHS+=("x86_64/")
fi

# 6. Sezione Debian / Ubuntu (ISOLATA NELLA CARTELLA deb/)
if [ "$PUB_DEB" = true ] && [ -n "$LATEST_DEB" ] && [ -f "$LATEST_DEB" ]; then
    echo "🔄 [Debian] Aggiornamento pacchetto .deb in deb/..."
    mkdir -p "$TMP_DIR/deb"
    rm -f "$TMP_DIR"/deb/*.deb
    cp -f "$LATEST_DEB" "$TMP_DIR/deb/"
    STAGED_PATHS+=("deb/")
fi

# 7. Sezione Tarball Universale Linux (ISOLATA NELLA CARTELLA tar/)
if [ "$PUB_TAR" = true ] && [ -n "$LATEST_TAR" ] && [ -f "$LATEST_TAR" ]; then
    echo "🔄 [Tarball] Aggiornamento archivio universale in tar/..."
    mkdir -p "$TMP_DIR/tar"
    rm -f "$TMP_DIR"/tar/*.tar.gz
    cp -f "$LATEST_TAR" "$TMP_DIR/tar/"
    STAGED_PATHS+=("tar/")
fi

# 8. Sezione Windows ZIP (ISOLATA NELLA CARTELLA windows/)
if [ "$PUB_WIN" = true ] && [ -n "$LATEST_WIN" ] && [ -f "$LATEST_WIN" ]; then
    echo "🔄 [Windows] Aggiornamento archivio Windows in windows/..."
    mkdir -p "$TMP_DIR/windows"
    rm -f "$TMP_DIR"/windows/*.zip
    cp -f "$LATEST_WIN" "$TMP_DIR/windows/manga-gui-windows.zip"
    cp -f "$LATEST_WIN" "$TMP_DIR/windows/manga-gui-win-x64.zip"
    STAGED_PATHS+=("windows/")
fi

# 9. Aggiorna linux_version.json nella radice di gh-pages
if [ -f "$SCRIPT_DIR/linux_version.json" ]; then
    cp -f "$SCRIPT_DIR/linux_version.json" "$TMP_DIR/linux_version.json"
    STAGED_PATHS+=("linux_version.json")
fi
if [ -f "$SCRIPT_DIR/version.json" ]; then
    cp -f "$SCRIPT_DIR/version.json" "$TMP_DIR/version.json"
    STAGED_PATHS+=("version.json")
fi

# 9. Commit e Push sul branch gh-pages
COMMIT_MSG="${CUSTOM_MSG:-Aggiornato manga-gui ($PKG_VERSION)}"

(
    cd "$TMP_DIR"
    for p in "${STAGED_PATHS[@]}"; do
        git add "$p"
    done
    if git diff --cached --quiet; then
        echo "ℹ️ Nessuna modifica rilevata rispetto al branch '$BRANCH' remoto."
        exit 0
    fi
    git commit -m "$COMMIT_MSG"
    echo "🚀 Push su $REPO_URL (branch: $BRANCH)..."
    git push origin "$BRANCH"
)

echo ""
echo "============================================================"
echo "✅ PUBBLICAZIONE SU GH-PAGES COMPLETATA CON SUCCESSO!"
echo "============================================================"
echo "============================================================"

