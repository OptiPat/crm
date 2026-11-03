# Audit macOS — CRM W.Y.S (version consolidée)

Audit en lecture seule du dépôt `D:\crm` (v0.5.66), 3 novembre 2026. Aucun code modifié.
Ce document **fusionne et remplace** les trois passes : audit initial, `CONTRE_AUDIT_MACOS.md` et `AUDIT_MACOS_WEBKIT.md`. Les erreurs de l'audit initial y sont corrigées (voir § 8).

**Méthode** : lecture du code de l'app, puis vérification dans le **code source des versions exactes** des dépendances verrouillées dans `Cargo.lock` (cache Cargo local) : `tauri 2.11.2`, `tao 0.35.3`, `wry 0.55.1`, `muda 0.19.2`, `tauri-plugin-updater 2.10.1`, `tauri-plugin-notification 2.3.3`, `tauri-plugin-biometry 0.2.8`, `tauri-plugin-fs 2.5.1`. Les chemins notés `registry:` renvoient à `~/.cargo/registry/src/index.crates.io-*/`.

**Fiabilité**
- **[Vérifié]** : le défaut se lit dans le code de l'app ou dans le code source de la dépendance.
- **[Supposé]** : comportement macOS déduit, non testable sans Mac.

**Gravité**
- **Bloquant** : fonctionnalité inutilisable, app qui paraît plantée, ou risque de sécurité.
- **Dégradé** : fonctionne mal ou en mode réduit.
- **Cosmétique** : libellés, conventions Mac.

---

## 0. État des corrections (3 novembre 2026, non commitées, non testées sur Mac)

| Point | Statut | Fichiers |
|---|---|---|
| **B5** Écran blanc Safari < 16.4 | ✅ Corrigé | `src/lib/souscription-cif/cif-pdf-download.ts` (regex sans lookbehind + test), `src-tauri/tauri.conf.json` (`minimumSystemVersion: "11.0"`), `vite.config.ts` (`build.target` figé), `public/webkit-version-check.js` + `index.html` (message « Mise à jour nécessaire ») |
| **B1** Exports sans fichier | ✅ Corrigé | Nouveau helper `src/lib/export/download-file.ts` (+ test) : sur Mac, écriture dans Téléchargements avec toast « Ouvrir » ; Windows inchangé. Branché dans `csv-export.ts`, `familles-export.ts`, `foyers-export.ts`, `partenaires-export.ts`, `prescripteurs-export.ts`, `compta-pdf-export.ts`, `synthese-patrimoniale-pdf-export.ts` |
| **B3** ⌘Q sans fermeture propre | ✅ Corrigé (au mieux) | `src-tauri/src/main.rs` : `RunEvent::Exit` appelle `close_database`. La sortie ne peut plus être annulée à ce stade ; un menu « Quitter » personnalisé reste possible |
| **B4** Dock sans effet | ✅ Corrigé | `src-tauri/src/main.rs` : `RunEvent::Reopen` → `focus_main_window` (compilé seulement sur macOS : à valider par la CI macOS) |
| **B2** Impression notes / Coach / UC | ✅ Corrigé (PDF direct, comme le CIF) | Nouveau `src/lib/pdf/element-pdf-capture.ts` (+ test) : capture du portail et découpage A4 au milieu des espaces entre blocs (pas de ligne coupée). Branché sur Mac dans `use-note-print-export.ts`, `useFundWatchlistCoachPrintExport.ts`, `useUcComparatorPrintExport.ts` ; CSS de capture dans `styles/globals.css`. Windows : panneau d'impression inchangé. Vérifié dans Chromium (note de 3 pages) ; reste à voir dans WebKit. Limite connue : un titre peut se retrouver seul en bas de page |
| Le reste (D*, C*) | À faire | — |

Vérification : `tsc`, ESLint, 2 821 tests Vitest et 1 235 + 7 tests Rust passent. `npm run verify` s'arrête sur `npm audit` (22 vulnérabilités de dépendances déjà présentes, sans lien avec ces changements).

---

## 1. Résumé

Sous Windows, l'interface tourne dans le moteur de Chrome (WebView2), et Tauri s'y comporte de façon plus permissive. Sur Mac, elle tourne dans le moteur de Safari (WebKit), fourni par le système, et plusieurs automatismes de Windows n'existent pas. D'où cinq blocages, invisibles quand on développe sous Windows :

1. **Les exports CSV/PDF ne produisent aucun fichier** (clic sans effet).
2. **Le panneau d'impression ne s'ouvre jamais** (PDF des notes, du Coach et du comparateur UC).
3. **⌘Q quitte brutalement** : en mode équipe, la base partagée reste en clair sur le disque.
4. **Le clic sur l'icône du Dock ne rouvre pas la fenêtre.**
5. **Écran blanc probable sur les Mac anciens** (Safari < 16.4).

Le reste relève surtout du dégradé (notifications, OneDrive, dictée…) et des libellés. Plusieurs points sont déjà bien faits pour le Mac (§ 6).

---

## 2. Bloquant

### B1. Aucun export par `<a download>` / `jsPDF.save()` ne produit de fichier — [Vérifié]
- **Mécanisme** : la fenêtre `main`, déclarée dans `tauri.conf.json`, n'a pas de gestionnaire `on_download`. wry ne crée donc pas de délégué de téléchargement (`registry: wry-0.55.1/src/wkwebview/mod.rs:570-580`), et quand WebKit demande un téléchargement, wry répond **`Cancel`** (`wry-0.55.1/src/wkwebview/navigation.rs:59-73`). Sous Windows, WebView2 télécharge de lui-même : d'où l'absence de symptôme.
- **Concerne** (clic sans effet ni message) :
  - `src/lib/export/csv-export.ts:32-39` (`downloadCsvFile`) → exports Contacts (`pages/Contacts.tsx:681,696`), Investissements (`pages/Investissements.tsx:705`), segments (`lib/export/segment-export.ts:103`), compta CSV (`lib/compta/compta-csv-export.ts:58`)
  - `src/lib/familles/familles-export.ts:42-45`, `foyers/foyers-export.ts:61-64`, `partenaires/partenaires-export.ts:69-72`, `prescripteurs/prescripteurs-export.ts:50-57`
  - `src/lib/compta/compta-pdf-export.ts:270` (`doc.save`) → journal comptable PDF
  - `src/lib/espace-client/synthese-patrimoniale-pdf-export.ts:314-327` → synthèse patrimoniale PDF
- **Preuve de terrain** : le CIF a rencontré exactement ce problème (commit `e7c6184` : « le clic ne produisait aucun fichier ») et a été corrigé seul. La fiche d'arbitrage marche, car elle écrit directement dans Téléchargements (`lib/pdf/arbitrage-fiche-conseil/generate-arbitrage-fiche.ts:72`).
- **Correction** (au choix) :
  1. Un helper unique `saveFileToDownloads(filename, bytes)` qui appelle `write_downloads_file_bytes_cmd`, utilisé dans les 7 implémentations ci-dessus (`doc.save()` → `doc.output("arraybuffer")`). Même comportement sur Windows et Mac.
  2. Ou créer la fenêtre `main` en Rust avec `.on_download(…)` (destination = Téléchargements) : cela corrige tous les téléchargements d'un coup.

### B2. `window.print()` ne fait rien : permission `core:webview:allow-print` absente — [Vérifié]
- **Mécanisme** : sur macOS uniquement, Tauri remplace `window.print` par `invoke('plugin:webview|print')` (`registry: tauri-2.11.2/src/webview/plugin.rs:199-203`, `scripts/print.js`). Cette commande n'est pas autorisée par défaut (`tauri-2.11.2/build.rs:146` : `("print", false)`), et `src-tauri/capabilities/default.json` / `desktop.json` ne l'accordent pas. L'appel est refusé (rejet de promesse non géré) et **aucun panneau ne s'ouvre**.
- **Concerne** : `hooks/use-note-print-export.ts:50`, `hooks/useFundWatchlistCoachPrintExport.ts:73`, `hooks/useUcComparatorPrintExport.ts:68`. L'utilisateur voit « Choisissez Enregistrer au format PDF » pendant 5 s, puis rien.
- **Deuxième problème, une fois la permission ajoutée** : sur Mac, le panneau s'ouvre en feuille non bloquante (`wry-0.55.1/src/wkwebview/mod.rs:858-893`), donc `print()` rend la main tout de suite. Ces trois hooks retirent le document au premier `afterprint` ou après 5 s (`PRINT_DIALOG_SAFETY_MS`) : le contenu disparaîtrait pendant que l'utilisateur est dans le panneau.
- **Correction** (au choix) :
  1. Ajouter `"core:webview:allow-print"` aux capabilities **et** brancher ces hooks sur `waitForCifPrintDialogClose` (`lib/souscription-cif/cif-print-dialog.ts:128`), qui gère déjà l'attente Mac.
  2. Ou faire comme le CIF : générer le PDF et l'écrire dans Téléchargements (voir B1). Comportement prévisible, sans panneau.

### B3. ⌘Q, « Quitter » du Dock, déconnexion ou arrêt du Mac : sortie sans fermeture propre — [Vérifié]
- **Mécanisme** : le menu macOS par défaut est actif (`registry: tauri-2.11.2/src/app.rs:2237-2239`). Son « Quitter » envoie `terminate:` (`muda-0.19.2/src/platform_impl/macos/mod.rs:994`). tao n'implémente que `applicationWillTerminate`, qui produit `LoopDestroyed` puis `RunEvent::Exit` (`tao-0.35.3/src/platform_impl/macos/app_delegate.rs:131-135`, `app_state.rs:272-282` ; `tauri-2.11.2/src/app.rs:1422,2543`). **Aucun `ExitRequested`** n'est émis, alors que `src-tauri/src/main.rs:706-719` ne traite que celui-ci.
- **Effet** : `close_database` (`src-tauri/src/auth/commands.rs:206-233`) n'est pas appelé. En **mode équipe**, le cache n'est pas scellé (`workspace/cache_seal.rs`) : `workspace-team-cache.db` reste **en clair** sur le disque, le cache documents n'est pas purgé et les blobs en attente ne sont pas protégés. → **Risque de sécurité.**
- **Correction** :
  - traiter `RunEvent::Exit` en appelant `close_database` (la sortie ne peut pas être annulée, mais ce code s'exécute avant la fin du processus) ;
  - et ajouter un menu d'app personnalisé dont « Quitter » (⌘Q) appelle `quit_app_fully`.

### B4. Clic sur l'icône du Dock (ou double-clic dans le Finder) : la fenêtre ne revient pas — [Vérifié]
- **Mécanisme** : la croix ✕ cache la fenêtre (`app_runtime/tray.rs:121-139`, `close_to_tray` vaut `true` par défaut, `prefs.rs:79`) ; le démarrage automatique `--minimized` la cache aussi (`tray.rs:155-163`). Le clic sur le Dock, ou un double-clic sur l'app dans le Finder alors qu'elle tourne, envoie `RunEvent::Reopen` (`tao-0.35.3/.../app_delegate.rs:79,208-214` → `tauri-2.11.2/src/app.rs:2624`). Tauri n'affiche rien de lui-même et `main.rs` ne traite pas cet événement.
- **Effet** : rien ne s'affiche, l'utilisateur croit l'app plantée. Seul contournement : l'icône de la barre des menus.
- **Correction** : `#[cfg(target_os = "macos")] if let RunEvent::Reopen { has_visible_windows: false, .. } = event { focus_main_window(app_handle); }`.

### B5. Écran blanc probable sur les Mac anciens (Safari < 16.4) — [Vérifié] code / [Supposé] effet
- **Constat** :
  - Vite 8 compile pour **Safari 16.4 minimum** (`node_modules/vite/dist/node/…` → `ESBUILD_BASELINE_WIDELY_AVAILABLE_TARGET = [… "safari16.4" …]`, aucun `build.target` dans `vite.config.ts`).
  - Tailwind CSS 4.3 vise aussi Safari 16.4+.
  - Le bundle principal (`dist/assets/index-*.js`) contient **2 expressions régulières « lookbehind »** `(?<!…)`, venant de `src/lib/souscription-cif/cif-pdf-download.ts:21` et `:61` (commit `acc02b7`).
  - Malgré ce minimum de Safari 16.4, l'app s'installe dès macOS 10.15 (`release.yml` : `MACOSX_DEPLOYMENT_TARGET: "10.15"`, pas de `minimumSystemVersion` dans `tauri.conf.json`).
- **Effet** : sur Safari < 16.4, une regex lookbehind est une erreur de syntaxe, donc tout le JavaScript principal refuse de se charger : fenêtre blanche, sans message.

| macOS | Safari | Résultat attendu |
|---|---|---|
| 10.15 Catalina | 15.6 max | ❌ Écran blanc, toujours |
| 11 Big Sur | 16.6 max | ⚠️ OK seulement si Safari est à jour (≥ 16.4) |
| 12 Monterey | 17.6 max | ⚠️ OK seulement si Safari est à jour (≥ 16.4) |
| 13 Ventura | 16.1 à la sortie, 16.4 dès macOS 13.3 | ⚠️ OK sauf Ventura jamais mis à jour |
| 14 Sonoma et suivants | 17+ | ✅ OK |

- **Correction** :
  1. Réécrire les 2 regex sans lookbehind (`/(^|[^\w-])(oklch|…)\(/gi` en réinjectant le groupe 1).
  2. `"minimumSystemVersion": "11.0"` dans `bundle.macOS` de `tauri.conf.json`.
  3. Petit script en JavaScript ancien dans `index.html` qui affiche « Mettez à jour Safari / macOS » si `CSS.supports("color", "color-mix(in srgb, red, blue)")` est faux.
  4. Fixer `build.target` explicitement dans `vite.config.ts`, pour éviter une hausse silencieuse du minimum à une future mise à jour de Vite.

---

## 3. Dégradé

### D1. Dictée vocale : refus systématique, voire plantage — [Supposé, probabilité élevée]
- **Où** : `src/components/ui/dictation-textarea.tsx:86-118` (`webkitSpeechRecognition`). Il n'y a ni `Info.plist` ni `.entitlements` dans `src-tauri/`.
- **Effet probable** : WebKit vérifie la présence de `NSMicrophoneUsageDescription` / `NSSpeechRecognitionUsageDescription` et refuse la demande. « Dicter » échoue alors avec « Vérifiez l'accès au micro », alors que l'app n'apparaît pas dans Réglages Système → Micro. Le plantage est moins probable, mais pas exclu.
- **Correction** : ajouter `src-tauri/Info.plist` (deux clés d'usage) et `Entitlements.plist` (`com.apple.security.device.audio-input`, requis avec le hardened runtime), référencés dans `bundle.macOS`. Ou masquer la dictée Web sur Mac et renvoyer vers la dictée système.

### D2. Clic sur une notification : pas de navigation — [Vérifié]
- **Où** : `src/lib/background/background-automation-notify.ts:50-53,91-103` (le toast interactif est réservé à Windows ; `automation_toast.rs:142-150`), `src/hooks/useAutomationNotificationListener.ts:40-54`.
- **Constat** : sur desktop, le plugin n'implémente que `notify`, `request_permission` et `is_permission_granted` (`registry: tauri-plugin-notification-2.3.3/src/lib.rs:224-228`). `registerActionTypes` échoue, et `onAction` aussi, avec un **rejet de promesse non géré**.
- **Effet** : la notification s'affiche, mais le clic n'ouvre pas la page ciblée. Si la fenêtre est cachée, elle ne revient pas non plus (B4).
- **Correction** : `try/catch` autour d'`onAction` ; sur Mac, appliquer la navigation en attente quand l'app revient au premier plan (`Reopen` ou activation).
- **Remarque (toutes plateformes)** : `consumePendingAutomationNotificationNav` (`automation-notification-pending.ts:66-77`) applique aussi une navigation enregistrée à l'envoi, même si la notification n'a pas été cliquée.

### D3. Refus des notifications jamais détecté — [Vérifié]
- Sur desktop, le plugin renvoie toujours `Granted` (`tauri-plugin-notification-2.3.3/src/desktop.rs:61-67`). Si l'utilisateur a refusé les notifications, le toast d'avertissement (`background-automation-notify.ts:37-48`) n'apparaît jamais, et les rappels sont perdus sans signal.
- **Correction** : aide propre au Mac dans Paramètres (« Réglages Système → Notifications → CRM W.Y.S »), à côté du bouton de test.

### D4. OneDrive : ouverture dans le navigateur au lieu du Finder — [Vérifié]
- **Où** : `src-tauri/src/client_onedrive/local_sync.rs:55-87`. Les racines cherchées sont les variables Windows `OneDrive*`, `~/OneDrive` et `D:\OneDrive`…`Z:\OneDrive`. Sur Mac, OneDrive synchronise dans `~/Library/CloudStorage/OneDrive-…`, jamais trouvé. Le message d'aide propose `D:\OneDrive` (`client_onedrive/commands.rs:421`).
- **Correction** : parcourir `~/Library/CloudStorage/OneDrive*` sous `cfg(target_os = "macos")`, et adapter les textes (C6).

### D5. Automatisations en arrière-plan ralenties quand la fenêtre est cachée — [Supposé]
- L'orchestrateur tourne dans le JavaScript ; `app_runtime/worker.rs:32-40` réveille le webview, mais seulement en partie. Une WKWebView cachée est fortement ralentie, et App Nap peut suspendre l'app : les synchros mail, Stellium, Box Placement et rappels RDV prennent du retard.
- **Correction** : `"backgroundThrottling": "disabled"` dans `app.windows[0]` de `tauri.conf.json`. **Efficace seulement à partir de macOS 14** (`wry-0.55.1/src/wkwebview/mod.rs:473-495`). Pour les versions antérieures, ajouter `NSProcessInfo.beginActivity`.

### D6. Autorisations macOS (Téléchargements, Documents, Bureau, iCloud, CloudStorage) — [Supposé]
- **Concerne** :
  - `write_downloads_file_bytes_cmd`, qui devient le chemin d'export recommandé (B1) ;
  - la sauvegarde externe quotidienne (`app_runtime/worker.rs:150-170`), lancée en arrière-plan ;
  - l'ouverture des dossiers OneDrive.
- **Effet** : au premier accès, macOS demande l'autorisation. En cas de refus, les écritures échouent ; la sauvegarde en arrière-plan échoue en silence, l'erreur n'étant visible que dans Paramètres.
- **Correction** : sur une erreur « Operation not permitted », afficher un message renvoyant à « Réglages Système → Confidentialité et sécurité → Fichiers et dossiers », et une alerte visible quand la sauvegarde externe échoue.

### D7. Passage Windows → Mac (ou Mac → autre Mac) par sauvegarde : connexions à refaire — [Vérifié]
- `backup_sidecar.rs:8-18` copie `secrets.key.os` : sous Windows, il contient la clé chiffrée DPAPI ; sur Mac, seulement un en-tête, la clé restant dans le Trousseau (`email/secret_storage.rs:306-322`). Après restauration sur une autre machine, les secrets sont illisibles (`secret_storage.rs:65-69`). La base et les documents restent accessibles.
- **Correction** : un parcours guidé (« reconnectez Gmail / Microsoft / IMAP ») et une documentation de la migration Windows → Mac.

### D8. Mise à jour automatique : échec si l'app tourne depuis le DMG — [Vérifié] en partie
- Le plugin gère déjà le cas non administrateur : en cas de `PermissionDenied`, il relance le remplacement avec une demande de mot de passe admin (`registry: tauri-plugin-updater-2.10.1/src/updater.rs:1260-1292`).
- **Reste** [Supposé] : une app lancée depuis le DMG (`/Volumes/…`, en lecture seule) ou translocalisée par macOS ne peut pas être remplacée.
- **Correction** : au démarrage, détecter ces chemins et proposer « Déplacer vers Applications ».

### D9. Identifiant d'app terminé par `.app` — [Vérifié]
- `tauri.conf.json` : `"identifier": "com.patrimoine-crm.app"`. La CLI Tauri installée l'avertit elle-même (« ends with `.app` … conflicts with the application bundle extension on macOS »).
- **Effet** : le dossier de données `~/Library/Application Support/com.patrimoine-crm.app/` (base, `backups/`, logos) s'affiche dans le Finder **comme une application**. Le support ou une restauration manuelle demande un clic droit → « Afficher le contenu du paquet ».
- **Correction** : **ne pas changer l'identifiant sans migration**. Il détermine le dossier de données, l'entrée du Trousseau (`secret_storage.rs:303`) et l'updater. En attendant, documenter le contournement.

### D10. Import de signature Outlook inutilisable — [Vérifié]
- `email/signature_import.rs:15-30` renvoie `None` hors Windows (`src/lib/emails/email-signature-import.ts:24-36`). Outlook pour Mac ne stocke pas ses signatures en `.htm`.
- **Correction** : sur Mac, masquer ou renommer le bouton (« Importer un fichier HTML »).

### D11. Nom et logo personnalisés sans effet sur le Dock — [Vérifié]
- `app_branding/os.rs:94-106` (raccourcis Windows seulement) ; `set_window_icon` est vide sur macOS (`tao-0.35.3/src/platform_impl/macos/window.rs:1401-1410`).
- **Correction** : `NSApplication.setApplicationIconImage` pour le Dock, ou l'indiquer dans l'interface (C5).

### D12. Sélecteurs de fichiers HTML : pas de filtre de type — [Vérifié]
- 11 champs `<input type="file" accept="…">`, par exemple `components/contacts/ContactImport.tsx:2233`, `ContactImportFilleuls.tsx:730`, `FinzzleClientsImportDialog.tsx:215`, `MonOrganisationImportDialog.tsx:226`. wry ouvre le panneau macOS sans transmettre `accept` (`wry-0.55.1/src/wkwebview/class/wry_web_view_ui_delegate.rs:99-124`) : tous les fichiers sont sélectionnables, et l'erreur n'arrive qu'à l'analyse.
- **Correction** : valider l'extension dès la sélection, ou utiliser `open({ filters })` du plugin dialog.

---

## 4. Cosmétique / conventions Mac

| # | Où | Constat | Proposition |
|---|----|---------|-------------|
| C1 | `pages/Contacts.tsx:1032`, `components/emails/TemplateEmailForm.tsx:2912` | « (Ctrl+F) », « Ctrl+S pour enregistrer » (les gestionnaires acceptent déjà ⌘) | Afficher ⌘F / ⌘S sur Mac (helper `modKeyLabel()`) |
| C2 | `App.tsx:202` | Retour = Alt+← | Ajouter ⌘[ sur Mac |
| C3 | `lib/speech/speech-dictation.ts:37-38`, `dictation-textarea.tsx:135,144` | « Dictée Windows … Win + H » | « Touche Fn (🌐) deux fois ou Édition › Commencer la dictée » |
| C4 | `components/settings/ParametresBackgroundSection.tsx:152-156, 350-356, 370` | « zone de notification (tray) », « bannière Windows », `dev.ps1` | « barre des menus », « Centre de notifications » |
| C5 | `components/settings/ParametresAppBrandingSection.tsx:163, 231-236` | Raccourci bureau, menu Démarrer, `.exe` | Texte propre au Mac (voir D11) |
| C6 | `components/client-onedrive/ClientOneDriveSettingsPanel.tsx:135-136, 373-378` | `D:\OneDrive`, « Explorateur Windows » | `~/Library/CloudStorage/OneDrive-…`, « Finder » |
| C7 | `src-tauri/src/auth/commands.rs:346-355` | Erreurs « Windows Hello ou Touch ID » | Utiliser le libellé de la plateforme (`:276-281`) |
| C8 | `src-tauri/src/auth/commands.rs:293-318` | Mac sans Touch ID : avertissement « non disponible », alors que le mot de passe du Mac fonctionne | Pas d'avertissement sur `biometryNotAvailable` ; libellé « Mot de passe du Mac » |
| C9 | `src-tauri/src/app_runtime/tray.rs:26-52` | Icône de la barre des menus en couleur ; clic gauche = fenêtre | Icône monochrome « template » (`icon_as_template(true)`) ; menu au clic gauche sur Mac |
| C10 | `components/contacts/client-preview/*` (`ClientPreviewRdvButton.tsx:24`, `ClientPreviewTimeline.tsx:99`, `ClientPreviewWhatsAppFab.tsx:38`…) | Liens `target="_blank"` sans effet sur Mac [Supposé] | Passer par `open_external_url` |
| C11 | Barres de défilement | Masquées par macOS tant qu'on ne fait pas défiler | Ombre en bord des tableaux larges si besoin |
| C12 | `fund-watchlist-coach-markdown.tsx`, `styles/globals.css:63` | `content-visibility`, `scrollbar-gutter` ignorés sur les Safari anciens | Rien à faire (sans conséquence) |
| C13 | `useAutomationNotificationListener.ts:40-54`, appels à `window.print` | Rejets de promesse non gérés sur Mac | Les attraper, pour garder une console lisible pendant les tests |

---

## 5. Scripts et outillage (développeurs sur Mac seulement)

- `package.json:17,26,28-30` : `icons:generate`, `test:rust` et `verify*` appellent `powershell`, absent sur Mac (`pwsh` pour PowerShell Core). → Script Node multi-OS ou `pwsh`.
- `scripts/verify.sh` n'est pas à parité avec `verify.ps1` : il manque le `tsc` du portail (`verify.ps1:66-68`) et `CARGO_TARGET_DIR` isolé (`:93`).
- `dev.ps1`, `bump-version.ps1`, `release-tag.ps1`, `publish-release.ps1` : PowerShell uniquement (`dev.ps1:19` détecte déjà Windows). Sur Mac, utiliser `npm run tauri dev`.
- Portail `espace-portail/` : c'est un serveur, rien ne s'exécute sur le poste client. Non concerné.

---

## 6. Déjà correct pour macOS (vérifié)

- **Secrets** dans le Trousseau macOS (`email/secret_storage.rs:297-366`), testé en CI.
- **Ouverture de fichiers et d'URL** via la crate `open` ; aucun `explorer.exe` hors code Windows ; chemins via `app_data_dir()` / `download_dir()`.
- **Build** universel (Intel + Apple Silicon), signé Developer ID, notarisé, vérifié ; `latest.json` avec les clés `darwin-*` ; tests TypeScript et Rust aussi sur `macos-latest`.
- **Raccourcis ⌘K / ⌘F / ⌘S** gérés ; le menu macOS par défaut ne les intercepte pas.
- **Navigation** `tauri://localhost` autorisée ; serveur OAuth sur `127.0.0.1` seulement.
- **Démarrage auto** (LaunchAgent), **Touch ID** (plugin compatible macOS), **polices** embarquées.
- **Dépôt de fichiers depuis le Finder** : les fichiers déposés sont autorisés (`tauri-plugin-fs-2.5.1/src/lib.rs:513-522`).
- **API JavaScript récentes** toutes protégées (`Promise.withResolvers`, `structuredClone` polyfillés ; `crypto.randomUUID`, `createImageBitmap` testés).
- **Dates** stockées en secondes Unix ou RFC 3339 : pas de piège Safari.
- **Champs de date** reconnus par Safari ; pas de `type="month"` ni `type="week"`.
- **pdf.js** adapté (build legacy, sans wasm, worker de repli).
- **HTML des e-mails** filtré par liste blanche de styles (`lib/emails/template-email-html.ts:191-212`).
- **PDF CIF** : génération directe dans Téléchargements sur Mac (`hooks/use-cif-print-export.ts:101-118`).

---

## 7. Corrections recommandées, par priorité

1. **B5** — Réécrire les 2 regex de `cif-pdf-download.ts` ; `minimumSystemVersion: "11.0"` ; message « Safari trop ancien » ; `build.target` explicite. *(Petit effort, évite un écran blanc.)*
2. **B1** — Helper `saveFileToDownloads` pour les 7 implémentations d'export (ou `on_download` en Rust).
3. **B3** — `RunEvent::Exit` → `close_database`, plus un menu « Quitter » personnalisé. *(Sécurité en mode équipe.)*
4. **B2** — Impression des notes, du Coach et du comparateur UC : permission + `waitForCifPrintDialogClose`, ou PDF direct.
5. **B4** — `RunEvent::Reopen` → `focus_main_window`. *(Une dizaine de lignes.)*
6. **D5** — `backgroundThrottling: "disabled"` (+ `beginActivity` avant macOS 14).
7. **D2 / D3 / C13** — Notifications : rejets gérés, navigation au retour, aide Réglages Système.
8. **D1** — Dictée : `Info.plist` + entitlement, ou masquage sur Mac.
9. **D4 + C6, D6, D8, D12** — OneDrive Mac, messages d'autorisation, « Déplacer vers Applications », filtre des fichiers.
10. **Libellés** (C1–C11) avec un helper `isMac()` unique (à partir de `isMacPrintPlatform`), puis **outillage** (§ 5).

---

## 8. Tests à faire sur un vrai Mac

**Pour confirmer les blocages**
1. Export CSV Contacts et journal comptable PDF : un fichier apparaît-il dans Téléchargements ? *(attendu aujourd'hui : non)*
2. Note → Export PDF : le panneau d'impression s'ouvre-t-il ? *(attendu : non)*
3. Mode équipe, ⌘Q, puis vérifier dans le dossier de données que `workspace-team-cache.db` a laissé place à `workspace-team-cache.db.sealed`. *(attendu : la base en clair reste)*
4. ✕ puis clic sur l'icône du Dock. *(attendu : rien ne s'ouvre)*
5. Lancement sur un Mac en macOS 11 ou 12 avec Safari < 16.4. *(attendu : écran blanc)*

**Pour lever les incertitudes**
6. Bouton « Dicter » sur une build signée.
7. Automatisations après 30 min fenêtre cachée.
8. Clic sur une notification ; notifications refusées dans Réglages Système.
9. Mise à jour lancée depuis une app restée dans le DMG ou dans Téléchargements.
10. Champs numériques (`type="number"`, 98 occurrences) : saisir « 12,5 ». Safari peut refuser la virgule. Les montants (`MoneyInput`) ne sont pas concernés.
11. Champs de date : saisie au clavier et calendrier.
12. Éditeur d'e-mails : coller depuis Mail, Pages ou Word pour Mac, puis envoyer un test.
13. Parcours visuel de chaque page (couleurs, ombres, menus, fenêtres modales).

---

## 9. Corrections apportées à l'audit initial

Pour mémoire, l'audit initial contenait ces erreurs, corrigées ci-dessus :
- **Impression CIF « adaptée à WKWebView »** : faux. Sur Mac, le CIF contourne l'impression. La logique Mac de `cif-print-dialog.ts` (`waiting-mac`, `MAC_PRINT_*`) n'est jamais appelée aujourd'hui ; elle resservira si B2 est corrigé avec la permission d'impression.
- **Exports PDF des notes, du Coach et du comparateur UC** : diagnostiqués comme donnant « un PDF vide ». En réalité, le panneau ne s'ouvre pas (B2).
- **⌘Q** : présenté comme une hypothèse avec deux scénarios possibles. Vérifié : sortie immédiate sans `close_database` (B3).
- **Dictée** : présentée comme un plantage probable. Plus probablement un refus systématique (D1).
- **Mise à jour** : le cas non administrateur était décrit comme bloquant. Il est déjà géré par le plugin (D8).
- **Oubliés** : B1 (téléchargements), B2 (permission d'impression), B5 (écran blanc), D9 (identifiant `.app`), D12 (filtre des fichiers).
