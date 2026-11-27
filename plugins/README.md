# Extensions Velocivector · API v1

## Installer ou retirer une extension

Créez un dossier `plugins/<id>/` et déposez-y un fichier `plugin.js`. Au prochain démarrage via **Lancer.cmd**, le lanceur Windows découvre les extensions, puis Velocivector affiche leurs commandes dans **Extensions**. Les formats d’export apparaissent dans **Fichier → Export rapide**. Pour retirer une extension, sortez son dossier de `plugins/` et relancez l’application. Les entités déjà créées restent dans le dessin VCV.

L’identifiant doit commencer par une lettre minuscule et contenir au plus 48 caractères parmi les lettres minuscules, chiffres et tirets. L’ouverture directe d’`index.html` charge l’atelier fourni. Pour tester d’autres extensions sans le lanceur, ouvrez `index.html?plugins=transmissions,mon-extension`. Le navigateur ne peut pas énumérer lui-même le contenu d’un dossier local.

Un plugin s’exécute comme le code de Velocivector dans la fenêtre. Installez uniquement du code de confiance. L’API n’ouvre aucun service distant et ne lance aucune commande machine. Les fichiers de FAO éventuellement produits passent par l’export habituel.

## Écrire un plugin

```javascript
VelocivectorPlugins.register({
  id: 'exemple',
  apiVersion: 1,
  messages: {
    fr: { create: 'Créer un cercle' },
    en: { create: 'Create a circle' }
  },
  commands: [{
    id: 'create-circle',
    title: 'create',
    run(api) {
      api.insert({ entities: [{ type: 'circle', c: [0, 0], r: 12 }] }, { units: 'mm' });
    }
  }]
});
```

Enregistrez l’extension une fois, pendant l’exécution de `plugin.js`. Le dossier doit porter le même identifiant. Les identifiants d’entrées doivent être uniques dans une extension. Utilisez `api.t(clé)` pour traduire les textes fournis dans `messages`. L’hôte essaie la langue choisie pour le plugin, puis l’anglais, le français et la traduction hôte de la clé. Par défaut, le plugin suit la langue du logiciel si elle est disponible dans son catalogue. Chaque plugin distribue ses catalogues et peut déclarer son propre ensemble de langues.

Pour charger une bibliothèque locale avant l’enregistrement, appelez `VelocivectorPlugins.registerAsync(id, async load => { await load('mon-plugin/calcul.js'); return manifest; })`. Les chemins sont relatifs à `plugins/` et désignent des fichiers JavaScript classiques. Les deux ateliers fournis partagent un fichier de calcul. Chacun charge un fichier `messages.js` dans son propre dossier. La page principale ne référence aucun de ces fichiers.

### Préférences et À propos

Chaque atelier propose **Atelier**, **Préférences** et **À propos**. Déclarez ses options dans le manifeste et fournissez des traductions pour les libellés.

```javascript
preferences: [
  { key: 'markPitch', label: 'markPitch', default: true },
  { key: 'tolerance', label: 'tolerance', default: 0.05, min: 0 },
  { key: 'style', label: 'style', default: 'plain', options: ['plain', 'fine'] }
],
about: {
  version: '0.1.0',
  description: 'about.description',
  authors: ['Nom du développeur'],
  license: 'GNU GPL v3'
}
```

Une option booléenne produit une case à cocher, une option numérique un champ compatible avec les expressions et `options` une liste de choix. Un texte simple produit un champ texte. `label`, `prefix` facultatif, les valeurs de liste et `about.description` sont traduits via `messages`. Utilisez les clés locales `ui.workshop`, `ui.preferences`, `ui.about`, `ui.close`, `ui.automatic`, `ui.language`, `ui.reset` et `ui.next` pour traduire les contrôles de la fenêtre du plugin.

La langue et les valeurs de départ sont mémorisées séparément pour chaque identifiant de plugin. Appeler `api.toolDefault(key, fallback)` à l’ouverture applique les valeurs enregistrées. Modifier une valeur de départ prépare la prochaine ouverture. Quand la langue change, l’hôte recrée l’atelier. Pour conserver une saisie en cours, renvoyez `{snapshot(), dispose?()}` depuis `mount`. L’hôte transmet la valeur de `snapshot()` comme troisième argument au remontage. Une fonction de nettoyage seule reste prise en charge.

Par défaut, la fenêtre hôte s’ouvre en haut à droite sur toute la largeur disponible. Sa hauteur suit le contenu dans la limite de la zone visible du navigateur. La poignée en bas à droite fixe ensuite ses dimensions. La barre de titre permet de la déplacer dans la zone visible du navigateur. Les flèches du clavier déplacent le titre focalisé ou redimensionnent depuis la poignée focalisée. La position et la taille sont mémorisées par atelier. Le contenu défile dans son panneau lorsque la place manque. Le plugin se contente de remplir le conteneur de `mount`. Il peut observer ce conteneur avec `ResizeObserver` pour adapter un aperçu. Les clés `ui.move` et `ui.resize` traduisent les contrôles de fenêtre.

| Entrée | Signature | Intégration |
|---|---|---|
| `commands` | `{id, title, run(api)}` | Commande dans le menu Extensions. Peut calculer un lot ou lire la sélection. |
| `workshops` | `{id, title, mount(container, api, snapshot?)}` | Fenêtre modale avec les préférences et la présentation du plugin. |
| `importers` | `{id, title, accept, read(file, api)}` | Ouvre un sélecteur de fichier depuis Extensions. `read` renvoie un lot optionnel, avec `units` à `mm` ou `document`, ou `null` pour annuler. L’insertion cible le calque actif à l’ouverture du fichier. |
| `exporters` | `{id, title, extension, mime, write(drawing, options, api)}` | Format d’export sélectionnable. Retournez du texte, un Blob, un ArrayBuffer ou une vue binaire. |
| `postprocessors` | Même signature que `exporters` | Sortie de FAO sélectionnable dans l’export rapide. Le plugin calcule ses parcours, paramètres et dialecte. |

`run`, `read` et `write` peuvent être asynchrones. `title` est une clé de traduction. `extension` inclut le point et utilise des lettres minuscules ou chiffres. L’export reçoit une copie du dessin filtré par la sélection ou les calques. L’option `includeConstruction` est à respecter dans le writer. Les textes inclus sont transmis sous forme de contours.

### Contexte passé aux fonctions

Dans tout atelier qui présente un aperçu et un rapport, **le rapport est prioritaire sur l’aperçu**. Placez un élément `plugin-workspace` à la racine du conteneur d’atelier, avec le `plugin-report` en dernier enfant. Le rapport reste ancré en bas. La zone d’aperçu prend l’espace restant et son ratio peut varier au redimensionnement. Le dessin conserve ses proportions à l’intérieur de cette zone. Si le rapport est trop long pour l’espace disponible, faites-le défiler dans sa propre zone.

- `drawing()` renvoie une copie du document VCV courant, avec ses calques, géométries, cotes et contraintes.
- `selection()` renvoie une copie des tracés sélectionnés, en tenant compte des portions sélectionnées.
- `activeLayer()` renvoie le nom du calque actif. `units()` donne son code DXF et le nombre de millimètres par unité du document.
- `insert(batch, {layer, units, offset})` ajoute un lot validé en une action d’historique et renvoie les identifiants définitifs. Valeurs par défaut : calque actif, unités du document, décalage `[0, 0]`. `offset` utilise les unités d’entrée. Le calque cible doit être vectoriel et visible.
- `preview(canvas, entities)` cadre un aperçu 2D dans un canvas. Utilisez une taille de canvas explicite et appelez cette fonction quand les paramètres changent.
- `geometry.trace(entity, scale)` donne les points d’un tracé échantillonné. `geometry.length(entity)` estime sa longueur dans les unités de la géométrie.
- Pour créer plusieurs calques dans une seule insertion, fournissez leurs libellés dans `batch.layers` et le libellé de destination dans `entity.layer`. Les noms existants sont évités par un suffixe numéroté.
- `setupNumber(input)` équipe un champ numérique de l’évaluateur d’expressions du logiciel. Lisez ensuite `input.valueAsNumber`.
- `t(key)`, `status(text)`, `close()`, `openFile(accept)` et `download(data, filename, mime)` gèrent les interactions de l’extension.
- `language()` renvoie la langue effective du plugin pour formater les nombres ou dates. `toolDefault(key, fallback)` lit sa préférence de départ isolée.

### Géométrie et relations

Le modèle utilise X vers la droite et Y vers le haut. Les angles géométriques sont en radians. Les structures natives sont documentées dans [Fichiers et organisation](../README.md). Les formes les plus courantes sont les suivantes.

```javascript
{ type: 'line', p: [[0, 0], [25, 0]] }
{ type: 'poly', p: [[0, 0], [25, 0], [10, 15]], closed: true }
{ type: 'circle', c: [0, 0], r: 12, construction: 'dashed' }
{ type: 'arc', c: [0, 0], r: 12, a: 0, s: Math.PI / 2 }
```

Ajoutez une `key` unique à chaque géométrie référencée. Par défaut, la clé est l’index de l’entité sous forme de chaîne. Les relations insérées référencent les clés du même lot. Un lot invalide est refusé en entier. Le moteur vérifie la cohérence de la géométrie et que les relations sont déjà satisfaites. Le solveur ne corrige pas le dessin pendant l’insertion.

```javascript
api.insert({
  entities: [{ key: 'pitch', type: 'circle', c: [0, 0], r: 20, construction: 'dashed' }],
  constraints: [{
    type: 'dimension', mode: 'diameter',
    refs: [{ key: 'pitch', kind: 'edge', index: 0 }],
    value: 40, offset: [23, 23]
  }]
}, { units: 'mm', offset: [120, 80] });
```

Utilisez `kind: 'point'` ou `kind: 'edge'` et l’index de référence natif. Un cercle expose son centre au point 0 et son contour à l’arête 0. Un polygone fermé expose son centre théorique après son dernier sommet. Les modes de cote et la structure de référence sont définis dans [constraints.js](../constraints.js). Les cotes linéaires sont converties avec la géométrie. Les contraintes contenant leurs propres coordonnées absolues, comme le verrouillage ou une coïncidence avec une origine, sont hors du contrat d’insertion avec conversion ou décalage. L’API v1 peut lire le document et insérer des lots. Elle ne fournit pas de modification arbitraire des entités existantes ni d’API distante.

Les traducteurs DXF ou d’autres formats peuvent rendre un lot normalisé depuis un importer. Un atelier métier peut calculer puis prévisualiser avant insertion. Un agent peut produire le même lot JSON et le remettre à une commande locale avec confirmation utilisateur. Le [contrat compact](API-AGENT.md) résume les structures utiles à un agent.

## Ateliers engrenage et poulie et courroie

L’**Atelier engrenage** crée des pignons, couronnes, crémaillères et trains. L’**Atelier poulie et courroie** propose GT2 2M et 3M, HTD 3M et 5M, T2.5, T5 et XL. Une seule valeur de denture génère une poulie seule.

Pour deux poulies, saisissez le périmètre sur la ligne primitive de la courroie ouverte. À la validation, l’atelier ajuste la longueur au multiple du pas le plus proche et signale la correction en rouge. À égale distance, il retient le multiple inférieur. L’atelier inverse le calcul géométrique des deux tangentes et des deux arcs pour afficher l’entraxe. Ce pilotage s’applique dans l’atelier. [Définition de la longueur primitive](https://assets.gates.com/content/dam/gates/home/knowledge-center/resource-library/catalogs/light-power-and-precision-manual.pdf)

L’insertion se fait au POA du dessin. Les cercles primitifs sont des traits de construction avec une cote de diamètre et une coïncidence entre leur centre et le centre théorique du profil. La crémaillère porte une ligne primitive horizontale. Les profils insérés sont des géométries VCV ordinaires. Modifier une cote primitive n’actualise pas la denture et le VCV ne conserve pas les paramètres de l’atelier.

Chaque roue, crémaillère, poulie et courroie est insérée dans son propre groupe au sein du calque. Pour produire des groupes depuis un plugin, donnez la même valeur `vectorGroup` aux entités d’une pièce dans le lot. L’hôte crée des identifiants distincts à chaque insertion. Dans le dessin, `Ctrl + G` groupe la sélection et `Ctrl + Maj + G` la dégroupe. Les raccourcis sont modifiables. Les mêmes commandes sont disponibles au clic droit.

Les dentures droites utilisent des développantes échantillonnées et une transition de pied simplifiée. Les gorges GT2 sont indicatives. L’atelier ne calcule pas les jeux, les profils déportés, les raccordements d’outil, la résistance, ni toutes les interférences. Pour fournir une denture prête à usiner, il faut utiliser la spécification du profil et les tolérances du fabricant. [Calcul des dimensions KHK](https://khkgears.net/new/gear_knowledge/gear_technical_reference/calculation_gear_dimensions.html) · [Couronnes intérieures KHK](https://khkgears.net/pdf/2025/internal-gears.pdf) · [Poulies Gates GT2](https://www.gates.com/us/en/power-transmission/power-transmission-components/sprockets.p.7709-000000-000000.7842-06002.html)

### Atelier profils d’aile

Sélectionnez une configuration RC de départ, puis choisissez un profil seul ou une grappe de nervures pour une demi-aile. Pour une grappe, l’envergure saisie est celle de l’aile entière. Le générateur interpole les profils entre l’emplanture et le saumon, applique le recul du bord d’attaque et répartit le vrillage autour du quart de corde. Les vingt préréglages NACA sont calculés à partir du code à quatre chiffres avec un bord de fuite fermé. Vous pouvez également saisir un autre code de cette famille.

Les trois logements optionnels acceptent une section ronde ou rectangulaire. Leur axe est défini par les positions à l’emplanture et au saumon, mesurées en pourcentage de corde depuis le bord d’attaque. Le jeu s’ajoute sur chaque côté. Le rapport indique les couples nervure / longeron dont le logement déborde. Le plan de demi-aile donne la position des nervures et les axes des longerons. Choisissez les éléments à insérer. Sur la planche de nervures, chaque contour et ses logements forment un groupe indépendant.

Les configurations RC servent de points de départ géométriques. Vérifiez le dimensionnement des longerons et le jeu de fabrication avant de découper.

Les nervures sont empilées verticalement et leurs contours sont des courbes de Bézier éditables. Le premier profil sert de support aux repères de réglage. Le bouton **Toutes les mesures** affiche l’ensemble des valeurs côte à côte dans le panneau de repères. Ces indications restent dans l’aperçu de l’atelier.

L’empennage horizontal optionnel comprend un plan, une ligne de charnière et un nombre réglable de nervures (cinq par défaut). Ses proportions de départ suivent la configuration RC. Les fuselages classique et effilé fournissent trois vues vectorielles à la même échelle. Ces plans paramétriques constituent des gabarits de conception à compléter avant fabrication.

Les champs affichent leurs plages de saisie. La compatibilité d’un logement dépend aussi du contour des nervures. Si la géométrie ne peut pas être générée, la validation rétablit la dernière valeur acceptée, signale le champ en rouge et affiche la cause dans le rapport.

La vue d’ensemble regroupe le plan vertical de demi-aile et les nervures dans une même colonne. L’empennage et le fuselage occupent les colonnes suivantes. Le choix **Vue à insérer** détermine les éléments ajoutés au dessin. Chaque panneau dispose de sa propre règle en millimètres, d’un zoom à la molette et d’un bouton de recentrage. Le glisser déplace le contenu dans le panneau. Les pièces sont insérées aux dimensions réelles.

Dans le panneau d’empennage, les nervures sont au-dessus du plan de demi-empennage. Le fuselage est présenté en trois vues superposées. Dans la vue de côté, la dérive prolonge le contour du fuselage avec des raccords tangents. Le profil de profondeur est inscrit dans ce contour. Les logements des longerons d’aile et des deux longerons d’empennage optionnels sont reportés en traits pleins.

La vue de côté repère la charnière du gouvernail de direction. Son contour individuel est placé sous les vues du fuselage et reprend exactement la géométrie du volet mobile. La zone d’aileron se règle en pourcentage de demi-envergure et de corde. Les lignes de charnière des gouvernes de roulis et de profondeur traversent en trait plein les nervures concernées et s’arrêtent sur leur contour.

Par défaut, l’atelier ouvre un avion école avec un fuselage effilé et un empennage assorti. Le placement manuel des ailerons accepte un début et une fin en pourcentage de demi-envergure ou en millimètres depuis l’emplanture. La gouverne de profondeur utilise toute la demi-envergure de l’empennage.

Au-dessus de la règle, le fuselage affiche sa longueur totale. Le plan de demi-aile affiche l’envergure totale, calculée à partir des deux demi-ailes et de la largeur du fuselage actif. Les deux valeurs sont arrondies à l’affichage au millimètre.

L’atelier insère les éléments choisis sur des calques distincts pour le plan de demi-aile, les nervures d’aile, le plan d’empennage, les nervures d’empennage, les vues du fuselage et le gouvernail. Seuls les calques utiles sont créés. Les noms en double reçoivent un suffixe numéroté. Une seule annulation retire les tracés et les calques de l’insertion.

### Atelier châssis de drone

Choisissez 4, 6 ou 8 hélices et un diamètre de 4, 5, 6, 8, 10 ou 12 pouces. La sélection propose un rayon d’implantation, une largeur de bras et un jeu de départ adaptés au diamètre. Le rayon minimal est recalculé selon le dégagement entre hélices et le corps central. En vue de dessus, le disque noir à 30 % matérialise le balayage de chaque hélice.

Les entraxes de la carte de vol et des moteurs sont éditables. Les trois modèles SpeedyBee préremplissent les entraxes et le diamètre des perçages. Le moteur accepte deux vis en ligne ou quatre en rectangle. Pour la caméra, le VTX et le récepteur, choisissez la plaque et la position du motif autour de l’origine. Un entraxe Y de 0 crée une paire de trous alignés.

Les deux plaques partagent les perçages d’entretoises. En vue de côté, les entretoises sont représentées par des rectangles à la hauteur demandée. L’atelier calcule la surface nette après déduction des trous et la masse à partir de l’épaisseur de chaque plaque et de la densité du stratifié. Le réglage de départ est de 1,55 g/cm³. La masse estimée couvre les plaques en carbone.

L’insertion crée deux calques à l’échelle réelle. Les disques d’hélices et la vue de côté servent de repères dans l’atelier. Les réglages vérifient les dégagements géométriques et fournissent une base de travail pour le dimensionnement du châssis.

[SpeedyBee F405 V4](https://www.speedybee.com/speedybee-f405-v4-bls-55a-30x30-fc-esc-stack/) · [SpeedyBee F405 Mini](https://www.speedybee.com/speedybee-f405-mini-bls-35a-20x20-stack/) · [SpeedyBee F745 AIO](https://www.speedybee.com/speedybee-f745-35a-25-5x25-5-aio-flight-controller/) · [Densités des stratifiés DragonPlate](https://dragonplate.com/solid-carbon-fiber-sheets-plates)
