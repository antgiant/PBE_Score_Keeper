🌐 [English](README.md) | [Español](README.es.md) | [Français](README.fr.md) | [Secret Code](README.pig.md)

# PBE Marqueur
Un outil pour aider à suivre les scores de l'Expérience Biblique Pathfinder (PBE) (aussi connu sous le nom de Bible Bowl) par bloc et équipe.

## Note sur le Stockage des Données
Les données sont stockées uniquement sur votre appareil et ne sont partagées d'aucune manière avec aucun serveur. Cela signifie que ces données sont uniquement sur votre appareil actuel, et que vous devez utiliser les options Exporter les Données sous Importer/Exporter si vous avez besoin de sauvegarder des copies de ces données.

## Note sur la Synchronisation en Temps Réel
La fonction de Synchronisation en Temps Réel permet à plusieurs appareils de collaborer sur la même session en utilisant la communication pair à pair. Bien que le système de synchronisation inclue plusieurs protections contre la perte de données, il existe un scénario extrêmement rare qui pourrait entraîner une fusion inattendue des données :

**Conditions requises (toutes doivent se produire simultanément) :**
1. Le serveur de synchronisation est temporairement indisponible
2. Deux utilisateurs créent des salles exactement au même moment
3. Les deux génèrent aléatoirement le même code de salle à 6 caractères (probabilité de 1 sur 1 073 741 824)
4. Les deux utilisateurs entrent le même mot de passe

Si les quatre conditions sont réunies, les deux sessions séparées fusionneraient leurs données. Ce scénario est astronomiquement improbable en pratique, mais est documenté ici par souci de complétude. Utiliser la fonction de synchronisation sans mot de passe (par défaut) empêche entièrement ce problème lorsque le serveur est disponible.

## Contribuer une Traduction

Vous voulez aider à traduire PBE Marqueur dans votre langue ? Nous serions ravis de votre aide !

**Pour contribuer une traduction :**
1. Copiez `scripts/i18n/fr.js` comme point de départ
2. Traduisez toutes les chaînes de caractères dans votre langue
3. Soumettez une [Pull Request](https://github.com/antgiant/PBE_Score_Keeper/pulls) avec votre traduction

**Vous ne savez pas comment créer une Pull Request ?** Pas de problème ! Vous pouvez :
- [Ouvrir un Issue](https://github.com/antgiant/PBE_Score_Keeper/issues/new?title=Nouvelle%20Traduction:%20[Nom%20de%20la%20Langue]&body=Je%20souhaite%20contribuer%20une%20traduction%20pour%20[langue].%0A%0A) pour nous faire savoir que vous aimeriez aider
- Joignez votre fichier traduit à l'issue et nous l'ajouterons pour vous

Voir [AGENTS.md](AGENTS.md#adding-a-new-language) pour des instructions détaillées sur le format de traduction.

## Détails Techniques
[Détails Techniques](TECH.md)
