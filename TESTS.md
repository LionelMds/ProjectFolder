# Tests manuels - Project Folder Launcher

## Démarrage

1. Lancer `npm install`.
2. Lancer `npm start`.
3. Vérifier que l'icône apparaît dans la zone de notification Windows ou la barre de menus macOS.
4. Si le dossier racine est vide, vérifier que la fenêtre Paramètres s'ouvre automatiquement.

## Recherche principale

1. Ouvrir la recherche avec `Ctrl+Shift+P` sur Windows ou `Cmd+Shift+P` sur macOS.
2. Taper quatre chiffres correspondant à un projet existant, par exemple `4889`.
3. Vérifier que le message de validation devient vert et que la liste des sous-dossiers s'affiche.
4. Naviguer avec `↑`, `↓` et `Tab`.
5. Valider avec `Enter`, `Ctrl+Enter` et `Shift+Enter`.
6. Vérifier que `Escape` ferme la fenêtre sans ouvrir de dossier.

## Mini-barre flottante

1. Ouvrir Paramètres.
2. Vérifier que "Afficher la mini-barre" est activé.
3. Enregistrer.
4. Vérifier que la mini-barre apparaît et qu'elle peut être déplacée.
5. Redémarrer l'application et vérifier que la position est restaurée.
6. Taper quatre chiffres et vérifier que les boutons emoji apparaissent après le redimensionnement.
7. Cliquer sur chaque bouton emoji et vérifier que le sous-dossier correspondant s'ouvre.

## Mini-barre épinglée Windows

1. Sur Windows, cliquer sur le bouton 📌 de la mini-barre.
2. Vérifier que la mini-barre est superposée à la barre des tâches, près de la zone de notification.
3. Déplacer la barre des tâches en haut, à gauche, à droite puis en bas.
4. Vérifier que la mini-barre ne se repositionne pas automatiquement après ces changements.
5. Vérifier que la poignée `⋮⋮` ne déplace pas la barre tant que le mode déplacement n'est pas activé.
6. Dans le menu tray, activer "Déplacer la barre épinglée".
7. Déplacer la mini-barre avec la poignée `⋮⋮` sur un autre écran.
8. Désactiver "Déplacer la barre épinglée", redémarrer l'application et vérifier que la position personnalisée est restaurée.
9. Taper quatre chiffres et vérifier que l'apparition des boutons ne recale pas la barre automatiquement.
10. Cliquer de nouveau sur 📌 et vérifier que la mini-barre redevient flottante.

## Popover barre de menus macOS

1. Sur macOS, choisir "Popover barre de menus" dans Paramètres.
2. Enregistrer.
3. Cliquer sur l'icône de la barre de menus.
4. Vérifier que le popover apparaît sous l'icône et reçoit le focus.
5. Taper quatre chiffres, ouvrir un sous-dossier, puis vérifier que le popover se ferme.
6. Cliquer hors du popover et vérifier qu'il se ferme automatiquement.

## Mode masqué

1. Choisir "Masquée" dans Paramètres.
2. Enregistrer.
3. Vérifier qu'aucune mini-barre n'est visible.
4. Vérifier que la recherche principale reste disponible via tray et raccourci global.
5. Utiliser le menu tray "Afficher la mini-barre" ou les Paramètres pour la réafficher.

## Comportement d'ouverture

1. Choisir "Nouvelle fenêtre Explorer/Finder" et ouvrir un projet.
2. Vérifier qu'une nouvelle fenêtre s'ouvre.
3. Choisir "Nouvel onglet dans la fenêtre active" et ouvrir un projet.
4. Sur Windows 11, vérifier qu'un nouvel onglet Explorer est créé quand une fenêtre Explorer existe.
5. Sur macOS, vérifier qu'un nouvel onglet Finder est créé quand une fenêtre Finder existe.
6. Choisir "Réutiliser la fenêtre active" et ouvrir un projet.
7. Vérifier que la fenêtre Explorer ou Finder existante change de dossier.
8. Fermer toutes les fenêtres Explorer/Finder puis répéter les tests pour vérifier le fallback vers une nouvelle fenêtre.

## Paramètres

1. Changer le dossier racine avec "Parcourir".
2. Ajouter un sous-dossier.
3. Modifier son nom, son chemin, son raccourci et son emoji.
4. Ouvrir le sélecteur d'emojis et vérifier les sept catégories.
5. Déplacer le sous-dossier avec `▲` et `▼`.
6. Supprimer le sous-dossier.
7. Changer le raccourci global, enregistrer, puis vérifier que l'ancien raccourci ne répond plus.
8. Activer et désactiver le démarrage automatique.

## Tray et menu

1. Clic gauche sur l'icône tray Windows : la recherche principale s'ouvre.
2. Clic droit sur l'icône tray Windows : le menu contextuel s'ouvre.
3. Sur macOS en mode popover, clic gauche : le popover s'ouvre.
4. Sur macOS, clic droit : le menu contextuel s'ouvre.
5. Basculer entre les trois modes d'intégration depuis le menu tray.
6. Ouvrir Paramètres depuis le tray.
7. Quitter depuis le tray et vérifier que le processus se ferme.

## Logs

1. Lancer l'application.
2. Ouvrir un projet valide et un projet invalide.
3. Ouvrir le fichier `.projectLauncher.log` dans le dossier `userData` d'Electron.
4. Vérifier que les événements importants et les erreurs y sont enregistrés.

## Build Windows

1. Lancer `npm run build` sur Windows.
2. Vérifier que l'installateur NSIS est généré dans `dist`.
3. Installer l'application.
4. Vérifier le choix du dossier d'installation, le raccourci bureau, le raccourci menu Démarrer et l'option de lancement après installation.

## Mises à jour automatiques Windows

1. Publier une version `vX.Y.Z` sur GitHub avec `npm run release:win`.
2. Installer cette version.
3. Incrémenter `package.json` vers une version supérieure.
4. Publier la nouvelle version avec `npm run release:win`.
5. Lancer l'ancienne version installée.
6. Vérifier que la fenêtre de mise à jour signale la nouvelle version.
7. Cliquer sur "Télécharger et installer".
8. Vérifier la barre de téléchargement, la vitesse et la progression.
9. Vérifier que l'application se ferme, que l'installateur démarre, puis que l'application se relance après installation.

## Build macOS

1. Sur un Mac, lancer `npm install`.
2. Lancer `npm run build:mac`.
3. Vérifier que le DMG est généré dans `dist`.
4. Installer l'application dans `/Applications`.
5. Vérifier l'icône de barre de menus, le popover, les onglets Finder et le démarrage automatique.

## Mises à jour automatiques macOS

1. Sur un build temporaire non signé, ouvrir le menu tray et lancer "Vérifier les mises à jour".
2. Vérifier que l'application indique que les mises à jour automatiques macOS sont désactivées sur ce build.
3. Après obtention d'un compte Apple Developer, réactiver les artefacts ZIP/`latest-mac.yml`, signer/notariser le build, puis tester la détection, le téléchargement avec progression, l'installation et le redémarrage.
