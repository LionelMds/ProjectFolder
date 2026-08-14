# Tests manuels - Project Folder Launcher

## Tests automatiques

1. Installer Node.js `22.12` ou plus récent.
2. Lancer `npm ci`.
3. Lancer `npm run check`.
4. Vérifier que la syntaxe, tous les tests et `npm audit --audit-level=moderate` réussissent.

## Démarrage

1. Lancer `npm install`.
2. Lancer `npm start`.
3. Vérifier que l'icône apparaît dans la zone de notification Windows ou la barre de menus macOS.
4. Si le dossier racine est vide, vérifier que la fenêtre Paramètres s'ouvre automatiquement.

## Recherche principale

1. Ouvrir la recherche avec `Ctrl+Shift+P` sur Windows ou `Cmd+Shift+P` sur macOS.
2. Vérifier que la liste des dossiers récemment ouverts apparaît si des dossiers ont déjà été ouverts.
3. Vérifier que chaque récent affiche toujours le numéro `20XX-XXXX`, avec le sous-dossier ajouté seulement si un sous-dossier a été ouvert.
4. Taper un, deux puis trois chiffres et vérifier que les récents sont filtrés.
5. Naviguer dans les récents avec `↑`, `↓` et `Tab`, puis ouvrir un récent avec `Enter`.
6. Taper quatre chiffres correspondant à un projet existant, par exemple `4889`.
7. Vérifier que "Recherche du projet..." apparaît brièvement, puis que le message devient vert seulement si le dossier existe réellement.
8. Taper quatre chiffres inexistants et vérifier que "Projet introuvable" apparaît sans afficher les sous-dossiers.
9. Naviguer avec `↑`, `↓` et `Tab`.
10. Valider avec `Enter`, `Ctrl+Enter` et `Shift+Enter`.
11. Rouvrir la recherche et vérifier que le dossier ouvert vient en haut des récents.
12. Vérifier que `Escape` ferme la fenêtre sans ouvrir de dossier.

## Mini-barre flottante

1. Ouvrir Paramètres.
2. Vérifier que "Afficher la mini-barre" est activé.
3. Enregistrer.
4. Vérifier que la mini-barre apparaît et qu'elle peut être déplacée.
5. Redémarrer l'application et vérifier que la position est restaurée.
6. Taper quatre chiffres et vérifier que les boutons emoji apparaissent après le redimensionnement.
7. Taper quatre chiffres inexistants et vérifier que les boutons n'apparaissent pas.
8. Cliquer sur chaque bouton emoji d'un projet valide et vérifier que le sous-dossier correspondant s'ouvre.

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

1. Sur macOS, cliquer sur le bouton d'épinglage de la mini-barre.
2. Cliquer sur l'icône de la barre de menus.
3. Vérifier que le popover apparaît sous l'icône et reçoit le focus.
4. Taper quatre chiffres, ouvrir un sous-dossier, puis vérifier que le popover se ferme.
5. Cliquer hors du popover et vérifier qu'il se ferme automatiquement.

## Mode masqué

1. Désactiver "Afficher la mini-barre" dans Paramètres.
2. Enregistrer.
3. Vérifier qu'aucune mini-barre n'est visible.
4. Vérifier que la recherche principale reste disponible via tray et raccourci global.
5. Utiliser le menu tray "Afficher la mini-barre" ou les Paramètres pour la réafficher.

## Comportement d'ouverture

1. Choisir "Nouvelle fenêtre Explorer/Finder" et ouvrir un projet.
2. Vérifier qu'une nouvelle fenêtre s'ouvre.
3. Choisir "Nouvel onglet dans la fenêtre active" et ouvrir un projet.
4. Sur Windows 11, vérifier qu'un nouvel onglet Explorer est créé quand une fenêtre Explorer existe.
5. Vérifier que le chemin apparaît instantanément, sans saisie caractère par caractère, et qu'aucun onglet "Ce PC" ne reste devant.
6. Sur macOS, vérifier qu'un nouvel onglet Finder est créé quand une fenêtre Finder existe.
7. Choisir "Réutiliser la fenêtre active" et ouvrir un projet.
8. Vérifier que la fenêtre Explorer ou Finder existante change de dossier sans créer un onglet "Ce PC".
9. Fermer toutes les fenêtres Explorer/Finder puis répéter les tests pour vérifier le fallback vers une nouvelle fenêtre.

## Paramètres

1. Changer le dossier racine avec "Parcourir".
2. Ajouter un sous-dossier.
3. Modifier son nom, son chemin, son raccourci et son emoji.
4. Ouvrir le sélecteur d'emojis et vérifier les sept catégories.
5. Déplacer le sous-dossier avec `▲` et `▼`.
6. Supprimer le sous-dossier.
7. Changer le raccourci global, enregistrer, puis vérifier que l'ancien raccourci ne répond plus.
8. Essayer un raccourci déjà utilisé et vérifier que l'erreur est visible et que l'ancien raccourci continue de fonctionner.
9. Activer et désactiver le démarrage automatique.

## Tray et menu

1. Clic gauche sur l'icône tray Windows : la recherche principale s'ouvre.
2. Clic droit sur l'icône tray Windows : le menu contextuel s'ouvre.
3. Sur macOS en mode popover, clic gauche : le popover s'ouvre.
4. Sur macOS, clic droit : le menu contextuel s'ouvre.
5. Afficher ou masquer la mini-barre depuis le tray et utiliser son bouton d'épinglage pour changer de mode.
6. Ouvrir Paramètres depuis le tray.
7. Quitter depuis le tray et vérifier que le processus se ferme.

## Logs

1. Lancer l'application.
2. Ouvrir un projet valide et un projet invalide.
3. Ouvrir le fichier `.projectLauncher.log` dans le dossier `userData` d'Electron.
4. Vérifier que les événements importants et les erreurs y sont enregistrés.
5. Vérifier qu'un journal dépassant 2 Mo est déplacé vers `.projectLauncher.log.1`.

## Build Windows

1. Lancer `npm run build` sur Windows.
2. Vérifier que l'installateur NSIS est généré dans `dist`.
3. Installer l'application.
4. Vérifier le choix du dossier d'installation, le raccourci bureau, le raccourci menu Démarrer et l'option de lancement après installation.

## Mises à jour Windows

1. Créer une release et un tag `vX.Y.Z` correspondant à `package.json`.
2. Installer cette version.
3. Incrémenter `package.json` vers une version supérieure.
4. Lancer `Publish release assets` avec `windows_signing=signed`.
5. Lancer l'ancienne version installée.
6. Attendre au moins 30 secondes et vérifier qu'aucune recherche, notification ou fenêtre de mise à jour n'apparaît.
7. Redémarrer l'application, verrouiller puis déverrouiller la session et effectuer une sortie de veille ; vérifier que l'updater ne s'affiche jamais.
8. Ouvrir le menu de l'icône, cliquer sur "Vérifier les mises à jour...", puis sur "Télécharger et installer".
9. Vérifier la barre de téléchargement, la vitesse et la progression.
10. Vérifier que l'application se ferme, que l'installateur démarre, puis que l'application se relance après installation.

## Build macOS

1. Sur un Mac, lancer `npm install`.
2. Lancer `npm run build:mac`.
3. Vérifier que le DMG est généré dans `dist`.
4. Installer l'application dans `/Applications`.
5. Vérifier l'icône de barre de menus, le popover, les onglets Finder et le démarrage automatique.

## Mises à jour macOS

1. Publier une version macOS signée/notarisée avec le workflow `Publish release assets`, `platform=macos`, `macos_signing=signed`.
2. Vérifier que la release contient le DMG universel, le ZIP universel et `latest-mac.yml`.
3. Installer cette version depuis le DMG.
4. Publier une version supérieure avec le même workflow signé.
5. Lancer l'ancienne version installée.
6. Vérifier qu'aucune recherche, notification ou fenêtre de mise à jour n'apparaît spontanément.
7. Redémarrer l'application et effectuer une sortie de veille ; vérifier que l'updater reste invisible.
8. Ouvrir le menu de l'icône, cliquer sur "Vérifier les mises à jour...", puis sur "Télécharger et installer".
9. Vérifier la barre de téléchargement, la progression, l'installation et le redémarrage.
