# Architecture technique

## Principes

Project Folder Launcher conserve une interface vanilla HTML/CSS/JavaScript. La refonte porte sur les responsabilités du processus principal, la sécurité, la testabilité et la distribution, sans introduire de framework UI.

## Interface

Les fenêtres reprennent la direction « deux volets » de la maquette Claude Design *Launcher UX* (tour 2), dans le système **Industry** : fond opaque, cadres filetés à angles droits avec repères « + », Barlow / Barlow Condensed, icônes Lucide au trait 1,5.

- `src/ui/industry.css` porte les jetons (couleurs, rampes, ombres, thème sombre) et les composants communs : volets, lignes de liste, tables, contrôle segmenté, interrupteur, règle de progression.
- Les polices sont embarquées dans `assets/fonts` (licence OFL) : l'application fonctionne hors ligne et la CSP n'autorise aucune ressource distante.
- `src/shared/icons.js` contient les icônes Lucide utilisées (licence ISC), générées depuis `lucide-static` ; les anciens emoji de la configuration sont convertis à la migration (schéma 4).
- Chaque fenêtre est transparente autour de son panneau pour laisser la place aux repères et à l'ombre.

La mini-barre mesure son contenu et l'envoie au processus principal (`set-mini-layout`) : la fenêtre est redimensionnée autour de la position de base de la barre, qui ne bouge jamais. Elle s'élargit vers la gauche près du bord droit et son volet s'ouvre vers le haut quand la barre est en bas de l'écran (sur la barre des tâches).

## Processus principal

`main.js` ne gère que le verrou d'instance unique et le cycle de vie Electron. `ApplicationController` assemble les services suivants :

| Module | Responsabilité |
| --- | --- |
| `config-store.js` | Valeurs par défaut, migration, validation et écriture transactionnelle |
| `project-service.js` | Résolution des quatre chiffres, vérification sur disque et confinement des chemins |
| `window-manager.js` | Fenêtres, mini-barre, tray, multi-écrans et progression système |
| `folder-openers/` | Stratégies Explorer/Finder et replis |
| `updater-service.js` | Recherche manuelle, téléchargement et installation des mises à jour |
| `security.js` | Sandbox renderer, blocage navigation/webview et rôles des fenêtres |
| `ipc-router.js` | Autorisation IPC par rôle et gestion uniforme des erreurs |
| `logger.js` | Journal asynchrone avec rotation |

## Frontière de sécurité

Toutes les fenêtres utilisent `contextIsolation`, le sandbox Electron, `nodeIntegration: false` et une politique de permissions refusée par défaut. Le preload expose uniquement des fonctions ciblées. Les événements IPC transmis aux pages ne contiennent jamais l'objet Electron interne.

Chaque fenêtre reçoit un rôle (`main`, `mini`, `settings`, `update`). Un canal IPC n'est exécutable que depuis les rôles explicitement autorisés. Les paramètres, index, identifiants récents et largeurs sont validés dans le processus principal.

Après le packaging, les fuses Electron désactivent `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` et les arguments d'inspection. Le binaire impose le chargement depuis `app.asar`, vérifie son intégrité et active le chiffrement des cookies.

## Configuration

Le schéma courant est `schemaVersion: 3`. Les anciennes clés `reuseExplorerWindow`, `openInNewTab` et `miniBar.enabled` sont lues pendant la migration mais ne sont plus réécrites.

Une sauvegarde suit ce cycle :

1. Sérialisation vers un fichier temporaire.
2. Synchronisation du fichier temporaire sur disque.
3. Copie de la configuration courante vers `.bak`.
4. Promotion du fichier temporaire en `config.json` par renommage atomique : le fichier courant n'est jamais absent.
5. En cas de verrou passager (antivirus, OneDrive), copie et renommage sont retentés.

Au démarrage, `.bak` est relu si `config.json` est illisible ou absent.

## Explorer Windows

L'ouverture en nouvel onglet utilise d'abord `Shell.Application` pour cibler l'objet COM du nouvel onglet. Si Windows ne publie pas cet objet assez vite, UI Automation cible le champ actif après `Ctrl+L` et applique le chemin via `ValuePattern.SetValue`. Le chemin apparaît instantanément, sans frappe simulée et sans modifier le presse-papiers.

Si Explorer ne permet aucune des deux méthodes, l'application ouvre une nouvelle fenêtre afin de toujours atteindre le dossier demandé.

Aucune touche (`Ctrl+T`, `Ctrl+L`, `Entrée`, `Ctrl+W`) n'est envoyée sans avoir vérifié que la fenêtre Explorer est réellement au premier plan : si Windows refuse l'activation, le script ouvre une nouvelle fenêtre plutôt que de risquer d'envoyer ces touches à une autre application.

Le script PowerShell tourne dans un processus persistant (`powershell-worker.js`) : le chargement des assemblies et la compilation C# (~0,5 s) ne sont payés qu'une fois. Le processus est démarré dès que la recherche s'affiche, reçoit une requête JSON par ligne (en ASCII, pour que les chemins accentués ne dépendent pas de la page de code de la console) et s'arrête après 10 minutes d'inactivité.

## Résolution des projets

Les dossiers d'années sont interrogés en parallèle, ce qui ne coûte qu'un aller-retour sur un partage réseau. Un projet trouvé est gardé 30 secondes en cache, pour que l'ouverture qui suit la saisie ne refasse pas la recherche. Un projet introuvable n'est jamais mis en cache.

## Publication

La CI exécute les tests, l'audit npm et un packaging de contrôle Windows/macOS. Le workflow de release n'attache que des artefacts signés. Les builds non signés sont des artefacts temporaires distincts.

Les blockmaps ne sont pas publiées car les téléchargements différentiels sont désactivés. Sur macOS, le ZIP reste nécessaire à `electron-updater`; le DMG sert à l'installation manuelle.
