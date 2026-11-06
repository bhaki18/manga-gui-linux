# 🚀 Guida Developer: Come Rilasciare un Aggiornamento di Manga GUI per Tutti gli Utenti

Questa guida descrive il funzionamento del sistema di **Auto-Updater** integrato in **Manga GUI** e i passaggi esatti che lo sviluppatore deve eseguire per pubblicare una nuova versione e notificare automaticamente tutti gli utenti che hanno l'applicazione installata.

---

## 🧠 1. Come Funziona l'Auto-Updater

All'avvio di **Manga GUI** (oppure cliccando sul pulsante **`🔄 Check Updates`** nella barra di stato in basso a destra), il servizio [`UpdateService`](file:///home/adp/Desktop/manga-gui/Services/UpdateService.cs) esegue i seguenti passaggi:

1. **Lettura della Versione Installata**:
   - Legge la versione locale da [`version.json`](file:///home/adp/Desktop/manga-gui/version.json) (incluso in `/usr/lib/manga-gui/version.json`, nella cartella dell'eseguibile o nella root del progetto) oppure da [`PKGBUILD`](file:///home/adp/Desktop/manga-gui/PKGBUILD) nel formato `<pkgver>-<pkgrel>` (es. `1.0.0-2`).
2. **Controllo della Versione Pubblicata Online**:
   - Interroga senza cache il manifesto [`version.json`](file:///home/adp/Desktop/manga-gui/version.json) pubblicato su:
     - `https://raw.githubusercontent.com/bhaki18/manga-cli/gh-pages/version.json` (branch `gh-pages` pubblicato da `./publish-gh-pages.sh`)
     - `https://raw.githubusercontent.com/bhaki18/manga-gui/main/version.json` (branch `main` del repository sorgente)
     - `https://raw.githubusercontent.com/bhaki18/manga-gui/main/PKGBUILD`
3. **Regola di Confronto (`IsRemoteNewer`)**:
   - **Se la versione online è uguale (`==`) o inferiore (`<`) a quella installata**: non viene mostrato alcun avviso automatico e l'app non si aggiorna.
   - **SOLO se la versione online è strettamente più recente (`>`) di quella installata** (es. locale `1.0.0-2` vs online `1.0.0-3` oppure `1.1.0-1`): compare il popup **`🚀 Nuovo Aggiornamento Disponibile!`** con le note di rilascio.
4. **Esecuzione dell'Aggiornamento (`⚡ Aggiorna Ora`)**:
   - **Step 1 — Dipendenze**: Verifica la presenza di `git`, `curl`, `node`, `npm`, `mpv` e `dotnet` (`dotnet-sdk`) e installa automaticamente eventuali pacchetti mancanti tramite il gestore di pacchetti di sistema (`pacman`, `apt`, `dnf`, `winget`).
   - **Step 2 — Download**: Scarica l'ultima versione del codice sorgente dal repository ufficiale (`https://github.com/bhaki18/manga-gui.git`).
   - **Step 3 — Compilazione**: Installa le dipendenze della CLI (`npm install`) e compila la nuova versione di `MangaGui` (`dotnet publish`) e/o genera il pacchetto `.pkg.tar.zst` (con fallback automatico al pacchetto precompilato su `gh-pages`).
   - **Step 4 — Installazione e Riavvio**: Installa l'aggiornamento e riavvia automaticamente la nuova versione di **Manga GUI**.

---

## ⚡ 2. Procedura Rapida per Rilasciare un Aggiornamento (Consigliata)

Dopo aver effettuato le tue modifiche al codice di `manga-gui` o `cli/`:

### Passo 1 — Pubblica il codice aggiornato sul repository sorgente (`manga-gui`)
Assicurati che il codice sorgente sia committato e pushato sul repository principale `bhaki18/manga-gui`, così quando l'Updater degli utenti scarica e compila il progetto troverà le tue ultime modifiche:

```bash
git status
git add .
git commit -m "Descrizione delle modifiche"
git push origin main
```

### Passo 2 — Incrementa la versione, compila e pubblica su GitHub Pages con un solo comando
Lo script `./publish-gh-pages.sh` aggiorna automaticamente [`PKGBUILD`](file:///home/adp/Desktop/manga-gui/PKGBUILD) e [`version.json`](file:///home/adp/Desktop/manga-gui/version.json), ricompila i pacchetti e carica sia il `.pkg.tar.zst` sia `version.json` sul branch `gh-pages`:

#### Opzione A: Incremento rapido di release (`pkgrel`, es. da `1.0.0-2` a `1.0.0-3`)
```bash
# Pubblica SOLO per Arch Linux (x86_64/)
./publish-gh-pages.sh --bump --notes "Aggiunte nuove funzionalità e correzioni bug."

# Oppure pubblica sia Arch che Debian (.deb) e Tarball universale:
./publish-gh-pages.sh --bump --all --notes "Aggiunte nuove funzionalità e correzioni bug."
```

#### Opzione B: Nuova versione maggiore/minore (`pkgver`, es. da `1.0.0-3` a `1.1.0-1`)
```bash
./publish-gh-pages.sh --version 1.1.0 --notes "Nuova versione 1.1.0 con nuovi filtri e miglioramenti."
```

#### Opzione C: Pubblicare solo un formato specifico senza toccare gli altri
```bash
# Pubblica SOLO su x86_64/ per Arch (Pacman):
./publish-gh-pages.sh --arch-only

# Pubblica SOLO nella cartella deb/ per Debian/Ubuntu (senza toccare il repo Pacman):
./publish-gh-pages.sh --deb-only
```

> [!NOTE]
> **Isolamento completo del repository Pacman**: Il server Pacman legge esclusivamente all'interno della cartella `x86_64/` registrata tramite `repo-add`. I pacchetti Debian (`deb/`) e i tarball universali (`tar/`) risiedono in cartelle separate e non possono in nessun modo interferire con Pacman né con l'AUR.

### Passo 3 — Committa anche `PKGBUILD` e `version.json` aggiornati sul repo `manga-gui`
Dopo aver lanciato `./publish-gh-pages.sh --bump` (o `--version`), i file locali `PKGBUILD` e `version.json` avranno il nuovo numero di versione. Sincronizzali anche sul branch principale di `manga-gui`:

```bash
git add PKGBUILD version.json
git commit -m "Bump version to $(grep -E '^pkgver=' PKGBUILD | cut -d= -f2)-$(grep -E '^pkgrel=' PKGBUILD | cut -d= -f2)"
git push origin main
```

---

## 🛠️ 3. Procedura Manuale Passo-Passo (Se non usi `--bump`)

Se preferisci modificare i file manualmente prima di compilare:

1. Apri [`PKGBUILD`](file:///home/adp/Desktop/manga-gui/PKGBUILD) e incrementa `pkgrel` (oppure `pkgver`):
   ```bash
   pkgver=1.0.0
   pkgrel=3
   ```
2. (Opzionale) Aggiorna il campo `"notes"` in [`version.json`](file:///home/adp/Desktop/manga-gui/version.json) con la descrizione delle novità.
3. Esegui il builder dei pacchetti (che sincronizzerà automaticamente `version` in `version.json` con `PKGBUILD`):
   ```bash
   ./build-packages.sh --install
   ```
4. Carica il pacchetto e `version.json` su `gh-pages`:
   ```bash
   ./publish-gh-pages.sh
   ```
5. Fai commit e push sul repository principale `bhaki18/manga-gui`.

---

## 🧪 4. Come Testare il Popup dell'Updater in Locale

Se vuoi verificare in qualsiasi momento come appare il popup di aggiornamento agli utenti:

1. Apri [`version.json`](file:///home/adp/Desktop/manga-gui/version.json) (o `bin/Debug/net10.0/version.json`) e imposta temporaneamente una versione inferiore a quella online, ad esempio:
   ```json
   "version": "0.9.0-1"
   ```
2. Avvia l'app con `dotnet run` (oppure clicca su **`🔄 Check Updates`** in basso a destra).
3. Poiché la versione online (`1.0.0-2` o superiore) è maggiore di `0.9.0-1`, vedrai comparire immediatamente il popup **`🚀 Nuovo Aggiornamento Disponibile!`**.

