const PERSONAS = ['law_student', 'advocate', 'business_user'];
const CORE_RESPONSE_HEADINGS = ['Issue', 'Applicable Law', 'Analysis', 'Conclusion', 'Practical Note', 'Disclaimer'];
const ONBOARDING_STARTER_PROMPTS = [
  'Explain Section 138 NI Act',
  'Draft a legal notice',
  'Summarize a case',
];

const PERSONA_LABELS = {
  law_student: 'Law Student',
  advocate: 'Advocate',
  business_user: 'Business User',
};

const TASK_LABELS = {
  legal_reasoning: 'Legal Q&A',
  legal_drafting: 'Contract drafting',
  case_law_style_analysis: 'Case law summary',
  document_analysis: 'Document explanation',
  compliance_checklist: 'Compliance checklist',
  legal_research: 'Legal research',
  summarization: 'Case law summary',
  quick_qa: 'Legal Q&A',
  bare_act_or_provision_explanation: 'Provision explanation',
  doctrine_explanation: 'Legal doctrine',
  comparison: 'Legal comparison',
  translation_of_legal_text: 'Legal translation',
};

const PRO_UPGRADE_HINT = 'Upgrade to Pro for 120 legal queries per day, predictive risk scoring, advanced legal reasoning, contract drafting tools, priority response speed, and structured legal analysis.';

const PERSONA_PROMPTS = {
  law_student: [
    'Explain Section 138 NI Act',
    'Summarize a case',
    'Create a revision note on consideration under contract law',
  ],
  advocate: [
    'Draft a legal notice',
    'Summarize this case for oral arguments',
    'Analyze this clause and identify litigation risk',
  ],
  business_user: [
    'Explain this contract clause in simple terms',
    'Create a compliance checklist for this agreement',
    'Draft a response to a legal notice',
  ],
};

function clean(value) {
  return String(value || '').trim();
}

function normalizePersona(value) {
  const candidate = clean(value).toLowerCase();
  return PERSONAS.includes(candidate) ? candidate : '';
}

function normalizeCountMap(value) {
  const input = value && typeof value === 'object' ? value : {};
  return Object.entries(input).reduce((acc, [key, count]) => {
    const normalizedKey = clean(key);
    const normalizedCount = Number.parseInt(String(count || 0), 10) || 0;
    if (normalizedKey && normalizedCount > 0) acc[normalizedKey] = normalizedCount;
    return acc;
  }, {});
}

function dayKey(value) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function diffDays(leftDayKey, rightDayKey) {
  if (!leftDayKey || !rightDayKey) return Number.NaN;
  const left = Date.parse(`${leftDayKey}T00:00:00.000Z`);
  const right = Date.parse(`${rightDayKey}T00:00:00.000Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.NaN;
  return Math.round((right - left) / (24 * 60 * 60 * 1000));
}

function getTaskLabel(taskType) {
  return TASK_LABELS[String(taskType || '').trim()] || 'Legal work';
}

function derivePreferredTask(queryTypeCounts) {
  const entries = Object.entries(normalizeCountMap(queryTypeCounts));
  if (!entries.length) return '';
  entries.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  return entries[0][0];
}

function buildStarterPrompts(options) {
  const persona = normalizePersona(options?.persona);
  const preferredTaskType = clean(options?.preferredTaskType);
  const fromPersona = PERSONA_PROMPTS[persona] || ONBOARDING_STARTER_PROMPTS;

  if (!preferredTaskType) return fromPersona.slice(0, 3);

  const preferredPrompt = {
    legal_drafting: 'Draft a legal notice',
    case_law_style_analysis: 'Summarize a case',
    document_analysis: 'Explain this contract clause in simple terms',
    compliance_checklist: 'Create a compliance checklist for this agreement',
    legal_research: 'Research the latest legal position on force majeure',
    legal_reasoning: 'Explain Section 138 NI Act',
  }[preferredTaskType];

  return [...new Set([preferredPrompt, ...fromPersona, ...ONBOARDING_STARTER_PROMPTS].filter(Boolean))].slice(0, 3);
}

function applyDailyActivity(userLike, when) {
  const user = userLike && typeof userLike === 'object' ? userLike : {};
  const currentDay = dayKey(when);
  const previousDay = clean(user.lastActiveDayKey);

  let streakCount = Number(user.streakCount || 0);
  let longestStreak = Number(user.longestStreak || 0);
  let daysActiveTotal = Number(user.daysActiveTotal || 0);

  if (currentDay && currentDay !== previousDay) {
    const gap = previousDay ? diffDays(previousDay, currentDay) : Number.NaN;
    streakCount = gap === 1 ? Math.max(streakCount, 1) + 1 : 1;
    longestStreak = Math.max(longestStreak, streakCount);
    daysActiveTotal += 1;
  }

  return {
    lastActiveDayKey: currentDay || previousDay || '',
    streakCount: Math.max(streakCount, currentDay ? 1 : 0),
    longestStreak: Math.max(longestStreak, streakCount, currentDay ? 1 : 0),
    daysActiveTotal,
  };
}

function buildHabitMessage(options) {
  const streakCount = Number(options?.streakCount || 0);
  const base = 'Use Lexorium daily for legal clarity';
  if (streakCount >= 2) return `${base}. You've used Lexorium ${streakCount} days in a row.`;
  return base;
}

function buildRetentionSummary(user, plan, usage) {
  const persona = normalizePersona(user?.persona);
  const queryTypeCounts = normalizeCountMap(user?.queryTypeCounts);
  const preferredTaskType = clean(user?.preferredTaskType) || derivePreferredTask(queryTypeCounts);
  const streakCount = Number(user?.streakCount || 0);

  return {
    onboardingComplete: Boolean(persona && user?.onboardingCompletedAt),
    onboardingQuestion: 'What do you want to use Lexorium for?',
    persona: persona || '',
    personaLabel: persona ? PERSONA_LABELS[persona] : '',
    primaryUseCase: clean(user?.primaryUseCase),
    preferredTaskType,
    preferredTaskLabel: preferredTaskType ? getTaskLabel(preferredTaskType) : '',
    queryTypeCounts,
    streakCount,
    longestStreak: Number(user?.longestStreak || 0),
    daysActiveTotal: Number(user?.daysActiveTotal || 0),
    dailyHabitMessage: buildHabitMessage({ streakCount }),
    dailyLimitMessage: usage?.limit ? `${usage.remaining}/${usage.limit} queries remaining today.` : '',
    starterPrompts: buildStarterPrompts({ persona, preferredTaskType }),
    onboardingStarterPrompts: ONBOARDING_STARTER_PROMPTS.slice(),
    planUpgradeHint: plan?.id === 'free'
      ? PRO_UPGRADE_HINT
      : '',
  };
}

module.exports = {
  CORE_RESPONSE_HEADINGS,
  ONBOARDING_STARTER_PROMPTS,
  PERSONA_LABELS,
  PERSONAS,
  TASK_LABELS,
  applyDailyActivity,
  buildRetentionSummary,
  buildStarterPrompts,
  dayKey,
  derivePreferredTask,
  getTaskLabel,
  normalizeCountMap,
  normalizePersona,
};
