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

## Popup en deux volets

1. Ouvrir la recherche sans rien taper : le récent sélectionné est prévisualisé à droite (« récent », « ouvert il y a … »), `Entrée` le rouvre.
2. Taper deux chiffres : les récents sont filtrés (« 2 / 5 »), les chiffres tapés sont surlignés et « __ » complète le champ.
3. Taper un numéro existant : en-tête « trouvé » avec le chemin, table des sous-dossiers, sous-dossier `Entrée` présélectionné.
4. Appuyer puis relâcher `Alt` seul : le mode « Ouvrir dans » passe à l'option suivante ; ouvrir et vérifier que ce mode est utilisé.
5. Taper un numéro inexistant : « introuvable », années cherchées et numéros les plus proches ; `Entrée` reprend le plus proche.
6. Passer Windows en thème sombre : les fenêtres passent sur le fond bleu acier.

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
6. Taper quatre chiffres et vérifier que l'année et les boutons de sous-dossiers apparaissent sans que la barre se déplace.
7. Taper quatre chiffres inexistants et vérifier que les boutons n'apparaissent pas.
8. Cliquer sur chaque bouton de sous-dossier d'un projet valide et vérifier que le sous-dossier correspondant s'ouvre.

## Mini-barre épinglée Windows

1. Sur Windows, glisser la mini-barre flottante sur la barre des tâches, à l'endroit voulu, puis cliquer sur le bouton 📌.
2. Vérifier que la mini-barre reste exactement à cet endroit, sans se déplacer.
3. Taper quatre chiffres et vérifier que la barre ne saute pas au moment où la coche verte et les boutons apparaissent.
4. Déplacer la barre des tâches en haut, à gauche, à droite puis en bas.
5. Vérifier que la mini-barre ne se repositionne pas automatiquement après ces changements.
6. Vérifier que la poignée `⋮⋮` ne déplace pas la barre tant que le mode déplacement n'est pas activé.
7. Dans le menu tray, activer "Déplacer la barre épinglée".
8. Déplacer la mini-barre avec la poignée `⋮⋮` sur un autre écran.
9. Désactiver "Déplacer la barre épinglée", redémarrer l'application et vérifier que la position personnalisée est restaurée.
10. Taper quatre chiffres et vérifier que l'apparition des boutons ne recale pas la barre automatiquement.
11. Cliquer de nouveau sur 📌 et vérifier que la mini-barre redevient flottante.

## Volet déroulant de la mini-barre

1. Cliquer dans le champ de la mini-barre : un volet « récents | aperçu » s'ouvre.
2. Avec la mini-barre posée sur la barre des tâches, vérifier que le volet s'ouvre vers le haut et que la barre ne bouge pas.
3. Près du bord droit de l'écran, vérifier que la barre et le volet s'étendent vers la gauche.
4. Cliquer ailleurs : le volet se referme et la fenêtre reprend sa taille.

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
3. Modifier son nom, son chemin, sa touche et son icône.
4. Ouvrir le sélecteur d'icônes (+) et vérifier les six catégories.
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

## Taille des fenetres Explorer et Finder

1. Ouvrir un projet en mode nouvelle fenetre.
2. Verifier que la nouvelle fenetre du dossier est centree a environ 70 % de la largeur et de la hauteur utiles de son ecran, hors barre des taches ou Dock.
3. Redimensionner et deplacer une fenetre Explorer/Finder deja ouverte, puis ouvrir un projet en mode nouvel onglet et reutilisation ; verifier que cette fenetre garde exactement sa taille et sa position.
4. Refaire le test 2 sur un ecran secondaire, notamment place a gauche ou au-dessus du principal, avec des facteurs de zoom differents (100 %, 150 %, 200 %).
5. Fermer les fenetres Explorer/Finder puis ouvrir un projet et un dossier recent ; verifier la taille de la nouvelle fenetre et le dossier cible.
6. Garder une autre fenetre ouverte sur un dossier different ; verifier qu'elle ne change pas de taille lors d'une ouverture en nouvelle fenetre.
7. Verifier qu'il reste possible de redimensionner ou maximiser la fenetre manuellement apres l'ouverture.

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
8. Ouvrir le menu de l'icône, cliquer sur "Rechercher une mise à jour…", puis sur "Télécharger et installer".
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
8. Ouvrir le menu de l'icône, cliquer sur "Rechercher une mise à jour…", puis sur "Télécharger et installer".
9. Vérifier la barre de téléchargement, la progression, l'installation et le redémarrage.
