/**
 * French Language Pack for PBE Score Keeper
 * Pack de Langue Française pour PBE Score Keeper
 * 
 * To add a new language, copy this file and:
 * 1. Rename to {language-code}.js (e.g., de.js for German)
 * 2. Update the register_i18n_language() call with your language code
 * 3. Update the 'name' to your language's name in that language
 * 4. Update 'locale' to the appropriate locale code for date formatting
 * 5. Set 'rtl' to true if your language is right-to-left
 * 6. Translate all strings in the translations object
 * 7. Add a <script> tag for it in index.html (after app-i18n.js)
 */
register_i18n_language('fr', {
  name: 'Français',
  locale: 'fr',
  rtl: false,
  translations: {
    "app": {
      "title": "PBE Marqueur",
      "theme": "Thème",
      "language": "Langue",
      "auto": "Auto"
    },
    "theme": {
      "system": "Système",
      "light": "Clair",
      "dark": "Sombre"
    },
    "config": {
      "title": "Configuration (Session/Manche/Jeu)",
      "instructions_title": "Instructions",
      "instructions": "Ceci est un marqueur pour l'Expérience Biblique Pathfinder (aussi connu sous le nom de Bible Bowl). Veuillez entrer votre nombre d'équipes ainsi que les blocs/groupes ci-dessous afin que la grille de pointage puisse être créée",
      "storage_title": "Note sur le Stockage des Données",
      "storage_note": "Les données sont stockées uniquement sur votre appareil et ne sont partagées d'aucune manière avec aucun serveur. Cela signifie également que si vous changez d'appareil, vos données n'apparaîtront pas sur le nouvel appareil.",
      "new_session": "Nouvelle Session",
      "enter_scores": "Entrer les Scores"
    },
    "teams": {
      "title": "Configurez vos Équipes",
      "count_one": "{{count}} équipe",
      "count_other": "{{count}} équipes",
      "team": "équipe",
      "teams": "équipes",
      "name_label": "Nom de l'Équipe {{number}} :",
      "score_label": "Score de {{name}}",
      "score_label_s": "Score de {{name}}"
    },
    "blocks": {
      "title": "Configurez vos Blocs/Groupes",
      "count_one": "{{count}} bloc/groupe",
      "count_other": "{{count}} blocs/groupes",
      "block": "bloc/groupe",
      "blocks": "blocs/groupes",
      "name_label": "Nom du Bloc/Groupe {{number}} :"
    },
    "points": {
      "title": "Points Maximum par Question",
      "count_one": "{{count}} point",
      "count_other": "{{count}} points",
      "point": "point",
      "points": "points",
      "possible": "Points Possibles pour la Question"
    },
    "rounding": {
      "title": "Arrondir le score de l'équipe en direct au total de la meilleure équipe ?",
      "yes": "Oui",
      "no": "Non"
    },
    "score_entry": {
      "title": "Saisie des Scores",
      "previous": "Question Précédente",
      "next": "Question Suivante",
      "new": "Nouvelle Question",
      "ignore": "Ignorer cette Question dans les Calculs de Score",
      "extra_credit": "Autoriser le Crédit Supplémentaire",
      "question": "Question",
      "block_group": "Bloc/Groupe"
    },
    "scores": {
      "team_exact": "Score par Équipe (Exact)",
      "team_rounded": "Score par Équipe (Arrondi)",
      "by_block": "Score par Bloc/Groupe",
      "team_and_block": "Score par Équipe et Bloc/Groupe",
      "question_log": "Journal des Questions"
    },
    "table": {
      "team_name": "Nom de l'Équipe",
      "percent": "Pourcentage",
      "score": "Score",
      "placement": "Classement",
      "block_name": "Nom du Bloc/Groupe",
      "question": "Question",
      "possible_points": "Points Possibles",
      "earned_points": "Points Gagnés",
      "total_points": "Points Totaux",
      "total_points_rounded": "Points Totaux (Arrondis)",
      "percent_rounded": "Pourcentage (Arrondi)",
      "score_rounded": "Score (Arrondi)",
      "placement_rounded": "Classement (Arrondi)",
      "ignore_question": "Ignorer la Question"
    },
    "placements": {
      "first": "Première Place",
      "second": "Deuxième Place",
      "third": "Troisième Place"
    },
    "history": {
      "title": "Historique",
      "change_log": "Journal des Modifications",
      "time": "Heure",
      "session": "Session",
      "action": "Action",
      "details_header": "Détails",
      "no_changes": "Aucun changement enregistré pour le moment. Faites quelques modifications pour les voir ici !",
      "global": "Global",
      "current_session": "Session Actuelle",
      "unknown_time": "Inconnu",
      "actions": {
        "change": "Modification",
        "rename_session": "Renommer la Session",
        "add_team": "Ajouter une Équipe",
        "delete_team": "Supprimer l'Équipe",
        "rename_team": "Renommer l'Équipe",
        "add_block": "Ajouter un Bloc/Groupe",
        "delete_block": "Supprimer le Bloc/Groupe",
        "rename_block": "Renommer le Bloc/Groupe",
        "change_max_points": "Modifier les Points Maximum",
        "rename_question": "Renommer la Question",
        "change_rounding": "Modifier l'Arrondi",
        "ignore_question": "Ignorer la Question",
        "include_question": "Inclure la Question",
        "enable_extra_credit": "Activer le Crédit Supplémentaire",
        "disable_extra_credit": "Désactiver le Crédit Supplémentaire",
        "clear_extra_credit": "Effacer le Crédit Supplémentaire",
        "extra_credit": "Crédit Supplémentaire",
        "set_question_points": "Définir les Points de Question",
        "change_question_block": "Changer le Bloc de Question",
        "score_change": "Changement de Score",
        "export_session": "Exporter la Session",
        "export_all_sessions": "Exporter Toutes les Sessions",
        "reorder_teams": "Réorganiser les Équipes",
        "reorder_blocks": "Réorganiser les Blocs/Groupes"
      },
      "details_templates": {
        "renamed": "Renommé \"{{old}}\" en \"{{new}}\"",
        "added": "Ajouté \"{{name}}\"",
        "deleted": "Supprimé \"{{name}}\"",
        "increased_max_points": "Points maximum augmentés de {{old}} à {{new}}",
        "decreased_max_points": "Points maximum réduits de {{old}} à {{new}}",
        "enabled_rounding": "Arrondi au total de la meilleure équipe activé",
        "disabled_rounding": "Arrondi désactivé",
        "set_ignored": "\"{{name}}\" défini comme ignoré",
        "set_included": "\"{{name}}\" défini comme inclus",
        "enabled_extra_credit": "Crédit supplémentaire activé pour \"{{name}}\"",
        "disabled_extra_credit": "Crédit supplémentaire désactivé pour \"{{name}}\"",
        "cleared_extra_credit": "Tout le crédit supplémentaire effacé pour \"{{name}}\"",
        "increased_extra_credit": "Crédit supplémentaire augmenté pour \"{{team}}\" sur \"{{question}}\" à {{value}}",
        "decreased_extra_credit": "Crédit supplémentaire réduit pour \"{{team}}\" sur \"{{question}}\" à {{value}}",
        "set_question_points": "Points maximum définis pour \"{{name}}\" de {{old}} à {{new}}",
        "changed_block": "\"{{question}}\" changé de \"{{old}}\" à \"{{new}}\"",
        "score_changed": "\"{{team}}\" sur \"{{question}}\" de {{old}} à {{new}}",
        "exported_session_yjs": "Session exportée en fichier .yjs",
        "exported_session_json": "Session exportée en fichier JSON",
        "exported_session_json_fallback": "Session exportée en fichier JSON (secours)",
        "exported_all_yjs": "Toutes les sessions exportées en fichier .yjs",
        "exported_all_json": "Toutes les sessions exportées en fichier JSON",
        "exported_all_json_fallback": "Toutes les sessions exportées en fichier JSON (secours)",
        "new_order": "Nouvel ordre : {{order}}"
      }
    },
    "advanced": {
      "title": "Avancé",
      "export_csv": "Exporter CSV",
      "export_team": "Exporter le Score par Équipe",
      "export_block": "Exporter le Score par Bloc/Groupe",
      "export_team_and_block": "Exporter le Score par Équipe et Bloc/Groupe",
      "export_question_log": "Exporter le Journal des Questions",
      "export_json": "Exporter pour Importation",
      "export_session": "Exporter la Session (Manche/Jeu)",
      "export_all": "Tout Exporter",
      "import": "Importer",
      "import_warning": "Attention : L'importation de fichiers incorrects peut corrompre vos données. Il est fortement recommandé d'effectuer une \"Exportation pour Importation\" avant d'importer.",
      "select_file": "Veuillez sélectionner le fichier à importer :",
      "danger_zone": "Zone de Danger",
      "delete": "Supprimer",
      "delete_session": "Supprimer cette Session (Manche/Jeu)",
      "no_import_support": "Votre navigateur ne prend pas en charge l'importation."
    },
    "footer": {
      "feedback": "Vous avez une idée pour améliorer ceci ?",
      "let_me_know": "Faites-le moi savoir"
    },
    "placeholders": {
      "team_scores": "Les Scores des Équipes Vont Ici",
      "rounded_scores": "Les Scores Arrondis des Équipes Vont Ici",
      "block_scores": "Les Scores des Blocs/Groupes Vont Ici",
      "team_block_scores": "Les Scores des Équipes et Blocs/Groupes Vont Ici",
      "question_log": "Le Journal des Questions Va Ici"
    },
    "defaults": {
      "session_name": "Session {{date}}",
      "team_name": "Équipe {{number}}",
      "block_name": "Bloc/Groupe {{number}}",
      "no_block": "Aucun Bloc/Groupe",
      "question_name": "Question {{number}}",
      "extra_credit": "Crédit Supplémentaire",
      "unnamed_session": "Session Sans Nom"
    },
    "confirm": {
      "delete_team": "Voulez-vous vraiment supprimer {{name}} ?",
      "delete_extra_credit": "Êtes-vous sûr de vouloir supprimer définitivement le crédit supplémentaire de cette question ?",
      "delete_session": "Êtes-vous sûr de vouloir supprimer définitivement \"{{name}}\" ?"
    },
    "alerts": {
      "migration_failed": "La migration des données a échoué. Vos données sont en sécurité dans localStorage. Veuillez exporter une sauvegarde et signaler ce problème.",
      "cannot_delete_only_session": "Vous ne pouvez pas supprimer la seule Session",
      "deleted": "Supprimé",
      "import_success": "Importation réussie : {{count}} session(s) importée(s)",
      "import_failed": "Échec de l'importation : {{error}}",
      "import_json_failed": "Échec de l'importation du fichier JSON : {{error}}",
      "import_binary_failed": "Échec de l'importation du fichier binaire : {{error}}",
      "select_valid_file": "Veuillez sélectionner un fichier json ou yjs à importer",
      "loading": "Chargement...",
      "unknown_import_error": "Erreur d'importation inconnue",
      "yjs_not_initialized": "Yjs non initialisé",
      "invalid_import_format": "Format d'importation invalide. Fichier JSON ou binaire (.yjs) attendu.",
      "failed_parse_container": "Échec de l'analyse du conteneur multi-documents",
      "failed_merge_global": "Échec de la fusion de l'état global : {{error}}",
      "failed_import_session_id": "Échec de l'importation de la session {{id}} : {{error}}",
      "failed_import_session": "Échec de l'importation de la session : {{error}}",
      "failed_convert_localstorage": "Échec de la conversion du format localStorage : {{error}}"
    },
    "history_global": {
      "actions": {
        "create_session": "Créer une Session",
        "switch_session": "Changer de Session",
        "delete_session": "Supprimer la Session",
        "import": "Importer"
      },
      "details_templates": {
        "created_session": "\"{{name}}\" créée",
        "switched_session": "Basculé vers \"{{name}}\"",
        "deleted_session": "\"{{name}}\" supprimée",
        "imported_sessions": "{{count}} session(s) importée(s)",
        "imported_from_json": "{{count}} session(s) importée(s) depuis un fichier JSON",
        "imported_from_yjs": "{{count}} session(s) importée(s) depuis un fichier .yjs"
      }
    }
  }
});
