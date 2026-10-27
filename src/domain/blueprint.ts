import type { Objective, Section, SectionId } from './types'

/**
 * Exam blueprint. Section names and weights match the official Salesforce
 * Certified Business Analyst exam guide (help.salesforce.com article 005298939)
 * and the Trailhead "Cert Prep: Salesforce Business Analyst" module, as reported
 * by search-index entries on 2026-10-27. Objective descriptions are paraphrases,
 * not verbatim exam-guide text — always check the official guide for exact wording.
 */
export const EXAM_FACTS = {
  name: 'Salesforce Certified Business Analyst',
  scoredQuestions: 60,
  unscoredQuestions: 5,
  minutes: 105,
  passingPercent: 72,
  fee: 'US$200 + tax',
  retakeFee: 'US$100 + tax',
  source:
    'Format and passing score as reported by multiple prep sources and Trailhead search snippets on 2026-10-27. The official exam guide could not be opened from the build environment — confirm on the official guide before booking.',
  lastChecked: '2026-10-27',
} as const

// 72% of 60 = 43.2. The user's prep tool reported 43/60 as the pass mark;
// Salesforce does not publish a raw-count cut score, so the app shows the
// percentage and treats 43-44/60 as borderline rather than a safe pass.
export const PASS_FRACTION = EXAM_FACTS.passingPercent / 100

export const SECTIONS: Section[] = [
  { id: 'CD', name: 'Customer Discovery', weight: 0.17, baseline: { correct: 7, total: 10 }, priority: 'Maintain' },
  { id: 'CS', name: 'Collaboration with Stakeholders', weight: 0.23, baseline: { correct: 9, total: 14 }, priority: 'High' },
  { id: 'BPM', name: 'Business Process Mapping', weight: 0.12, baseline: { correct: 2, total: 7 }, priority: 'Critical' },
  { id: 'RQ', name: 'Requirements', weight: 0.18, baseline: { correct: 7, total: 11 }, priority: 'High' },
  { id: 'US', name: 'User Stories', weight: 0.18, baseline: { correct: 9, total: 11 }, priority: 'Maintain' },
  { id: 'UA', name: 'Development Support and User Acceptance', weight: 0.12, baseline: { correct: 3, total: 7 }, priority: 'Critical' },
]

export const SECTION_BY_ID: Record<SectionId, Section> = Object.fromEntries(
  SECTIONS.map((s) => [s.id, s]),
) as Record<SectionId, Section>

/** Number of questions per section on a 60-question mock (matches the weights). */
export const MOCK_DISTRIBUTION: Record<SectionId, number> = {
  CD: 10,
  CS: 14,
  BPM: 7,
  RQ: 11,
  US: 11,
  UA: 7,
}

export const OBJECTIVES: Objective[] = [
  // Customer Discovery 17%
  {
    id: 'CD1',
    sectionId: 'CD',
    title: 'Strategy, goals and scope',
    description:
      "Determine the customer's business strategies, goals, initiatives and challenges to define the scope of a Salesforce project or business initiative.",
    dependents: 4,
  },
  {
    id: 'CD2',
    sectionId: 'CD',
    title: 'Current Salesforce usage',
    description:
      'Discover how the customer currently uses and benefits from Salesforce products (org discovery, adoption, technical debt).',
    dependents: 2,
  },
  {
    id: 'CD3',
    sectionId: 'CD',
    title: 'Discovery in the implementation lifecycle',
    description:
      'Apply customer discovery strategies across the implementation lifecycle and choose what to investigate first.',
    dependents: 2,
  },
  // Collaboration with Stakeholders 23%
  {
    id: 'CS1',
    sectionId: 'CS',
    title: 'Choosing elicitation techniques',
    description: 'Given a scenario, choose the most effective technique for eliciting business needs from stakeholders.',
    dependents: 4,
  },
  {
    id: 'CS2',
    sectionId: 'CS',
    title: 'Stakeholder identification and analysis',
    description:
      'Identify the right stakeholders, understand their roles, influence and interest, and plan how to engage them (RACI, stakeholder mapping).',
    dependents: 3,
  },
  {
    id: 'CS3',
    sectionId: 'CS',
    title: 'Current state to agreed future state',
    description:
      'Plan and facilitate the move from current-state analysis to an agreed future state (journey maps, process design, solution roadmap, technical debt).',
    dependents: 3,
  },
  {
    id: 'CS4',
    sectionId: 'CS',
    title: 'Competing priorities and consensus',
    description: 'Manage competing priorities and conflict between stakeholders to reach consensus.',
    dependents: 2,
  },
  // Business Process Mapping 12%
  {
    id: 'BPM1',
    sectionId: 'BPM',
    title: 'Scoping and decomposing processes',
    description: 'Define the scope of a complex process and break it down into manageable steps and levels.',
    dependents: 3,
  },
  {
    id: 'BPM2',
    sectionId: 'BPM',
    title: 'Mapping to elicit requirements',
    description:
      'Analyze and document a business process to elicit requirements and engage stakeholders to visualize the future state (UPN, swimlanes, as-is/to-be).',
    dependents: 4,
  },
  {
    id: 'BPM3',
    sectionId: 'BPM',
    title: 'Process governance and version control',
    description: 'Document business processes in a version-controlled repository with clear functional ownership.',
    dependents: 2,
  },
  // Requirements 18%
  {
    id: 'RQ1',
    sectionId: 'RQ',
    title: 'Scope vs requirements vs user stories',
    description: 'Distinguish between project scope, requirements and user stories.',
    dependents: 3,
  },
  {
    id: 'RQ2',
    sectionId: 'RQ',
    title: 'Identify, validate and prioritize',
    description: 'Engage stakeholders to identify, validate and prioritize requirements.',
    dependents: 4,
  },
  {
    id: 'RQ3',
    sectionId: 'RQ',
    title: 'Requirements repository and traceability',
    description:
      'Document requirements in a version-controlled repository and maintain traceability and change control.',
    dependents: 3,
  },
  // User Stories 18%
  {
    id: 'US1',
    sectionId: 'US',
    title: 'User story components and quality',
    description: 'Understand the components of a user story and write well-formed stories (persona, goal, benefit, INVEST).',
    dependents: 3,
  },
  {
    id: 'US2',
    sectionId: 'US',
    title: 'Acceptance criteria vs Definition of Done',
    description: 'Contrast acceptance criteria with the Definition of Done and write testable acceptance criteria.',
    dependents: 3,
  },
  {
    id: 'US3',
    sectionId: 'US',
    title: 'Story backlog and scope management',
    description: 'Document user stories in a version-controlled repository to manage scope and the backlog.',
    dependents: 2,
  },
  // Development Support and User Acceptance 12%
  {
    id: 'UA1',
    sectionId: 'UA',
    title: 'Supporting and validating delivery',
    description:
      'Support and validate project delivery so the built solution meets requirements (build support, environments, testing types).',
    dependents: 2,
  },
  {
    id: 'UA2',
    sectionId: 'UA',
    title: 'Planning UAT',
    description: 'Define and prepare the User Acceptance Test plan to confirm the solution meets the business requirements.',
    dependents: 2,
  },
  {
    id: 'UA3',
    sectionId: 'UA',
    title: 'Running UAT and managing results',
    description: 'Guide UAT, triage findings and manage the results through to stakeholder sign-off.',
    dependents: 1,
  },
  {
    id: 'UA4',
    sectionId: 'UA',
    title: 'Go/no-go decisions',
    description: 'Make or support a go/no-go release decision when new business or technical issues arise.',
    dependents: 1,
  },
]

export const OBJECTIVE_BY_ID: Record<string, Objective> = Object.fromEntries(OBJECTIVES.map((o) => [o.id, o]))

export function objectivesForSection(sectionId: SectionId): Objective[] {
  return OBJECTIVES.filter((o) => o.sectionId === sectionId)
}

export function sectionOf(objectiveId: string) {
  const obj = OBJECTIVE_BY_ID[objectiveId]
  if (!obj) throw new Error(`Unknown objective ${objectiveId}`)
  return SECTION_BY_ID[obj.sectionId]
}

/** Weight of an individual objective = section weight split evenly across its objectives. */
export function objectiveWeight(objectiveId: string): number {
  const sec = sectionOf(objectiveId)
  return sec.weight / objectivesForSection(sec.id).length
}

export const PROFILE = {
  examName: EXAM_FACTS.name,
  previousAttempt: { approxDate: '2026-08', correct: 37, total: 60 },
  startDate: '2026-10-27',
  defaultTargetDate: '2026-11-24',
  notes: [
    'Failed previous attempt ~2 months ago with 37/60 (~62%).',
    'About two months away from study; baseline treated as prior evidence, not current ability.',
    'Studies weekdays ~9–10 p.m.; weekends optional.',
    'Has hands-on Salesforce experience.',
  ],
}
