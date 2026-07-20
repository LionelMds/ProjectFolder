# Architecture technique

## Principes

Project Folder Launcher conserve une interface vanilla HTML/CSS/JavaScript. La refonte porte sur les responsabilités du processus principal, la sécurité, la testabilité et la distribution, sans introduire de framework UI.

## Processus principal

`main.js` ne gère que le verrou d'instance unique et le cycle de vie Electron. `ApplicationController` assemble les services suivants :

| Module | Responsabilité |
| --- | --- |
| `config-store.js` | Valeurs par défaut, migration, validation et écriture transactionnelle |
| `project-service.js` | Résolution des quatre chiffres, vérification sur disque et confinement des chemins |
| `window-manager.js` | Fenêtres, mini-barre, tray, multi-écrans et progression système |
| `folder-openers/` | Stratégies Explorer/Finder et replis |
| `updater-service.js` | États de mise à jour, téléchargement, installation et planification |
| `security.js` | Sandbox renderer, blocage navigation/webview et rôles des fenêtres |
| `ipc-router.js` | Autorisation IPC par rôle et gestion uniforme des erreurs |
| `logger.js` | Journal asynchrone avec rotation |

## Frontière de sécurité

Toutes les fenêtres utilisent `contextIsolation`, le sandbox Electron, `nodeIntegration: false` et une politique de permissions refusée par défaut. Le preload expose uniquement des fonctions ciblées. Les événements IPC transmis aux pages ne contiennent jamais l'objet Electron interne.

Chaque fenêtre reçoit un rôle (`main`, `mini`, `settings`, `update`). Un canal IPC n'est exécutable que depuis les rôles explicitement autorisés. Les paramètres, index, identifiants récents et largeurs sont validés dans le processus principal.

Après le packaging, les fuses Electron désactivent `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` et les arguments d'inspection. Le binaire impose le chargement depuis `app.asar`, vérifie son intégrité et active le chiffrement des cookies.

## Configuration

Le schéma courant est `schemaVersion: 2`. Les anciennes clés `reuseExplorerWindow`, `openInNewTab` et `miniBar.enabled` sont lues pendant la migration mais ne sont plus réécrites.

Une sauvegarde suit ce cycle :

1. Sérialisation vers un fichier temporaire.
2. Synchronisation du fichier temporaire sur disque.
3. Déplacement de la configuration courante vers `.bak`.
4. Promotion du fichier temporaire en `config.json`.
5. Restauration de `.bak` si la promotion échoue.

## Explorer Windows

L'ouverture en nouvel onglet utilise d'abord `Shell.Application` pour cibler l'objet COM du nouvel onglet. Si Windows ne publie pas cet objet assez vite, UI Automation cible le champ actif après `Ctrl+L` et applique le chemin via `ValuePattern.SetValue`. Le chemin apparaît instantanément, sans frappe simulée et sans modifier le presse-papiers.

Si Explorer ne permet aucune des deux méthodes, l'application ouvre une nouvelle fenêtre afin de toujours atteindre le dossier demandé.

## Publication

La CI exécute les tests, l'audit npm et un packaging de contrôle Windows/macOS. Le workflow de release n'attache que des artefacts signés. Les builds non signés sont des artefacts temporaires distincts.

Les blockmaps ne sont pas publiées car les téléchargements différentiels sont désactivés. Sur macOS, le ZIP reste nécessaire à `electron-updater`; le DMG sert à l'installation manuelle.
