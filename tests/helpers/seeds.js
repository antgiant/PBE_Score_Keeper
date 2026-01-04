function buildSessionSeed() {
  return {
    data_version: JSON.stringify(1.5),
    session_names: JSON.stringify(['', 'Session 1']),
    current_session: JSON.stringify(1),
    session_1_max_points_per_question: JSON.stringify(6),
    session_1_rounding: JSON.stringify('false'),
    session_1_block_names: JSON.stringify(['No Block/Group', 'Block A']),
    session_1_team_names: JSON.stringify(['', 'Alpha', 'Beta']),
    session_1_question_names: JSON.stringify(['', 'Q1', 'Q2']),
    session_1_current_question: JSON.stringify(2),
    session_1_question_1_score: JSON.stringify(4),
    session_1_question_2_score: JSON.stringify(6),
    session_1_question_1_block: JSON.stringify(1),
    session_1_question_2_block: JSON.stringify(0),
    session_1_question_1_ignore: JSON.stringify('false'),
    session_1_question_2_ignore: JSON.stringify('false'),
    session_1_question_1_team_1_score: JSON.stringify(3),
    session_1_question_1_team_2_score: JSON.stringify(2),
    session_1_question_2_team_1_score: JSON.stringify(4),
    session_1_question_2_team_2_score: JSON.stringify(6),
    session_1_question_1_team_1_extra_credit: JSON.stringify(1),
    session_1_question_1_team_2_extra_credit: JSON.stringify(0),
    session_1_question_2_team_1_extra_credit: JSON.stringify(0),
    session_1_question_2_team_2_extra_credit: JSON.stringify(0),
  };
}

module.exports = { buildSessionSeed };
