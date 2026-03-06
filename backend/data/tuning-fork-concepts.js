const SUBJECT = 'ENT';
const TOPIC = 'Tuning Fork Tests';

module.exports = [
  {
    concept_key: 'rinne',
    name: 'Rinne',
    display_order: 1,
    must_know_points: [
      'Compares air conduction (AC) vs bone conduction (BC); AC > BC is normal',
      'Normal result: AC > BC (Rinne positive)',
      'CHL: BC > AC (Rinne negative) — sound heard better by bone',
      'SNHL: AC > BC (Rinne positive) but both may be reduced',
      'False negative Rinne: in severe unilateral SNHL, sound lateralizes to better ear via bone so BC may appear better on the worse ear'
    ],
    deep_points: [
      'Why 512 Hz is preferred (balance of sensitivity and specificity)',
      'Masking when testing one ear to avoid crossover',
      'False positive in conductive loss with middle ear pathology'
    ],
    traps: [
      'False negative Rinne in severe unilateral SNHL (patient hears via bone through the contralateral cochlea)',
      'Confusing Rinne negative with SNHL'
    ],
    leading_questions: [
      { tier: 1, prompt: 'When might Rinne look negative even though the ear has sensorineural hearing loss?' },
      { tier: 2, prompt: 'Think of severe unilateral SNHL—what does the patient hear via the other ear when you place the fork on the mastoid?' },
      { tier: 3, prompt: 'Sound can travel through the skull to the opposite cochlea. So on the bad ear, which pathway might still be working?' },
      { tier: 4, prompt: 'In false negative Rinne, bone conduction is heard via the contralateral (good) ear, so BC appears better than AC on the bad side.' }
    ],
    example_phrases: ['air conduction', 'bone conduction', 'AC > BC', 'Rinne positive', 'Rinne negative', 'lateralizes', 'mastoid', 'external auditory canal'],
    grading_rubric: [
      { id: 'rinne_principle', label: 'Principle', description: 'Compares AC vs BC', example_phrases: ['AC', 'BC', 'air', 'bone', 'comparison'], tier: 'must_know' },
      { id: 'rinne_normal', label: 'Normal', description: 'AC > BC (Rinne positive)', example_phrases: ['AC greater', 'positive', 'normal'], tier: 'must_know' },
      { id: 'rinne_chl', label: 'CHL', description: 'BC > AC (Rinne negative)', example_phrases: ['BC greater', 'negative', 'conductive'], tier: 'must_know' },
      { id: 'rinne_snhl', label: 'SNHL', description: 'Rinne positive but both reduced', example_phrases: ['sensorineural', 'both reduced'], tier: 'must_know' },
      { id: 'rinne_false_neg', label: 'False negative', description: 'Severe unilateral SNHL can show Rinne negative', example_phrases: ['false negative', 'contralateral', 'crossover'], tier: 'deep' }
    ],
    micro_questions: [
      'What does Rinne test compare?',
      'In CHL, is Rinne positive or negative?',
      'When can Rinne be false negative?'
    ]
  },
  {
    concept_key: 'weber',
    name: 'Weber',
    display_order: 2,
    must_know_points: [
      'Fork on vertex/midline; lateralization indicates asymmetry',
      'Lateralizes to affected ear in CHL (sound escapes less from blocked middle ear)',
      'Lateralizes to better ear in SNHL (poorer cochlea hears less)',
      'Midline = normal or symmetrical hearing'
    ],
    deep_points: [
      'Mixed loss: lateralization still to conductive side',
      'Single-sided profound SNHL: Weber lateralizes to good ear; do not mistake for CHL on bad side',
      'Occlusion effect and its role in interpretation'
    ],
    traps: [
      'Assuming Weber to bad ear always means CHL (in SNHL it lateralizes to good ear)',
      'Forgetting to state midline for symmetrical hearing'
    ],
    leading_questions: [
      { tier: 1, prompt: 'In conductive hearing loss, which ear does Weber lateralize to—the affected or the better ear? Why?' },
      { tier: 2, prompt: 'Sound is heard where it is conducted best. In CHL, where is sound “trapped” or conducted better?' },
      { tier: 3, prompt: 'So in CHL, Weber lateralizes to the affected ear. What about in SNHL—where does it go?' },
      { tier: 4, prompt: 'Weber lateralizes to the affected ear in CHL and to the better ear in SNHL. Midline means normal or symmetrical.' }
    ],
    example_phrases: ['lateralizes', 'vertex', 'midline', 'affected ear', 'better ear', 'conductive', 'sensorineural', 'symmetrical'],
    grading_rubric: [
      { id: 'weber_chl', label: 'Weber in CHL', description: 'Lateralizes to affected ear', example_phrases: ['affected', 'conductive', 'blocked'], tier: 'must_know' },
      { id: 'weber_snhl', label: 'Weber in SNHL', description: 'Lateralizes to better ear', example_phrases: ['better ear', 'sensorineural'], tier: 'must_know' },
      { id: 'weber_midline', label: 'Midline', description: 'Normal or symmetrical', example_phrases: ['midline', 'normal', 'symmetrical'], tier: 'deep' }
    ],
    micro_questions: [
      'Where does Weber lateralize in CHL?',
      'Where does Weber lateralize in SNHL?',
      'What does midline Weber mean?'
    ]
  },
  {
    concept_key: 'abc',
    name: 'Absolute Bone Conduction (ABC)',
    display_order: 3,
    must_know_points: [
      'Tests bone conduction in isolation (occlude opposite ear to mask)',
      'Compares patient’s BC to examiner’s normal BC',
      'If patient hears longer = BC better than normal → suggests CHL (middle ear bypassed)',
      'If patient hears less = BC reduced → cochlear or neural pathology'
    ],
    deep_points: [
      'Rationale for masking the non-test ear',
      'Schwabach prolonged vs diminished and link to ABC'
    ],
    traps: [
      'Forgetting that ABC is comparison to examiner’s normal',
      'Confusing prolonged (CHL) with diminished (SNHL)'
    ],
    leading_questions: [
      { tier: 1, prompt: 'What does absolute bone conduction actually test?' },
      { tier: 2, prompt: 'Whose bone conduction are we comparing the patient’s to?' },
      { tier: 3, prompt: 'If the patient hears the fork longer than you do on your mastoid, what does that suggest?' },
      { tier: 4, prompt: 'ABC compares patient’s BC to examiner’s. Prolonged = CHL; diminished = SNHL or neural.' }
    ],
    example_phrases: ['bone conduction', 'examiner', 'prolonged', 'diminished', 'masking', 'mastoid'],
    grading_rubric: [
      { id: 'abc_what', label: 'What ABC tests', description: 'BC in isolation vs examiner normal', example_phrases: ['bone', 'examiner', 'compare'], tier: 'must_know' },
      { id: 'abc_prolonged', label: 'Prolonged', description: 'Suggests CHL', example_phrases: ['prolonged', 'longer', 'CHL'], tier: 'must_know' },
      { id: 'abc_diminished', label: 'Diminished', description: 'Cochlear/neural', example_phrases: ['diminished', 'reduced', 'SNHL'], tier: 'deep' }
    ],
    micro_questions: [
      'What does ABC test?',
      'Prolonged ABC suggests which type of loss?',
      'Diminished ABC suggests what?'
    ]
  },
  {
    concept_key: 'bing',
    name: 'Bing',
    display_order: 4,
    must_know_points: [
      'Tests occlusion effect: occlude external canal while fork on mastoid',
      'Normal: sound appears louder when canal occluded (Bing positive)',
      'CHL: no change or less loud when occluded (Bing negative) — occlusion effect absent',
      'Used to confirm conductive component'
    ],
    deep_points: [
      'Physics of occlusion effect (sound reflection in closed canal)',
      'When Bing is equivocal'
    ],
    traps: [
      'Reversing Bing positive and negative',
      'Saying Bing positive in CHL (it is negative in CHL)'
    ],
    leading_questions: [
      { tier: 1, prompt: 'What is the occlusion effect and what does Bing test?' },
      { tier: 2, prompt: 'When you occlude the external canal in a normal ear, what happens to the perception of bone-conducted sound?' },
      { tier: 3, prompt: 'In conductive hearing loss, is Bing positive or negative? Why?' },
      { tier: 4, prompt: 'Bing positive = louder when occluded (normal). Bing negative = no change/louder when occluded absent (CHL).' }
    ],
    example_phrases: ['occlusion', 'occlusion effect', 'Bing positive', 'Bing negative', 'occlude', 'external canal', 'mastoid'],
    grading_rubric: [
      { id: 'bing_principle', label: 'Principle', description: 'Occlusion effect', example_phrases: ['occlusion', 'occlude', 'canal'], tier: 'must_know' },
      { id: 'bing_normal', label: 'Normal', description: 'Louder when occluded (positive)', example_phrases: ['positive', 'louder', 'normal'], tier: 'must_know' },
      { id: 'bing_chl', label: 'CHL', description: 'Bing negative', example_phrases: ['negative', 'CHL', 'no change'], tier: 'deep' }
    ],
    micro_questions: [
      'What does Bing test?',
      'Is Bing positive or negative in CHL?',
      'What is the occlusion effect?'
    ]
  },
  {
    concept_key: 'schwabach',
    name: 'Schwabach',
    display_order: 5,
    must_know_points: [
      'Compares patient’s BC hearing duration to examiner’s normal BC',
      'Prolonged Schwabach = patient hears longer than examiner → suggests CHL',
      'Diminished Schwabach = patient hears shorter → suggests SNHL or neural loss',
      'Examiner must have normal hearing for valid comparison'
    ],
    deep_points: [
      'Relation to ABC (same idea, different naming in some texts)',
      'Use when examiner has known normal hearing'
    ],
    traps: [
      'Confusing prolonged with diminished',
      'Using when examiner has hearing loss'
    ],
    leading_questions: [
      { tier: 1, prompt: 'What does Schwabach compare?' },
      { tier: 2, prompt: 'If the patient hears the tuning fork longer than you do on the mastoid, what do we call that and what does it suggest?' },
      { tier: 3, prompt: 'Prolonged vs diminished Schwabach—which goes with CHL and which with SNHL?' },
      { tier: 4, prompt: 'Prolonged = CHL; diminished = SNHL/neural. Compare patient BC duration to examiner’s normal.' }
    ],
    example_phrases: ['prolonged', 'diminished', 'bone conduction', 'examiner', 'duration', 'mastoid'],
    grading_rubric: [
      { id: 'schwabach_compare', label: 'Comparison', description: 'Patient BC vs examiner BC duration', example_phrases: ['compare', 'examiner', 'duration'], tier: 'must_know' },
      { id: 'schwabach_prolonged', label: 'Prolonged', description: 'CHL', example_phrases: ['prolonged', 'longer', 'CHL'], tier: 'must_know' },
      { id: 'schwabach_diminished', label: 'Diminished', description: 'SNHL/neural', example_phrases: ['diminished', 'shorter', 'SNHL'], tier: 'deep' }
    ],
    micro_questions: [
      'Prolonged Schwabach suggests what?',
      'Diminished Schwabach suggests what?',
      'Who must have normal hearing for Schwabach?'
    ]
  },
  {
    concept_key: 'stenger',
    name: 'Stenger',
    display_order: 6,
    must_know_points: [
      'Test for malingering or functional hearing loss',
      'Based on principle: when two tones of same frequency presented to both ears, only the louder is perceived',
      'Present same fork (or tone) to both ears at different intensities; genuine unilateral deafness would hear in good ear only',
      'Malingerer may report no sound when good ear is masked or stimulus to bad ear is sufficient'
    ],
    deep_points: [
      'Stenger positive: patient denies hearing when sound is actually present in “bad” ear at level that would be heard',
      'Use of tuning fork or audiometer for Stenger'
    ],
    traps: [
      'Confusing Stenger with other tuning fork tests',
      'Forgetting it is for non-organic loss'
    ],
    leading_questions: [
      { tier: 1, prompt: 'What is the Stenger test used for?' },
      { tier: 2, prompt: 'What principle does Stenger rely on—when the same tone is presented to both ears at different loudness?' },
      { tier: 3, prompt: 'In a patient claiming one deaf ear, how might we use two tuning forks or two tones to check for malingering?' },
      { tier: 4, prompt: 'Stenger: same frequency to both ears; only louder is heard. Used to detect functional/unilateral malingering.' }
    ],
    example_phrases: ['malingering', 'functional', 'non-organic', 'both ears', 'louder', 'Stenger positive'],
    grading_rubric: [
      { id: 'stenger_purpose', label: 'Purpose', description: 'Malingering/functional hearing loss', example_phrases: ['malingering', 'functional', 'non-organic'], tier: 'must_know' },
      { id: 'stenger_principle', label: 'Principle', description: 'Only louder tone heard when same frequency both ears', example_phrases: ['both ears', 'louder', 'same frequency'], tier: 'deep' }
    ],
    micro_questions: [
      'What is Stenger test used for?',
      'What principle does Stenger use?'
    ]
  }
].map((c, i) => ({
  ...c,
  subject: SUBJECT,
  topic: TOPIC,
  display_order: c.display_order != null ? c.display_order : i + 1
}));
