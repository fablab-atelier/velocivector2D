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

Enregistrez l’extension une fois, pendant l’exécution de `plugin.js`. Le dossier doit porter le même identifiant. Les identifiants d’entrées doivent être uniques dans une extension. Les entrées peuvent partager leurs fonctions de calcul. Utilisez `api.t(clé)` pour traduire leurs libellés. L’hôte essaie la langue active, l’anglais, le français, puis la traduction hôte de la clé. Les codes disponibles sont `fr en es de ja pt ru it nl pl tr id zh fa cs`.

| Entrée | Signature | Intégration |
|---|---|---|
| `commands` | `{id, title, run(api)}` | Commande dans le menu Extensions. Peut calculer un lot ou lire la sélection. |
| `workshops` | `{id, title, mount(container, api)}` | Fenêtre modale. Construisez votre interface dans le conteneur fourni. Retournez, si nécessaire, une fonction de nettoyage synchrone. |
| `importers` | `{id, title, accept, read(file, api)}` | Ouvre un sélecteur de fichier depuis Extensions. `read` renvoie un lot optionnel, avec `units` à `mm` ou `document`, ou `null` pour annuler. L’insertion cible le calque actif à l’ouverture du fichier. |
| `exporters` | `{id, title, extension, mime, write(drawing, options, api)}` | Format d’export sélectionnable. Retournez du texte, un Blob, un ArrayBuffer ou une vue binaire. |
| `postprocessors` | Même signature que `exporters` | Sortie de FAO sélectionnable dans l’export rapide. Le plugin calcule ses parcours, paramètres et dialecte. |

`run`, `read` et `write` peuvent être asynchrones. `title` est une clé de traduction. `extension` inclut le point et utilise des lettres minuscules ou chiffres. L’export reçoit une copie du dessin filtré par la sélection ou les calques. L’option `includeConstruction` est à respecter dans le writer. Les textes inclus sont transmis sous forme de contours.

### Contexte passé aux fonctions

- `drawing()` renvoie une copie du document VCV courant, avec ses calques, géométries, cotes et contraintes.
- `selection()` renvoie une copie des tracés sélectionnés, en tenant compte des portions sélectionnées.
- `activeLayer()` renvoie le nom du calque actif. `units()` donne son code DXF et le nombre de millimètres par unité du document.
- `insert(batch, {layer, units, offset})` ajoute un lot validé en une action d’historique et renvoie les identifiants définitifs. Valeurs par défaut : calque actif, unités du document, décalage `[0, 0]`. `offset` utilise les unités d’entrée. Le calque cible doit être vectoriel et visible.
- `preview(canvas, entities)` cadre un aperçu 2D dans un canvas. Utilisez une taille de canvas explicite et appelez cette fonction quand les paramètres changent.
- `geometry.trace(entity, scale)` donne les points d’un tracé échantillonné. `geometry.length(entity)` estime sa longueur dans les unités de la géométrie.
- `setupNumber(input)` équipe un champ numérique de l’évaluateur d’expressions du logiciel. Lisez ensuite `input.valueAsNumber`.
- `t(key)`, `status(text)`, `close()`, `openFile(accept)` et `download(data, filename, mime)` gèrent les interactions de l’extension.

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

## Atelier de transmissions fourni

Ouvrez **Extensions → Atelier de transmissions**. Choisissez un pignon extérieur, un pignon avec couronne intérieure, une crémaillère avec pignon facultatif, un train en série, une dérivation, un train planétaire ou des poulies et une courroie GT2. Les champs s’adaptent au type et l’aperçu se met à jour. Le module est en millimètres, avec des suggestions courantes. L’angle de pression par défaut est de 20°. Pour GT2, l’atelier propose des pas de 2 et 3 mm.

L’atelier calcule les diamètres primitifs, les entraxes d’engrènement, les rapports et la longueur primitive de la courroie ouverte. La couronne d’un planétaire est calculée à partir du soleil et d’un satellite. Le calcul vérifie la répartition des satellites. Une seule valeur dans le mode GT2 génère une poulie seule. La longueur affichée d’une courroie dépend de l’entraxe saisi et peut correspondre à un nombre de pas non entier.

L’insertion se fait au POA du dessin. Les cercles primitifs sont des traits de construction avec une cote de diamètre et une coïncidence entre leur centre et le centre théorique du profil. La crémaillère porte une ligne primitive horizontale. Les profils insérés sont des géométries VCV ordinaires. Modifier une cote primitive n’actualise pas la denture et le VCV ne conserve pas les paramètres de l’atelier.

Les dentures droites utilisent des développantes échantillonnées et une transition de pied simplifiée. Les gorges GT2 sont indicatives. L’atelier ne calcule pas les jeux, les profils déportés, les raccordements d’outil, la résistance, ni toutes les interférences. Pour fournir une denture prête à usiner, il faut utiliser la spécification du profil et les tolérances du fabricant. [Calcul des dimensions KHK](https://khkgears.net/new/gear_knowledge/gear_technical_reference/calculation_gear_dimensions.html) · [Couronnes intérieures KHK](https://khkgears.net/pdf/2025/internal-gears.pdf) · [Poulies Gates GT2](https://www.gates.com/us/en/power-transmission/power-transmission-components/sprockets.p.7709-000000-000000.7842-06002.html)
