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
- Liste des dossiers récemment ouverts, filtrée pendant la saisie avant les 4 chiffres.
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

Le build publie l'installateur et `latest.yml`. Les versions installées vérifient ensuite les mises à jour automatiquement et affichent une fenêtre avec progression avant installation. Les mises à jour différentielles sont désactivées pour garder les releases lisibles, donc l'installateur complet est téléchargé.

## Build macOS

Le build macOS doit être lancé depuis macOS :

```bash
npm install
npm run build:mac
```

## Publication macOS signée avec mise à jour automatique

Les builds macOS de production sont signés et notarisés via GitHub Actions. Le workflow publie un DMG universel pour l'installation manuelle, un ZIP universel utilisé par `electron-updater`, et `latest-mac.yml` pour la détection des mises à jour.

Secrets requis dans GitHub > Settings > Secrets and variables > Actions :

- `CSC_LINK` : certificat Developer ID Application exporté en `.p12` puis encodé en base64.
- `CSC_KEY_PASSWORD` : mot de passe du certificat `.p12`.
- `APPLE_ID` : identifiant Apple Developer.
- `APPLE_APP_SPECIFIC_PASSWORD` : mot de passe spécifique à l'app.
- `APPLE_TEAM_ID` : Team ID Apple Developer.

Pour publier les artefacts macOS signés/notarisés :

- `Actions` > `Publish release assets` > `Run workflow`
- `ref` : `main`
- `platform` : `macos`
- `macos_signing` : `signed`

## Publication macOS temporaire non signée

Le mode `macos_signing=unsigned` reste disponible pour générer uniquement des DMG de test. Ces builds ne sont pas adaptés à une distribution publique et peuvent déclencher Gatekeeper.

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
