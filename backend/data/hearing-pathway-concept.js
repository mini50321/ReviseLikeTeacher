const SUBJECT = 'ENT';
const TOPIC = 'Hearing Physiology';

module.exports = {
  subject: SUBJECT,
  topic: TOPIC,
  concept_key: 'hearing_pathway',
  concept_map_id: 'ENT.Ear.HearingPathway',
  name: 'Physiology of Hearing Pathway',
  display_order: 1,
  concept_weight: 4,
  section: 'Ear',
  chapter: 'Physiology of Hearing & Audiometry',
  main_topic: 'Hearing Physiology',
  subtopic: 'Sound Conduction Pathway',
  prerequisite_concept_ids: [],
  downstream_concept_ids: ['ENT.Ear.Rinne', 'ENT.Ear.Weber', 'ENT.Ear.PureToneAudiometry', 'ENT.Ear.Tympanometry'],
  must_know_points: [
    'External ear collects sound waves.',
    'Tympanic membrane converts sound waves into mechanical vibration.',
    'Ossicular chain amplifies vibration.',
    'Cochlea converts vibration into neural impulses.',
    'Cochlear nerve transmits signals to auditory cortex.'
  ],
  deep_points: [
    'Organ of Corti is the sensory organ of hearing.',
    'Primary auditory cortex lies in Heschl\'s gyrus (area 41).',
    'Both air and bone conduction stimulate the cochlea.',
    'Lesions in different parts of the pathway produce conductive or sensorineural hearing loss.'
  ],
  traps: [
    'Tympanic membrane detects sound.',
    'Believing perception occurs in cochlea.'
  ],
  saqs: [
    {
      question: 'Describe the physiology of the hearing pathway.',
      core_points: ['Pinna → EAC → Tympanic membrane → Ossicles → Oval window → Cochlear fluid → Basilar membrane → Organ of Corti → Cochlear nerve → Auditory cortex'],
      misconceptions: ['Tympanic membrane detects sound'],
      compact_answer: 'Sound waves collected by the pinna travel through the external auditory canal and vibrate the tympanic membrane. These vibrations are transmitted through the ossicles to the oval window generating cochlear fluid waves which move the basilar membrane. Hair cells in the organ of Corti convert mechanical energy into electrical impulses transmitted by the cochlear nerve to the auditory cortex.'
    },
    {
      question: 'List the structures involved in the auditory pathway from external ear to cortex.',
      core_points: ['Pinna', 'External auditory canal', 'Tympanic membrane', 'Ossicles', 'Oval window', 'Cochlea', 'Organ of Corti', 'Cochlear nerve', 'Brainstem nuclei', 'Auditory cortex'],
      misconceptions: ['Believing perception occurs in cochlea'],
      compact_answer: 'The auditory pathway includes pinna, external auditory canal, tympanic membrane, ossicular chain, oval window, cochlea with organ of Corti, cochlear nerve, brainstem auditory nuclei, and the auditory cortex in the temporal lobe.'
    }
  ],
  mcqs: [
    {
      question: 'Which structure converts mechanical vibration into electrical impulses?',
      options: { A: 'Tympanic membrane', B: 'Ossicles', C: 'Organ of Corti', D: 'Oval window' },
      correct_answer: 'C',
      socratic_prompts: 'Which structure contains sensory hair cells responsible for mechano-electrical transduction?',
      common_reasoning_errors: 'Confusing tympanic membrane with sensory organ.',
      concept_reinforcement: 'Hair cells of organ of Corti perform transduction.'
    },
    {
      question: 'Primary auditory cortex is located in:',
      options: { A: 'Frontal lobe', B: 'Temporal lobe', C: 'Parietal lobe', D: 'Occipital lobe' },
      correct_answer: 'B',
      socratic_prompts: 'Which lobe processes sound perception?',
      common_reasoning_errors: 'Confusing auditory cortex with sensory cortex.',
      concept_reinforcement: 'Auditory cortex lies in superior temporal gyrus.'
    },
    {
      question: 'Which cranial nerve carries auditory impulses?',
      options: { A: 'Facial nerve', B: 'Vestibulocochlear nerve', C: 'Trigeminal nerve', D: 'Glossopharyngeal nerve' },
      correct_answer: 'B',
      socratic_prompts: 'Which cranial nerve mediates hearing?',
      common_reasoning_errors: 'Confusing facial nerve with vestibulocochlear nerve.',
      concept_reinforcement: 'Cochlear division of CN VIII transmits hearing signals.'
    },
    {
      question: 'Movement of which structure stimulates hair cells?',
      options: { A: 'Basilar membrane', B: 'Tympanic membrane', C: 'Round window', D: 'Eustachian tube' },
      correct_answer: 'A',
      socratic_prompts: 'What structure supports organ of Corti?',
      common_reasoning_errors: 'Believing hair cells respond directly to oval window.',
      concept_reinforcement: 'Basilar membrane displacement stimulates hair cells.'
    },
    {
      question: 'Sound vibrations enter cochlea through:',
      options: { A: 'Round window', B: 'Oval window', C: 'External canal', D: 'Vestibule' },
      correct_answer: 'B',
      socratic_prompts: 'Which ossicle contacts this structure?',
      common_reasoning_errors: 'Confusing round window entry.',
      concept_reinforcement: 'Stapes footplate transmits vibration to oval window.'
    },
    {
      question: 'Final perception of sound occurs in:',
      options: { A: 'Brainstem', B: 'Cochlea', C: 'Temporal cortex', D: 'Cerebellum' },
      correct_answer: 'C',
      socratic_prompts: 'Where does conscious sound perception occur?',
      common_reasoning_errors: 'Believing perception occurs in cochlea.',
      concept_reinforcement: 'Auditory cortex interprets sound.'
    }
  ],
  leading_questions: [
    { tier: 1, prompt: 'After sound passes through the external auditory canal, which structure vibrates first?' },
    { tier: 2, prompt: 'Think of the first structure that receives sound waves. What vibrates?' },
    { tier: 3, prompt: 'The ear drum is also known as which membrane?' },
    { tier: 4, prompt: 'The tympanic membrane vibrates first.' }
  ],
  grading_rubric: [
    { id: 'eac', label: 'External auditory canal', description: 'Sound travels through EAC', example_phrases: ['external auditory canal', 'ear canal', 'EAC'], tier: 'must_know' },
    { id: 'tm', label: 'Tympanic membrane', description: 'First structure to vibrate', example_phrases: ['tympanic membrane', 'eardrum'], tier: 'must_know' },
    { id: 'ossicles', label: 'Ossicles', description: 'Malleus, incus, stapes', example_phrases: ['ossicles', 'malleus', 'incus', 'stapes'], tier: 'must_know' },
    { id: 'oval', label: 'Oval window', description: 'Entry to cochlea', example_phrases: ['oval window'], tier: 'must_know' },
    { id: 'cochlea', label: 'Cochlea', description: 'Fluid movement', example_phrases: ['cochlea', 'cochlear'], tier: 'must_know' },
    { id: 'basilar', label: 'Basilar membrane', description: 'Supports organ of Corti', example_phrases: ['basilar membrane'], tier: 'must_know' },
    { id: 'organ_corti', label: 'Organ of Corti', description: 'Hair cells transduce', example_phrases: ['organ of Corti', 'hair cells'], tier: 'must_know' },
    { id: 'cochlear_nerve', label: 'Cochlear nerve', description: 'CN VIII carries impulses', example_phrases: ['cochlear nerve', 'auditory nerve', 'eighth nerve'], tier: 'must_know' },
    { id: 'cortex', label: 'Auditory cortex', description: 'Final perception', example_phrases: ['auditory cortex', 'temporal lobe', 'cortex'], tier: 'must_know' }
  ],
  micro_questions: [
    'What structure vibrates first after sound enters the ear?',
    'Which three bones transmit vibrations to the oval window?',
    'Where does mechano-electrical transduction occur?',
    'Which nerve carries auditory impulses to the brain?'
  ]
};
