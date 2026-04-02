const DISABLED_MODELS = new Set(
  String(process.env.LEXORIUM_DISABLED_MODELS || '')
    .split(',')
    .map((value) => String(value || '').trim())
    .filter(Boolean)
);

const MODEL_TIERS = ['free', 'pro', 'enterprise'];
const LEGAL_USE_CASES = [
  'legal_reasoning',
  'bare_act_or_provision_explanation',
  'doctrine_explanation',
  'case_law_style_analysis',
  'document_analysis',
  'legal_research',
  'compliance_checklist',
  'legal_drafting',
  'summarization',
  'comparison',
  'translation_of_legal_text',
  'quick_qa',
];

const RAW_MODELS = [
  {
    id: 'inception/mercury-2',
    label: 'Mercury 2',
    tier: 'free',
    useCases: LEGAL_USE_CASES,
    priority: 1,
    fallbackPriority: 1,
    legalReasoningScore: 7,
    structureScore: 6,
    speedScore: 10,
    costCategory: 'free',
  },
  {
    id: 'google/gemini-3.1-flash-lite-preview',
    label: 'Gemini 3.1 Flash Lite',
    tier: 'free',
    useCases: LEGAL_USE_CASES,
    priority: 2,
    fallbackPriority: 2,
    legalReasoningScore: 7,
    structureScore: 7,
    speedScore: 10,
    costCategory: 'free',
  },
  {
    id: 'qwen/qwen3.5-flash-02-23',
    label: 'Qwen 3.5 Flash',
    tier: 'free',
    useCases: LEGAL_USE_CASES,
    priority: 3,
    fallbackPriority: 3,
    legalReasoningScore: 8,
    structureScore: 7,
    speedScore: 9,
    costCategory: 'free',
  },
  {
    id: 'qwen/qwen3.6-plus-preview:free',
    label: 'Qwen 3.6 Plus Free',
    tier: 'free',
    useCases: LEGAL_USE_CASES,
    priority: 4,
    fallbackPriority: 4,
    legalReasoningScore: 9,
    structureScore: 8,
    speedScore: 8,
    costCategory: 'free',
  },
  {
    id: 'qwen/qwen3.5-9b',
    label: 'Qwen 3.5 9B',
    tier: 'free',
    useCases: LEGAL_USE_CASES,
    priority: 5,
    fallbackPriority: 5,
    legalReasoningScore: 7,
    structureScore: 6,
    speedScore: 8,
    costCategory: 'free',
  },
  {
    id: 'qwen/qwen3.5-397b-a17b',
    label: 'Qwen 3.5 397B',
    tier: 'free',
    useCases: LEGAL_USE_CASES,
    priority: 6,
    fallbackPriority: 6,
    legalReasoningScore: 9,
    structureScore: 8,
    speedScore: 6,
    costCategory: 'free',
  },
  {
    id: 'anthropic/claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    tier: 'pro',
    useCases: LEGAL_USE_CASES,
    priority: 1,
    fallbackPriority: 1,
    legalReasoningScore: 10,
    structureScore: 10,
    speedScore: 7,
    costCategory: 'premium',
  },
  {
    id: 'google/gemini-3.1-flash-lite-preview',
    label: 'Gemini 3.1 Flash Lite',
    tier: 'pro',
    useCases: LEGAL_USE_CASES,
    priority: 2,
    fallbackPriority: 2,
    legalReasoningScore: 7,
    structureScore: 7,
    speedScore: 10,
    costCategory: 'premium',
  },
  {
    id: 'google/gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    tier: 'pro',
    useCases: LEGAL_USE_CASES,
    priority: 2,
    fallbackPriority: 2,
    legalReasoningScore: 10,
    structureScore: 9,
    speedScore: 8,
    costCategory: 'premium',
  },
  {
    id: 'inception/mercury-2',
    label: 'Mercury 2',
    tier: 'pro',
    useCases: LEGAL_USE_CASES,
    priority: 4,
    fallbackPriority: 4,
    legalReasoningScore: 7,
    structureScore: 6,
    speedScore: 10,
    costCategory: 'premium',
  },
  {
    id: 'openai/gpt-5.4',
    label: 'GPT-5.4',
    tier: 'pro',
    useCases: LEGAL_USE_CASES,
    priority: 5,
    fallbackPriority: 5,
    legalReasoningScore: 10,
    structureScore: 9,
    speedScore: 7,
    costCategory: 'premium',
  },
  {
    id: 'qwen/qwen3.5-397b-a17b',
    label: 'Qwen 3.5 397B',
    tier: 'pro',
    useCases: LEGAL_USE_CASES,
    priority: 6,
    fallbackPriority: 6,
    legalReasoningScore: 9,
    structureScore: 8,
    speedScore: 6,
    costCategory: 'premium',
  },
  {
    id: 'x-ai/grok-4.20-beta',
    label: 'Grok 4.20 Beta',
    tier: 'pro',
    useCases: LEGAL_USE_CASES,
    priority: 7,
    fallbackPriority: 7,
    legalReasoningScore: 9,
    structureScore: 8,
    speedScore: 7,
    costCategory: 'premium',
  },
  {
    id: 'openai/gpt-5.4-mini',
    label: 'GPT-5.4 Mini',
    tier: 'pro',
    useCases: LEGAL_USE_CASES,
    priority: 8,
    fallbackPriority: 8,
    legalReasoningScore: 8,
    structureScore: 8,
    speedScore: 10,
    costCategory: 'premium',
  },
  {
    id: 'openai/gpt-5.4-pro',
    label: 'GPT-5.4 Pro',
    tier: 'enterprise',
    useCases: LEGAL_USE_CASES,
    priority: 1,
    fallbackPriority: 1,
    legalReasoningScore: 10,
    structureScore: 10,
    speedScore: 6,
    costCategory: 'premium',
    publicVisible: false,
  },
  {
    id: 'openai/gpt-5.4',
    label: 'GPT-5.4',
    tier: 'enterprise',
    useCases: LEGAL_USE_CASES,
    priority: 2,
    fallbackPriority: 2,
    legalReasoningScore: 10,
    structureScore: 9,
    speedScore: 7,
    costCategory: 'premium',
    publicVisible: false,
  },
  {
    id: 'anthropic/claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    tier: 'enterprise',
    useCases: LEGAL_USE_CASES,
    priority: 3,
    fallbackPriority: 3,
    legalReasoningScore: 10,
    structureScore: 10,
    speedScore: 7,
    costCategory: 'premium',
    publicVisible: false,
  },
  {
    id: 'google/gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    tier: 'enterprise',
    useCases: LEGAL_USE_CASES,
    priority: 4,
    fallbackPriority: 4,
    legalReasoningScore: 10,
    structureScore: 9,
    speedScore: 8,
    costCategory: 'premium',
    publicVisible: false,
  },
  {
    id: 'x-ai/grok-4.20-beta',
    label: 'Grok 4.20 Beta',
    tier: 'enterprise',
    useCases: LEGAL_USE_CASES,
    priority: 5,
    fallbackPriority: 5,
    legalReasoningScore: 9,
    structureScore: 8,
    speedScore: 7,
    costCategory: 'premium',
    publicVisible: false,
  },
];

const MODEL_REGISTRY = RAW_MODELS.map((model, index) => ({
  key: `${model.tier}:${index + 1}`,
  ...model,
  enabled: !DISABLED_MODELS.has(model.id),
}));

function getModelsForTier(tier) {
  const value = String(tier || '').trim().toLowerCase();
  return MODEL_REGISTRY.filter((model) => model.tier === value && model.enabled);
}

function getModelById(id, tier) {
  const value = String(id || '').trim();
  if (!value) return null;
  const normalizedTier = tier ? String(tier).trim().toLowerCase() : '';
  return MODEL_REGISTRY.find((model) => model.enabled && model.id === value && (!normalizedTier || model.tier === normalizedTier)) || null;
}

function findModelsById(id) {
  const value = String(id || '').trim();
  return value ? MODEL_REGISTRY.filter((model) => model.enabled && model.id === value) : [];
}

function getAllModels() {
  return MODEL_REGISTRY.slice();
}

function getTierModelCounts() {
  return MODEL_TIERS.reduce((acc, tier) => {
    acc[tier] = getModelsForTier(tier).length;
    return acc;
  }, {});
}

function buildPublicModelCatalog() {
  return MODEL_TIERS.filter((tier) => tier !== 'enterprise').map((tier) => ({
    tier,
    models: getModelsForTier(tier)
      .filter((model) => model.publicVisible !== false)
      .map((model) => ({
        id: model.id,
        label: model.label,
        tier: model.tier,
        useCases: model.useCases.slice(),
        enabled: model.enabled,
      })),
  }));
}

module.exports = {
  MODEL_REGISTRY,
  MODEL_TIERS,
  buildPublicModelCatalog,
  findModelsById,
  getAllModels,
  getModelById,
  getModelsForTier,
  getTierModelCounts,
};
