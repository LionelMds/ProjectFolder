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

Le build publie l'installateur et `latest.yml`. Les versions installées vérifient ensuite les mises à jour automatiquement et affichent une fenêtre avec progression avant installation. Les mises à jour différentielles sont désactivées pour garder les releases lisibles, donc l'installateur complet est téléchargé.

## Build macOS

Le build macOS doit être lancé depuis macOS :

```bash
npm install
npm run build:mac
```

## Publication macOS temporaire

Sans compte Apple Developer, la release macOS est un DMG temporaire non signé. macOS peut afficher un avertissement Gatekeeper, voire proposer de placer l'app à la corbeille après téléchargement. Dans ce cas, retirer l'attribut de quarantaine puis relancer :

```bash
xattr -dr com.apple.quarantine "/Applications/Project Folder Launcher.app"
```

Le build macOS temporaire publie uniquement les DMG x64 et arm64. L'auto-update macOS reste désactivé tant que l'application n'est pas signée/notarisée.

## Publication macOS depuis GitHub Actions

Le workflow `Publish release assets` permet de produire les artefacts macOS depuis un runner macOS GitHub, puis de les attacher automatiquement à la release correspondant à la version de `package.json`.

Secrets requis dans GitHub > Settings > Secrets and variables > Actions :

- `CSC_LINK` : certificat Developer ID Application exporté en `.p12` puis encodé en base64.
- `CSC_KEY_PASSWORD` : mot de passe du certificat `.p12`.
- `APPLE_ID` : identifiant Apple Developer.
- `APPLE_APP_SPECIFIC_PASSWORD` : mot de passe spécifique à l'app.
- `APPLE_TEAM_ID` : Team ID Apple Developer.

Pour ajouter le DMG macOS à une release existante, lancer le workflow manuellement avec :

- `ref` : `main`
- `platform` : `macos`
- `macos_signing` : `unsigned` pour un DMG temporaire non signé, ou `signed` quand les secrets Apple Developer sont configurés.

Le workflow publie uniquement les DMG x64/arm64 pour garder la release simple.

Un build `unsigned` est utile pour tester et distribuer provisoirement un DMG, mais macOS affichera des avertissements Gatekeeper et l'auto-update macOS reste désactivé tant que l'app n'est pas signée/notarisée.

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
