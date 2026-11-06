# 🎬 Manga GUI - Modern Desktop Manga & Anime Hub

**Manga GUI** è un'interfaccia grafica desktop moderna, cross-platform e ultra-reattiva scritta in **C#** con **Avalonia UI** (v12) e pattern **MVVM**, progettata per offrire un'esperienza fluida e accattivante su **Linux** e **Windows** per guardare anime e leggere manga sia online che offline.

---

## 🐧 Installazione su Linux

Manga GUI supporta nativamente tutte le distribuzioni Linux grazie ai diversi formati di pacchetto e all'installer universale.

### 🟠 Debian, Ubuntu, Linux Mint, Pop!_OS (.deb)
Scarica o genera il pacchetto `.deb` e installalo con:
```bash
sudo apt update
sudo apt install ./publish/manga-gui_1.1.4-1_amd64.deb
```
oppure con `dpkg`:
```bash
sudo dpkg -i manga-gui_1.1.4-1_amd64.deb
sudo apt install -f
```

---

### 🔵 Arch Linux / Manjaro / EndeavourOS (.pkg.tar.zst)
Installa direttamente il pacchetto Pacman precompilato:
```bash
sudo pacman -U manga-gui-bin-1.1.4-1-x86_64.pkg.tar.zst
```
oppure compila dal sorgente con `makepkg`:
```bash
git clone https://github.com/bhaki18/manga-gui-linux.git
cd manga-gui-linux
makepkg -si
```

---

### 🟢 Fedora, openSUSE, Alpine, Void e Altre Distro (Installer Universale)
Scarica l'archivio universale `manga-gui-linux-x64.tar.gz` o clona il repository, quindi esegui:
```bash
# Installazione per tutto il sistema (consigliata)
sudo ./install.sh

# Oppure installazione utente locale senza permessi di root
./install.sh
```
L'installer rileva automaticamente il gestore pacchetti di sistema (`apt`, `dnf`, `zypper`, `pacman`, `apk`, `xbps`), installa le dipendenze (`mpv`, `node`, `npm`, `git`, `curl`), registra il comando `manga-gui` e aggiunge l'icona nel menu delle applicazioni.

Per disinstallare in qualsiasi momento:
```bash
./uninstall.sh
```

---

## ⌨️ Utilizzo da Riga di Comando (`manga-gui --FLAGS`)

Una volta installato, puoi lanciare `manga-gui` direttamente da terminale o specificare opzioni:

```bash
# Avvio normale (apre la schermata Anime predefinita)
manga-gui

# Apri direttamente la sezione Manga
manga-gui --manga
# oppure
manga-gui -m

# Apri direttamente la sezione Anime
manga-gui --anime
# oppure
manga-gui -a

# Apri direttamente i contenuti scaricati offline
manga-gui --downloaded
# oppure
manga-gui -d

# Cerca subito un titolo (anime o manga)
manga-gui -q "One Piece"
manga-gui --search "Berserk"

# Apri la cronologia degli episodi visti e capitoli letti
manga-gui -H
manga-gui --history

# Visualizza la guida ai comandi
manga-gui --help

# Visualizza la versione installata
manga-gui --version
```

---

## 🪟 Pacchetto e Build per Windows (Standalone `.exe`)

Per creare una versione standalone per Windows a 64-bit:
```bash
dotnet publish MangaGui.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o ./publish/win-x64
```
Troverai l'eseguibile autonomo pronto all'uso in:
`./publish/win-x64/MangaGui.exe` (con la cartella `cli/` inclusa accanto).

---

## ✨ Funzionalità

* 🎨 **Tema Scuro Nativo (Fluent Dark)**: Interfaccia raffinata con accenti arancioni e scuri, schede responsive e animazioni fluide.
* 🎬 **Anime Hub**: Navigazione e ricerca rapida nel catalogo con badge audio dinamici (`ITA`, `SUB ITA`, `ITA / SUB`).
* 📖 **Manga Hub**: Sfoglia migliaia di volumi con filtri lingua, generi e fallback intelligente multi-provider (One Piece Power, MangaDex, Mangapill).
* ⬇️ **Download Offline**: Scarica episodi anime e capitoli manga in locale (`~/.config/manga-gui/Downloaded/`) per visualizzarli anche senza connessione internet.
* ⚡ **Streaming e Lettura con MPV**: Riproduzione fluida a pieno schermo con gestione intelligente del referer per ogni provider e playlist automatica.
* 📜 **Cronologia e Segna come Visto/Letto**: Tracciamento dei capitoli ed episodi con intervalli compatti e menu di gestione con conferma.

---

## 🛠️ Tecnologie Utilizzate

* **Linguaggio**: C# (.NET 10)
* **UI Framework**: [Avalonia UI](https://avaloniaui.net/) (v12)
* **Architettura**: MVVM con `CommunityToolkit.Mvvm`
* **Player / Viewer**: [MPV](https://mpv.io/)
* **Motore dati**: Integrazione asincrona con `manga-cli`

---

## 📜 Licenza
Rilasciato sotto licenza [GPL-3.0-or-later](LICENSE).
