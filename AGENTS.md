# Velocivector 2D CAD

## Traduction des nouveautés

- Pour chaque nouvel outil ou changement visible, mettez à jour dans le même lot les libellés, options, infobulles, messages et textes d’accessibilité. Prévoyez aussi sa fiche d’aide dans les rubriques existantes quand elle s’applique.
- Le français est la langue de référence. Mettez à jour `locale-en.js`, `help-fr.js`, `help-en.js` et tous les catalogues concernés sous `locales/`. Vérifiez que les nouveaux libellés figurent dans chaque langue.
- Employez le vocabulaire de CAO courant de chaque langue. Gardez les identifiants de fiche et les paramètres entre accolades, et lisez les raccourcis depuis la configuration active.
- Chargez les fichiers de langue localement à la demande. L’ouverture du dessin et l’usage de l’interface restent possibles hors ligne.
- Vérifiez le changement de langue sans rechargement, la langue mémorisée et les mises en page de droite à gauche quand elles sont concernées. Lancez `node --test`.
