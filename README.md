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
npm ci
npm run check
npm start
```

Node.js `22.12` ou plus récent est requis pour le développement. Les utilisateurs finaux n'ont pas besoin d'installer Node.js.

## Architecture

Le processus principal est découpé par responsabilité dans `src/main` :

- `application.js` orchestre le cycle de vie et les actions utilisateur.
- `window-manager.js` gère les fenêtres, le tray et les écrans.
- `config-store.js` migre et sauvegarde la configuration de façon transactionnelle.
- `project-service.js` vérifie les projets et sécurise les chemins.
- `folder-openers/` isole Explorer et Finder.
- `updater-service.js` gère la recherche, le téléchargement et l'installation des mises à jour.
- `security.js` et `ipc-router.js` limitent chaque action IPC aux fenêtres autorisées.

## Build Windows

```powershell
npm run build
```

L'installateur NSIS est généré dans `dist/`. Un build local sans certificat reste adapté aux tests, mais pas à une publication.

## Publication Windows avec mise à jour automatique

Les mises à jour utilisent GitHub Releases via `electron-updater`. La publication de production passe par le workflow `Publish release assets`, avec un tag `vX.Y.Z` correspondant exactement à la version de `package.json`.

La recherche de mise à jour est exclusivement manuelle depuis le menu de l'icône de l'application. Aucun contrôle réseau, aucune notification et aucune fenêtre de mise à jour ne sont déclenchés au démarrage, à l'ouverture de session ou à la sortie de veille.

Secrets Windows requis :

- `WIN_CSC_LINK` : certificat Authenticode `.p12` encodé en base64 ou URL sécurisée.
- `WIN_CSC_KEY_PASSWORD` : mot de passe du certificat.

Le workflow vérifie la signature avant d'envoyer l'installateur et `latest.yml`. Un build Windows non signé reste disponible comme artefact temporaire dans Actions et n'est jamais joint à la release.

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
- `ref` : le tag de version ou `main` si ce commit porte déjà le tag attendu
- `platform` : `macos`
- `macos_signing` : `signed`

## Publication macOS temporaire non signée

Le mode `macos_signing=unsigned` génère un DMG de test conservé sept jours dans Actions. Il n'est jamais joint à une release publique et peut être bloqué par Gatekeeper.

## Configuration

Au premier lancement, si aucun dossier racine n'est configuré, la fenêtre Paramètres s'ouvre automatiquement.

Le fichier `config.json` est volontairement ignoré par Git, car il contient des chemins locaux. Un exemple public est fourni dans `config.example.json`.

Les écritures sont atomiques. La version précédente est conservée dans `config.json.bak`; une configuration illisible est renommée avec le suffixe `.corrupt-<date>` puis restaurée depuis la sauvegarde.

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
