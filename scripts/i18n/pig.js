/**
 * Secret Code (Pig Latin) Language Pack for PBE Score Keeper
 * 
 * This is a fun/test language that demonstrates the i18n system.
 * It uses Pig Latin transformations of English text.
 * 
 * NOTE: Temporarily using French locale (fr-FR) for number formatting testing.
 * This will show numbers with comma decimal separator (e.g., 85,50%)
 */
register_i18n_language('pig', {
  name: 'Secret Code',
  locale: 'fr-FR',  // TEMP: Using French locale for number formatting testing
  rtl: false,
  translations: {
    "app": {
      "title": "BPE-ay Ore-Scay Eeper-Kay",
      "theme": "Eme-Thay",
      "language": "Anguage-Lay",
      "auto": "Auto-ay"
    },
    "theme": {
      "system": "Ystem-Say",
      "light": "Ight-Lay",
      "dark": "Ark-Day"
    },
    "config": {
      "title": "Onfiguration-Cay (Ession-Say)",
      "instructions_title": "Instructions-ay",
      "instructions": "Is-thay is-ay a-ay ore-scay eeper-kay or-fay e-thay Athfinder-Pay Ible-Bay Experience-ay (aka-ay e-thay Ible-Bay Owl-Bay). Ease-play enter-ay our-yay umber-nay of-ay eams-tay as-ay ell-way as-ay ocks-blay elow-bay o-say at-thay e-thay oring-scay id-gray an-cay e-bay eated-cray",
      "storage_title": "Ata-Day Orage-Stay Ote-Nay",
      "storage_note": "Ata-Day is-ay ored-stay only-ay on-ay our-yay evice-day, and-ay is-ay ot-nay ared-shay in-ay any-ay ay-way ith-way any-ay erver-say. Is-thay also-ay eans-may at-thay if-ay ou-yay ange-chay evices-day our-yay ata-day ill-way ot-nay appear-ay on-ay e-thay ew-nay evice-day.",
      "new_session": "Ew-Nay Ession-Say",
      "enter_scores": "Enter-ay Ores-Scay"
    },
    "teams": {
      "title": "Et-Say up-ay our-yay Eams-Tay",
      "count_one": "{{count}} eam-tay",
      "count_other": "{{count}} eams-tay",
      "team": "eam-tay",
      "teams": "eams-tay",
      "name_label": "Eam-Tay {{number}} Ame-Nay:",
      "score_label": "{{name}}'s-ay ore-scay",
      "score_label_s": "{{name}}'-ay ore-scay",
      "add_team": "Add-ay Eam-Tay",
      "delete_team": "Elete-Day Eam-Tay",
      "delete_aria": "Elete-Day {{name}}",
      "minimum_notice": "At-ay east-lay 1 eam-tay is-ay equired-ray"
    },
    "blocks": {
      "title": "Et-Say up-ay our-yay Ocks-Blay",
      "count_one": "{{count}} ock-blay",
      "count_other": "{{count}} ocks-blay",
      "block": "ock-blay",
      "blocks": "ocks-blay",
      "name_label": "Ock-Blay {{number}} Ame-Nay:",
      "add_block": "Add-ay Ock-Blay",
      "delete_block": "Elete-Day Ock-Blay",
      "delete_aria": "Elete-Day {{name}}",
      "minimum_notice": "At-ay east-lay 1 ock-blay is-ay equired-ray",
      "in_use_notice": "Annot-cay elete-day: {{name}} is-ay assigned-ay o-tay uestions-qay"
    },
    "points": {
      "title": "Aximum-May Oints-Pay er-pay Uestion-Qay",
      "count_one": "{{count}} oint-pay",
      "count_other": "{{count}} oints-pay",
      "point": "oint-pay",
      "points": "oints-pay",
      "possible": "Ossible-Pay Oints-Pay or-fay Uestion-Qay"
    },
    "rounding": {
      "title": "Ounding-Ray Ive-Lay Eam-Tay ore-scay o-tay est-bay eam's-tay otal-tay?",
      "yes": "Es-Yay",
      "no": "O-Nay"
    },
    "score_entry": {
      "title": "Ore-Scay Entry-ay",
      "previous": "Evious-Pray Uestion-Qay",
      "next": "Ext-Nay Uestion-Qay",
      "new": "Ew-Nay Uestion-Qay",
      "ignore": "Ignore-ay is-thay Uestion-Qay in-ay Ore-Scay Alculations-Cay",
      "extra_credit": "Allow-ay Extra-ay Edit-Cray",
      "question": "Uestion-Qay",
      "block_group": "Ock-Blay"
    },
    "scores": {
      "team_exact": "Ore-Scay y-bay Eam-Tay (Exact-ay)",
      "team_rounded": "Ore-Scay y-bay Eam-Tay (Ounded-Ray)",
      "by_block": "Ore-Scay y-bay Ock-Blay",
      "team_and_block": "Ore-Scay y-bay Eam-Tay & Ock-Blay",
      "question_log": "Uestion-Qay Og-Lay"
    },
    "table": {
      "team_name": "Eam-Tay Ame-Nay",
      "percent": "Ercent-Pay",
      "score": "Ore-Scay",
      "placement": "Acement-Play",
      "block_name": "Ock-Blay Ame-Nay",
      "question": "Uestion-Qay",
      "possible_points": "Ossible-Pay Oints-Pay",
      "earned_points": "Earned-ay Oints-Pay",
      "total_points": "Otal-Tay Oints-Pay",
      "total_points_rounded": "Otal-Tay Oints-Pay (Ounded-Ray)",
      "percent_rounded": "Ercent-Pay (Ounded-Ray)",
      "score_rounded": "Ore-Scay (Ounded-Ray)",
      "placement_rounded": "Acement-Play (Ounded-Ray)",
      "ignore_question": "Ignore-ay Uestion-Qay"
    },
    "placements": {
      "first": "Irst-Fay Ace-Play",
      "second": "Econd-Say Ace-Play",
      "third": "Ird-Thay Ace-Play"
    },
    "history": {
      "title": "Istory-Hay",
      "change_log": "Ange-Chay Og-Lay",
      "time": "Ime-Tay",
      "session": "Ession-Say",
      "action": "Action-ay",
      "details_header": "Etails-Day",
      "no_changes": "O-Nay anges-chay ecorded-ray et-yay. Ake-May ome-say anges-chay o-tay ee-say em-thay ere-hay!",
      "global": "Obal-Glay",
      "current_session": "Urrent-Cay Ession-Say",
      "unknown_time": "Unknown-ay",
      "actions": {
        "change": "Ange-Chay",
        "rename_session": "Ename-Ray Ession-Say",
        "add_team": "Add-ay Eam-Tay",
        "delete_team": "Elete-Day Eam-Tay",
        "rename_team": "Ename-Ray Eam-Tay",
        "add_block": "Add-ay Ock-Blay",
        "delete_block": "Elete-Day Ock-Blay",
        "rename_block": "Ename-Ray Ock-Blay",
        "change_max_points": "Ange-Chay Ax-May Oints-Pay",
        "rename_question": "Ename-Ray Uestion-Qay",
        "change_rounding": "Ange-Chay Ounding-Ray",
        "ignore_question": "Ignore-ay Uestion-Qay",
        "include_question": "Include-ay Uestion-Qay",
        "enable_extra_credit": "Enable-ay Extra-ay Edit-Cray",
        "disable_extra_credit": "Isable-Day Extra-ay Edit-Cray",
        "clear_extra_credit": "Ear-Clay Extra-ay Edit-Cray",
        "extra_credit": "Extra-ay Edit-Cray",
        "set_question_points": "Et-Say Uestion-Qay Oints-Pay",
        "change_question_block": "Ange-Chay Uestion-Qay Ock-Blay",
        "score_change": "Ore-Scay Ange-Chay",
        "export_session": "Export-ay Ession-Say",
        "export_all_sessions": "Export-ay All-ay Essions-Say",
        "reorder_teams": "Eorder-Ray Eams-Tay",
        "reorder_blocks": "Eorder-Ray Ocks-Blay"
      },
      "details_templates": {
        "renamed": "Enamed-Ray \"{{old}}\" o-tay \"{{new}}\"",
        "added": "Added-ay \"{{name}}\"",
        "deleted": "Eleted-Day \"{{name}}\"",
        "increased_max_points": "Increased-ay ax-may oints-pay om-fray {{old}} o-tay {{new}}",
        "decreased_max_points": "Ecreased-Day ax-may oints-pay om-fray {{old}} o-tay {{new}}",
        "enabled_rounding": "Enabled-ay ounding-ray o-tay est-bay eam's-tay otal-tay",
        "disabled_rounding": "Isabled-Day ounding-ray",
        "set_ignored": "Et-Say \"{{name}}\" o-tay e-bay ignored-ay",
        "set_included": "Et-Say \"{{name}}\" o-tay e-bay included-ay",
        "enabled_extra_credit": "Enabled-ay extra-ay edit-cray or-fay \"{{name}}\"",
        "disabled_extra_credit": "Isabled-Day extra-ay edit-cray or-fay \"{{name}}\"",
        "cleared_extra_credit": "Eared-Clay all-ay extra-ay edit-cray or-fay \"{{name}}\"",
        "increased_extra_credit": "Increased-ay extra-ay edit-cray or-fay \"{{team}}\" on-ay \"{{question}}\" o-tay {{value}}",
        "decreased_extra_credit": "Ecreased-Day extra-ay edit-cray or-fay \"{{team}}\" on-ay \"{{question}}\" o-tay {{value}}",
        "set_question_points": "Et-Say ax-may oints-pay or-fay \"{{name}}\" om-fray {{old}} o-tay {{new}}",
        "changed_block": "Anged-Chay \"{{question}}\" om-fray \"{{old}}\" o-tay \"{{new}}\"",
        "score_changed": "\"{{team}}\" on-ay \"{{question}}\" om-fray {{old}} o-tay {{new}}",
        "exported_session_yjs": "Exported-ay ession-say as-ay .yjs ile-fay",
        "exported_session_json": "Exported-ay ession-say as-ay JSON-ay ile-fay",
        "exported_session_json_fallback": "Exported-ay ession-say as-ay JSON-ay ile-fay (allback-fay)",
        "exported_all_yjs": "Exported-ay all-ay essions-say as-ay .yjs ile-fay",
        "exported_all_json": "Exported-ay all-ay essions-say as-ay JSON-ay ile-fay",
        "exported_all_json_fallback": "Exported-ay all-ay essions-say as-ay JSON-ay ile-fay (allback-fay)",
        "new_order": "Ew-Nay order-ay: {{order}}"
      }
    },
    "advanced": {
      "title": "Advanced-ay",
      "export_csv": "Export-ay CSV-ay",
      "export_team": "Export-ay Ore-Scay y-bay Eam-Tay",
      "export_block": "Export-ay Ore-Scay y-bay Ock-Blay",
      "export_team_and_block": "Export-ay Ore-Scay y-bay Eam-Tay & Ock-Blay",
      "export_question_log": "Export-ay Uestion-Qay Og-Lay",
      "export_json": "Export-ay or-fay Importing-ay",
      "export_session": "Export-ay Ession-Say",
      "export_all": "Export-ay All-ay",
      "import": "Import-ay",
      "import_warning": "Arning-Way: Importing-ay ad-bay iles-fay an-cay orrupt-cay our-yay ata-day. It-ay is-ay ongly-stray ecommended-ray at-thay ou-yay un-ray an-ay \"Export-ay or-fay Importing-ay\" efore-bay importing-ay.",
      "select_file": "Ease-Play Elect-Say ile-fay o-tay import-ay:",
      "danger_zone": "Anger-Day One-Zay",
      "delete": "Elete-Day",
      "delete_session": "Elete-Day is-thay Ession-Say",
      "no_import_support": "Our-Yay Owser-Bray oes-day ot-nay upport-say importing-ay."
    },
    "footer": {
      "feedback": "Ave-Hay an-ay idea-ay o-tay ake-may is-thay etter-bay?",
      "let_me_know": "Et-Lay e-may ow-knay"
    },
    "placeholders": {
      "team_scores": "Eam-Tay Ores-Scay O-Gay Ere-Hay",
      "rounded_scores": "Ounded-Ray Eam-Tay Ores-Scay O-Gay Ere-Hay",
      "block_scores": "Ock-Blay Ores-Scay O-Gay Ere-Hay",
      "team_block_scores": "Eam-Tay & Ock-Blay Ores-Scay O-Gay Ere-Hay",
      "question_log": "Uestion-Qay Og-Lay Oes-Gay Ere-Hay"
    },
    "defaults": {
      "session_name": "Ession-Say {{date}}",
      "team_name": "Eam-Tay {{number}}",
      "block_name": "Ock-Blay {{number}}",
      "no_block": "O-Nay Ock-Blay",
      "question_name": "Uestion-Qay {{number}}",
      "extra_credit": "Extra-ay Edit-Cray",
      "unnamed_session": "Unnamed-ay Ession-Say"
    },
    "confirm": {
      "delete_team": "O-day ou-yay eally-ray ant-way o-tay elete-day {{name}}?",
      "delete_block": "O-day ou-yay eally-ray ant-way o-tay elete-day {{name}}?",
      "delete_extra_credit": "Are-ay ou-yay ure-say ou-yay ant-way o-tay irreversibly-ay elete-day is-thay uestion's-qay extra-ay edit-cray?",
      "delete_session": "Are-ay ou-yay ure-say ou-yay ant-way o-tay irreversibly-ay elete-day \"{{name}}\"?"
    },
    "alerts": {
      "migration_failed": "Ata-Day igration-may ailed-fay. Our-Yay ata-day is-ay afe-say in-ay ocalStorage-lay. Ease-Play export-ay a-ay ackup-bay and-ay eport-ray is-thay issue-ay.",
      "cannot_delete_only_session": "Ou-Yay ay-may ot-nay elete-day e-thay only-ay Ession-Say",
      "deleted": "Eleted-Day",
      "import_success": "Import-ay uccessful-say: {{count}} ession(s)-say imported-ay",
      "import_failed": "Import-ay ailed-fay: {{error}}",
      "import_json_failed": "Ailed-Fay o-tay import-ay JSON-ay ile-fay: {{error}}",
      "import_binary_failed": "Ailed-Fay o-tay import-ay inary-bay ile-fay: {{error}}",
      "select_valid_file": "Ease-Play elect-say json-ay or-ay yjs-ay ile-fay or-fay import-ay",
      "loading": "Oading-Lay...",
      "unknown_import_error": "Unknown-ay import-ay error-ay",
      "yjs_not_initialized": "Yjs-ay ot-nay initialized-ay",
      "invalid_import_format": "Invalid-ay import-ay ormat-fay. Expected-ay JSON-ay or-ay inary-bay (.yjs-ay) ile-fay.",
      "failed_parse_container": "Ailed-Fay o-tay arse-pay ulti-may-oc-day ontainer-cay",
      "failed_merge_global": "Ailed-Fay o-tay erge-may obal-gay ate-stay: {{error}}",
      "failed_import_session_id": "Ailed-Fay o-tay import-ay ession-say {{id}}: {{error}}",
      "failed_import_session": "Ailed-Fay o-tay import-ay ession-say: {{error}}",
      "failed_convert_localstorage": "Ailed-Fay o-tay onvert-cay ocalStorage-lay ormat-fay: {{error}}"
    },
    "history_global": {
      "actions": {
        "create_session": "Eate-Cray Ession-Say",
        "switch_session": "Witch-Say Ession-Say",
        "delete_session": "Elete-Day Ession-Say",
        "import": "Import-ay"
      },
      "details_templates": {
        "created_session": "Eated-Cray \"{{name}}\"",
        "switched_session": "Witched-Say o-tay \"{{name}}\"",
        "deleted_session": "Eleted-Day \"{{name}}\"",
        "imported_sessions": "Imported-ay {{count}} ession(s)-say",
        "imported_from_json": "Imported-ay {{count}} ession(s)-say om-fray JSON-ay ile-fay",
        "imported_from_yjs": "Imported-ay {{count}} ession(s)-say om-fray .yjs-ay ile-fay"
      }
    }
  }
});
