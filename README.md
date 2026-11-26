# Velocivector 2D CAD

Prototype de dessin géométrique pour préparer des fichiers de découpe. Tout le traitement s’effectue sur l’ordinateur, sans service en ligne.

## Lancement

Sous Windows, double-cliquer sur **Lancer.cmd** pour ouvrir l’application dans une fenêtre Microsoft Edge dédiée. Le lanceur se replie sur le navigateur par défaut si Edge est absent. Sur Linux ou macOS, ouvrir **index.html** dans un navigateur moderne. Dans **Fichier → Préférences → Langue**, choisir le français, l’anglais ou la langue du navigateur. Le choix manuel est mémorisé pour les prochaines ouvertures.

## Tracer une première pièce

1. Choisir **Rectangle** avec R et poser deux coins à la souris. Pour un placement précis, renseigner X et Y dans le panneau puis cliquer sur **Poser le point** après chaque paire de coordonnées.
2. Choisir **Cercle** avec C et poser son centre, puis un point à la distance voulue.
3. Utiliser **Cotation intelligente (I)** pour vérifier une distance. La molette zoome sous le curseur, le bouton du milieu déplace la vue et F cadre le dessin.
4. Ouvrir **Fichier → Export rapide**, choisir **DXF** ou **SVG**, puis exporter la sélection, des calques cochés ou tout le dessin. Le bouton **Enregistrer sous…** ouvre le choix de destination lorsque le navigateur le permet. Sinon, le navigateur gère le téléchargement. L’export fonctionne aussi pour un dessin qui n’a pas encore été enregistré en VCV.

Les coordonnées sont absolues, avec Y vers le haut. La saisie accepte le point ou la virgule décimale. Le menu d’unités change l’interprétation des valeurs sans redimensionner le dessin.

Pour tracer avec la souris, poser les points par clics successifs ou appuyer au départ et relâcher à l’arrivée. Le dessin suit le curseur pendant l’appui et se valide au relâchement. Pour une forme qui demande plus de points, poursuivre la commande avec les points restants. Dans la polyligne, un appui bref pose un point à l’endroit pressé. Un appui d’au moins 100 ms suivi d’un déplacement prolonge le tracé depuis ce sommet. Le relâchement pose le dernier segment et termine le tracé.

- **P** ou **L** active **Ligne / polyligne**, représenté par un pentagone irrégulier. Terminer après deux points crée une ligne. Continuer au-delà crée une polyligne. **A** alterne entre segments droits et arcs définis par un point intermédiaire et une arrivée. Entrée, Échap ou le double-clic termine le tracé. Revenir sur le départ ferme le tracé après au moins deux segments.
- **Arc (A)** pose par défaut le centre, le départ et l’arrivée. Le mouvement du curseur autour du centre détermine le sens et permet de dépasser 180°. On peut poser les trois points par clics, appuyer puis glisser du centre au départ, ou poser le centre puis appuyer et glisser du départ à l’arrivée. Maintenir le bouton de l’outil Arc ouvre le choix de la méthode à trois points.
- **R, C, A, G, E, O, B** activent le rectangle, le cercle, l’arc, le polygone régulier, l’ellipse, l’oblong et la plume Bézier. L’oblong accepte deux centres ou la cote hors tout.
- Un oblong reçoit une contrainte d’égalité entre ses deux côtés droits et quatre tangences aux jonctions. Glisser son contour le déplace d’un bloc. Glisser une jonction ajuste sa longueur ou sa largeur en conservant les deux demi-cercles et leurs raccords tangents. Les anciens oblongs reconnaissables sont protégés à l’ouverture d’un projet.
- Pour coter un oblong protégé, choisir un côté droit pour la distance entre les centres, un demi-cercle pour le rayon, ou les deux côtés pour la largeur. Le solveur ajuste l’oblong comme une seule forme. Un clic droit sur une ancienne cote pilotée de l’oblong propose **Rendre pilotante** si les autres cotes laissent cette mesure libre.
- Avec la **plume Bézier (B)**, cliquer pour poser un point de passage ou maintenir l’appui au moins 100 ms et glisser pour en poser deux. Un appui plus bref pose le point à l’endroit pressé, même si la souris a glissé. La courbe passe par ces points et calcule ses tangentes selon l’espacement et la direction des segments voisins. Entrée ou Échap valide le tracé ouvert. Revenir sur le premier point avec au moins trois points de passage ferme la courbe. Le DXF 2000 et le SVG conservent les portions de Bézier cubiques.
- Le réglage **Longueur par défaut (%)** de la plume part de 138 % et agit sur le tracé en cours et les nouvelles courbes. Le calcul tient compte de l’espacement local et raccourcit les bras dans les virages serrés. Avec **Sélection et déplacement (V)**, cliquer sur un point de passage pour afficher ses poignées. Glisser le point le déplace. Glisser un bras règle sa longueur et sa direction. **Dissocier les longueurs** permet des longueurs différentes sur le même axe. **Dissocier les angles** autorise un axe différent pour chaque bras. Les deux réglages sont indépendants et les longueurs vont jusqu’à 500 %. **Automatique** rétablit le calcul de la plume. Le projet mémorise les réglages de chaque courbe.
- **V** active **Sélection et déplacement**. Cliquer sélectionne, glisser déplace. Un rectangle de gauche à droite sélectionne les tracés entièrement inclus. De droite à gauche, il sélectionne les portions traversées, y compris dans un tracé joint. Maj ajoute et Ctrl retire.
- **Colinéaire** aligne deux segments sur une même droite. Pendant le dessin, elle est proposée à moins de 3° dans le prolongement d’un segment, après les autres aides d’aimantation.
- **Fermeture automatique** sélectionne des contours entiers et indique combien sont ouverts ou fermés. Elle repère les extrémités du même calque séparées de 0,1 mm au plus par défaut. Elle peut prolonger ou raccourcir les tracés sur leur géométrie d’origine, ajouter un arc tangent avec une cote de rayon pilotante, ou insérer un segment. **Appliquer** traite toute la sélection en une seule opération. Les menus **Dessin** et **Modification** permettent d’afficher ou masquer chaque bouton de leur barre.
- Dans l’atelier DXF, **Jonction automatique des tracés** reprend ces trois méthodes. L’aperçu se recalcule à l’ouverture et après chaque modification des réglages. Pour les fichiers de plus de 1,5 Mo, le bouton **Calculer le chemin optimal** permet de lancer ce traitement manuellement. Le calcul reconnaît les tracés, ajoute les contraintes automatiques puis réalise les jonctions sur les calques source. Le regroupement sur un seul calque se fait à la validation.
- Dans l’atelier d’importation, le calcul repère aussi les chevauchements par calque. La tolérance par défaut est de 0,05 mm. L’aperçu surligne les portions concernées dans la source et dans la proposition. Ce diagnostic est décoché à l’ouverture des fichiers de plus de 1,5 Mo. L’option **Supprimer les chevauchements à l’import**, décochée par défaut, retire les portions superposées par calque avec la même tolérance. Le rapport indique combien de portions ont été écartées avant la création des contraintes automatiques. Le calcul du chemin optimal s’exécute en arrière-plan. En bas de l’atelier, la barre indique la phase en cours et le bouton **Arrêter le calcul** permet de revenir aux réglages.
- Les boutons **Par défaut** réinitialisent chacun leur groupe de réglages. **Tout par défaut** réinitialise l’ensemble de l’atelier.
- L’accrochage propose l’origine, les sommets, points caractéristiques des objets visibles et intersections entre segments droits. **Tab** parcourt les points proches et **Espace** suspend l’accrochage quand la zone de dessin a le focus. La grille et son accrochage se règlent séparément dans le panneau.
- Les pictogrammes d’aimantation apparaissent à côté du curseur. Pendant l’édition ou le déplacement, ils indiquent les points effectivement aimantés. Le pictogramme de coïncidence ou de raccord peut accompagner celui du point visé.
- Les outils de modification de la barre du haut ouvrent leurs options à droite. Sélectionner avant ou après avoir choisi l’outil. Depuis un champ, **Entrée** confirme d’abord la valeur, et un second appui applique la commande. En dehors d’un champ, **Appliquer** ou **Entrée** exécute la commande et conserve l’outil et la sélection pour la répéter. **Échap** ou un autre outil quitte la commande. **Suppr** supprime la sélection. Ctrl+Z annule et Ctrl+Y ou Ctrl+Maj+Z rétablit.

## Fichiers

Deux tracés ouverts du même calque se joignent automatiquement lorsque leurs extrémités se rencontrent pendant le dessin, l’édition ou le déplacement. Si le raccord boucle sur le départ, le résultat devient un contour fermé. L’accrochage aide à faire coïncider les extrémités lors d’un glisser. Lorsque plusieurs tracés se rencontrent au même point, ils restent séparés pour éviter un raccord arbitraire. Ctrl+Z annule ensemble le geste et le raccord.

Le raccord conserve la géométrie des arcs et des Béziers. Une courbe créée avec la plume devient une suite de portions Bézier cubiques dans le tracé mixte. Les poignées de plume ne sont alors plus disponibles. Le fichier VCV conserve le tracé mixte, et le DXF 2000 exporte ses portions exactes en entités séparées lorsqu’il contient des Béziers.

Le projet est un JSON versionné. La version 1 contient l’unité DXF, les calques et les entités. L’application écrit des **.vcv** et lit aussi les **.vvec** de même structure. Les pièces jointes citent ces deux extensions. Le format du précédent exécutable n’a pas été confirmé.

L’import DXF texte lit LINE, CIRCLE, ARC, les polylignes 2D avec segments courbes, les ellipses entières et les splines correspondant à un Bézier cubique non rationnel. Le statut indique les familles d’entités ignorées et signale l’hypothèse du millimètre en l’absence d’unité. Les blocs, textes, entités 3D et DXF binaires restent hors périmètre. Les objets non pris en charge sont omis du projet importé.

Les exports DXF 2000, DXF R14 et SVG conservent les cercles, arcs, ellipses et Béziers sous forme de courbes. Le DXF R12 représente les ellipses et Béziers par des polylignes. Les profils R12 et R14 expriment les coordonnées en millimètres. Les traits de construction peuvent être inclus sur demande. Les points de construction restent dans le projet VCV. Le SVG conserve les noms, couleurs et états de visibilité des calques et écrit directement les coordonnées dans la page. Si les coordonnées sont positives, le POA correspond au coin inférieur gauche de la page.

## Organisation

- **geometry.js** porte les primitives 2D et les transformations.
- **constraints.js** porte les relations géométriques et leur résolution.
- **formats.js** gère le projet et les échanges DXF.
- **app.js** relie les commandes, l’historique, les calques et le rendu Canvas.

Cette base privilégie la prise en main et les outils de dessin. Les cotations pilotantes, les plugins tiers, les booléens et le contrôle approfondi des contours restent à développer. L’objectif de 200 000 segments reste à mesurer. Le lanceur Windows utilise un navigateur local. Un emballage de bureau autonome et la validation Linux/macOS restent à faire.

## Tests

Avec Node.js installé, lancer `node --test` depuis le dossier du projet.


## Sélection, contraintes et aimantation

- Saisir le corps d’un segment pour le translater. Sur une polyligne, les segments voisins se raccordent aux extrémités déplacées. Double-cliquer sur le trait pour basculer entre le segment et l’objet entier.
- Glisser l’extrémité d’un segment droit pour changer sa longueur et son angle en un seul geste. Pour conserver son axe, appuyer sur Maj après avoir saisi l’extrémité. Sur un sommet partagé, les côtés voisins restent raccordés. Les extrémités superposées de plusieurs objets sont aussi considérées comme communes, y compris sur un calque masqué.
- En choisissant la contrainte d’abord, cliquer sur les éléments dans la zone de dessin. L’outil reste actif jusqu’à Échap. En sélectionnant d’abord avec un clic puis Maj+clic, le bouton applique directement la contrainte si les éléments conviennent.
- **Horizontale**, **Verticale** et **Parallèle** visent les segments droits. **Coïncidente** vise deux points. **Égale** ajuste deux longueurs de segments ou deux rayons. **Tangente** vise un segment et un arc ou cercle, ou deux éléments circulaires. **Symétrie** utilise un segment comme axe et deux points. **Verrouillée** immobilise un point ou un élément.
- **Aimantation** aide à placer les points. **Coïncidence automatique**, activée par défaut et réglable séparément, mémorise les sommets qui se rejoignent au dessin ou au déplacement même quand les objets restent distincts. Utiliser le clic droit pour retirer une contrainte.
- Le fichier VCV mémorise les nouvelles relations. Les anciens projets gardent leur géométrie lors de l’ouverture, et leurs divisions d’angle sont retirées. Le DXF exporte la géométrie résultante.
- Pendant un déplacement, l’aperçu recalcule les éléments liés jusqu’à environ 25 fois par seconde, avec un budget de calcul court. Les groupes trop grands ou les positions difficiles à résoudre gardent le dernier aperçu cohérent jusqu’au calcul complet au relâchement.
- Le bouton **Mode sombre / Mode clair** bascule l’interface et le fond du dessin. Le navigateur mémorise le choix si son stockage local est disponible.

## Cotation intelligente

Avec **Cotation intelligente (I)**, sélectionner un segment ou deux points. Poser la cote près du segment pour mesurer sa longueur réelle, au-dessus ou au-dessous pour sa distance horizontale, ou sur le côté pour sa distance verticale. Le panneau permet de choisir explicitement le type. La cote conserve la mesure choisie lorsque la géométrie est modifiée.

Cliquer sur deux segments avant de poser la cote. Pour des segments non parallèles, déposer la cote dans le secteur voulu pour choisir l’angle. Pour des segments parallèles, la cote mesure leur écart perpendiculaire. Cliquer sur un point et un segment, dans l’un ou l’autre ordre, pour coter la distance perpendiculaire à la droite du segment.

Cliquer sur le bord d’un cercle pour son diamètre, ou sur son centre puis sur son bord pour son rayon. En posant la cote, valider la valeur proposée ou saisir une valeur pour redimensionner la géométrie. Le double-clic permet de la modifier plus tard et le clic droit de la retirer. Avec **Sélection et déplacement (V)**, glisser le texte d’une cote pour déplacer son annotation sans changer sa valeur.

Si les contraintes existantes déterminent déjà la mesure, la cote est posée comme cote pilotée. Elle s’affiche entre parenthèses, suit la géométrie et un message l’indique à la pose. Cliquer sur le texte d’une cote avec **V** épaissit son tracé. **Suppr** retire la cote sélectionnée.

Les nouvelles cotes appartiennent au calque actif. Pour une cote d’un ancien projet, le calque du premier élément coté sert de référence. Seules les cotes du calque actif et visible sont affichées. Le curseur **Opacité des cotes**, en bas du panneau des calques, va de 0 % à 100 % et part de 60 %. Les cotes à la pose ou en cours d’édition restent opaques.

Glisser le corps d’un contour fermé coté le translate d’un bloc. Un triangle dont les trois côtés sont cotés en longueur se translate aussi depuis un sommet. Pour les autres sommets d’un contour coté, un repère montre la position demandée et le calcul s’effectue au relâchement. Un déplacement incompatible ou qui retournerait le contour est rejeté et la géométrie initiale est conservée.

L’outil **Point de construction (N)** ajoute un point sélectionnable et utilisable pour l’aimantation, les contraintes ou les cotes. Les points de construction et les annotations de cotation restent dans le VCV. Le DXF conserve la géométrie obtenue.


## Menus et raccourcis de contraintes

Le menu **Fichier** distingue l’ouverture d’un projet et l’import d’un DXF. **Enregistrer sous** (Ctrl+Maj+S) permet de choisir une nouvelle destination ou un nouveau nom. Lorsque le navigateur permet l’écriture directe, **Enregistrer** réutilise le fichier choisi pendant la session. Sinon, le navigateur gère les téléchargements.

Le menu **Contrainte** donne accès à chaque commande. Cliquer sur son libellé pour l’utiliser, ou sur l’œil à droite pour afficher ou masquer son raccourci dans la barre d’outils. Le choix est mémorisé dans le navigateur si son stockage local est disponible.

## Modifier une sélection

**Échap** quitte l’outil actif et revient à **Sélection**. Depuis un champ de paramètre, le premier appui annule l’édition du champ. Le suivant quitte l’outil.

En sélection manuelle, glisser avec plusieurs objets sélectionnés translate tout l’ensemble sans supprimer de relation. Si un verrou ou une autre contrainte empêche ce déplacement, il est annulé. La commande **Déplacer** du haut accepte un déplacement relatif ou la position absolue d’un point de référence. Le centre de l’ensemble sert de référence par défaut. **Choisir dans le dessin** permet d’aimanter cette référence à un sommet, un milieu, un centre ou une intersection. La commande explicite peut retirer les relations incompatibles.

- **Ctrl+C**, **Ctrl+X** et **Ctrl+V** utilisent le presse-papiers interne de Velocivector. Dans le panneau de sélection, cocher les cotes et contraintes à emporter. Le collage est légèrement décalé sur le calque actif. Les relations dont certaines références manquent sont omises et signalées.
- **Tourner** sélectionne un tracé ou un ensemble contigu par clic bref. Maintenir et glisser sur un élément sélectionné oriente l’ensemble autour du centre de sa sélection. Le pivot peut aussi être redéfini dans le dessin ou par coordonnées. Le sens horaire est négatif et l’angle se reboucle à ±180°.
- **Mise à l’échelle** permet de glisser les poignées du cadre. Le cadenas bloque ou libère les proportions. Le pivot peut être choisi et **Adapter les cotes** recalcule les valeurs compatibles. Une mise à l’échelle non uniforme peut produire des ellipses et des arcs d’ellipse.
- **Miroir** affiche ensemble les choix horizontal, vertical et segment. Les axes horizontal et vertical passent par l’origine du dessin par défaut. Choisir un pivot pour les décaler. **Copie miroir** conserve les originaux.
- **Inverser** affiche des flèches d’orientation à intervalles réguliers à l’écran. **Inverser** et **Éclater** attendent la validation dans le panneau. **Fermer** agit sur chaque tracé ouvert sélectionné dont les extrémités sont assez proches. La tolérance de départ est **0,1 mm**. Le bouton **Par défaut** restaure ce seuil après personnalisation.
- Une modification explicite retire les cotes et contraintes devenues incompatibles. Les relations retirées clignotent trois fois en rouge avant de disparaître en fondu, sur 1,25 seconde. Ctrl+Z restaure les relations et la géométrie ensemble. Lors d’une copie, les relations des originaux restent en place et le statut signale celles qui n’ont pas pu être reprises.

Dans **Fichier → Préférences → Curseurs**, choisir la forme pour chaque comportement et la couleur pour chaque outil. Une même forme peut servir à la sélection de plusieurs outils tout en gardant leur couleur. Sur le cadre d’échelle, la direction de la flèche suit le côté ou le coin survolé, et la double flèche signale un glisser en cours.

Dans la section **Indices d’aimantation**, choisir les pictogrammes visibles et leur coin préféré. Le coin supérieur droit est utilisé par défaut. Velocivector choisit un autre coin si le tracé occupe cet espace ou si le pictogramme sortirait de la zone de dessin.


Pour translater un ensemble de segments orientés reliés par leurs extrémités, glisser le corps de l’un des segments en mode Sélection. Le glisser sur une extrémité conserve le comportement d’édition du sommet.


## Utiliser une image de référence

Ouvrir **Fichier → Importer une image…** et choisir un fichier PNG, JPEG (y compris JFIF), AVIF, WebP ou GIF. L’atelier permet de comparer le résultat à l’original, de régler la luminosité et le contraste, et de protéger plusieurs couleurs prélevées à la pipette. La tolérance élargit la sélection aux teintes proches. Le curseur d’opacité règle les pixels non protégés. Le VCV conserve l’encodage d’origine sans retouche et enregistre le résultat en PNG pleine résolution après retouche. Les images animées s’affichent comme références fixes.

L’image est placée derrière le dessin dans un calque matriciel. La taille initiale suit une résolution de référence de 96 pixels par pouce. Sélectionner le calque pour régler sa rotation autour du centre, son échelle et ses opacités active et inactive. **Appliquer** les enregistre dans le projet. Les exports DXF et SVG contiennent la géométrie vectorielle.

- **Calibrer** mesure une distance entre deux points de l’image. Saisir la distance réelle dans les unités du dessin. Le premier point reste en place pendant le redimensionnement.
- **Tourner** utilise le point cliqué comme pivot. Glisser horizontalement pour tourner et s’en écarter verticalement pour affiner le geste. **Maj** aimante la rotation par pas de 15° et **Ctrl** divise l’amplitude du geste par quatre.
- **Caler sur le POA** déplace l’image pour que le point cliqué corresponde à l’origine absolue.
- Double-cliquer sur le nom d’un calque pour le renommer. Les nouveaux calques matriciels sont nommés **Image 1**, **Image 2**, etc.
