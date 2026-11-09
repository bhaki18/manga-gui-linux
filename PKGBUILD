# Maintainer: bhaki18 <https://github.com/bhaki18>
pkgname=manga-gui-bin
pkgver=1.2.8
pkgrel=1
pkgdesc="Modern desktop client to stream anime and read manga with MPV integration and offline downloads"
arch=('x86_64')
url="https://github.com/bhaki18/manga-gui-linux"
license=('GPL-3.0-or-later')
depends=('nodejs' 'npm' 'mpv' 'git' 'curl')
optdepends=(
    'dotnet-sdk: per compilazione diretta degli aggiornamenti da sorgente'
    'base-devel: per generazione pacchetto Arch locale durante gli aggiornamenti'
)
provides=('manga-gui')
conflicts=('manga-gui')
options=(!strip)

package() {
    # 1. Install application files into /usr/lib/manga-gui
    install -d "$pkgdir/usr/lib/manga-gui"
    cp -r "$startdir/publish/linux-x64/." "$pkgdir/usr/lib/manga-gui/"
    if [ -f "$startdir/linux_version.json" ]; then
        cp -f "$startdir/linux_version.json" "$pkgdir/usr/lib/manga-gui/linux_version.json"
    fi
    chmod +x "$pkgdir/usr/lib/manga-gui/MangaGui"

    # 2. Install launcher script in /usr/bin/manga-gui
    install -d "$pkgdir/usr/bin"
    cat << 'EOF' > "$pkgdir/usr/bin/manga-gui"
#!/bin/bash
exec /usr/lib/manga-gui/MangaGui "$@"
EOF
    chmod +x "$pkgdir/usr/bin/manga-gui"

    # 3. Install desktop launcher and icons
    install -Dm644 "$startdir/manga-gui.desktop" "$pkgdir/usr/share/applications/manga-gui.desktop"
    install -Dm644 "$startdir/Assets/manga-gui.png" "$pkgdir/usr/share/pixmaps/manga-gui.png"
    install -Dm644 "$startdir/Assets/manga-gui.png" "$pkgdir/usr/share/icons/hicolor/256x256/apps/manga-gui.png"
}
