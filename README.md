# Project Folder Launcher

Project Folder Launcher est une application Electron légère pour ouvrir rapidement des dossiers de projets à partir des 4 derniers chiffres du numéro de projet.

## Fonctionnement

Structure attendue :

```text
<RACINE>/
  2024/
    2024-4889/
  2025/
    2025-0042/
```

Tapez `4889` et l'application cherche automatiquement le premier dossier `YYYY-4889` dans les années disponibles, de la plus récente à la plus ancienne.

## Fonctionnalités

- Recherche rapide via raccourci global `Ctrl+Shift+P` ou `Cmd+Shift+P` sur macOS.
- Mini-barre flottante avec bouton `📌` pour l'épingler sur la barre des tâches Windows.
- Menu tray Windows et menu bar macOS.
- Sous-dossiers configurables avec nom, chemin, raccourci et emoji.
- Ouverture en nouvelle fenêtre, nouvel onglet ou réutilisation de la fenêtre active.
- Démarrage automatique via l'API native Electron.
- Configuration portable et migration des anciennes préférences.

## Installation développeur

```powershell
npm install
npm start
```

## Build Windows

```powershell
npm run build
```

L'installateur NSIS est généré dans `dist/`.

## Publication Windows avec mise à jour automatique

Les mises à jour utilisent GitHub Releases via `electron-updater`.

```powershell
$env:GH_TOKEN="votre_token_github"
npm run release:win
```

Le build publie l'installateur, le blockmap et `latest.yml`. Les versions installées vérifient ensuite les mises à jour automatiquement et affichent une fenêtre avec progression avant installation.

## Build macOS

Le build macOS doit être lancé depuis macOS :

```bash
npm install
npm run build:mac
```

## Publication macOS avec mise à jour automatique

macOS exige une application signée pour que l'auto-update fonctionne correctement. Préparer les variables de signature/notarisation sur le Mac de build, puis publier :

```bash
export GH_TOKEN="votre_token_github"
export CSC_NAME="Developer ID Application: ..."
export APPLE_ID="..."
export APPLE_APP_SPECIFIC_PASSWORD="..."
export APPLE_TEAM_ID="..."
npm run release:mac
```

Le build macOS génère un DMG et un ZIP, plus `latest-mac.yml`, nécessaires aux mises à jour automatiques.

## Configuration

Au premier lancement, si aucun dossier racine n'est configuré, la fenêtre Paramètres s'ouvre automatiquement.

Le fichier `config.json` est volontairement ignoré par Git, car il contient des chemins locaux. Un exemple public est fourni dans `config.example.json`.

## Raccourcis

| Action | Raccourci |
| --- | --- |
| Ouvrir la popup | `Ctrl+Shift+P` |
| Dossier principal | `Enter` |
| Plans d'exécution | `Ctrl+Enter` |
| Fournisseurs | `Shift+Enter` |
| Fermer | `Escape` |

## Licence

MIT
