const { getUsageWarningState } = require('./plan-access');

const STRUCTURED_LABELS = [
  'Issue',
  'Applicable Law',
  'Analysis',
  'Conclusion',
  'Practical Note',
  'Disclaimer',
  'Rule / Provision',
  'Caveat',
  'Next Step',
  'Flow Summary',
  'Court',
  'Facts',
  'Issues',
  'Holding',
  'Reasoning',
  'Significance',
  'Draft',
  'Notes',
  'Placeholders to Confirm',
  'Key Findings',
  'Risk Points',
  'Legal Position',
  'Practical Takeaway',
];

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeStructuredAnswer(answer) {
  let text = String(answer || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  const aliasMap = {
    'Rule / Provision': 'Applicable Law',
    'Legal Position': 'Applicable Law',
    'Practical Takeaway': 'Practical Note',
    'Notes': 'Practical Note',
    'Next Step': 'Practical Note',
    'Caveat': 'Disclaimer',
    'Caution / Disclaimer': 'Disclaimer',
  };

  for (const sourceLabel of STRUCTURED_LABELS) {
    const normalizedLabel = aliasMap[sourceLabel] || sourceLabel;
    const labelPattern = escapeRegex(sourceLabel);
    const strongInline = new RegExp(`^\\*\\*${labelPattern}\\*\\*:?\\s*(.+)$`, 'gim');
    const strongOnly = new RegExp(`^\\*\\*${labelPattern}\\*\\*:?\\s*$`, 'gim');
    const plainInline = new RegExp(`^${labelPattern}:\\s*(.+)$`, 'gim');
    const plainOnly = new RegExp(`^${labelPattern}:\\s*$`, 'gim');

    text = text
      .replace(strongInline, `## ${normalizedLabel}\n$1`)
      .replace(strongOnly, `## ${normalizedLabel}`)
      .replace(plainInline, `## ${normalizedLabel}\n$1`)
      .replace(plainOnly, `## ${normalizedLabel}`);
  }

  return text.replace(/\n{3,}/g, '\n\n').trim();
}

function sanitizeSourceName(name) {
  return String(name || 'Source').replace(/[|\]]/g, ' ').replace(/\s+/g, ' ').trim() || 'Source';
}

function stripSourceTags(answer) {
  return String(answer || '')
    .replace(/\n?## Sources[\s\S]*$/i, '')
    .replace(/\[SOURCE:\d+\|[^\]]+\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function appendVerifiedSources(answer, sources) {
  const text = normalizeStructuredAnswer(stripSourceTags(answer));
  if (!Array.isArray(sources) || !sources.length) return text;
  const tags = sources
    .slice(0, 4)
    .map((source, index) => `[SOURCE:${index + 1}|${sanitizeSourceName(source.name)}|${source.url}]`)
    .join('\n');
  return `${text}\n\n## Sources\n${tags}`;
}

function buildSuccessPayload(options) {
  const answer = appendVerifiedSources(options.answer, options.sources);
  const warning = getUsageWarningState(options.plan.id, options.usage);

  return {
    ok: true,
    response: answer,
    answer,
    conversation: options.conversation,
    plan: options.plan,
    usage: options.usage,
    model: options.model?.id || '',
    upgradePrompt: warning.showSoftWarning,
    upgradePromptText: warning.showSoftWarning
      ? 'You\u2019re nearing today\u2019s limit. Upgrade to Pro for advanced legal reasoning, contract drafting, and priority responses.'
      : null,
    choices: [{ index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' }],
    meta: {
      plan: options.plan,
      usage: options.usage,
      conversation: options.conversation,
      resolvedModel: options.model?.id || '',
      resolvedModelLabel: options.model?.label || '',
      classification: options.classification,
      attempts: options.attempts || [],
      features: options.features || {},
      retention: options.retention || null,
    },
  };
}

function buildBlockedPayload(options) {
  return {
    ok: false,
    type: options.type,
    code: options.code,
    title: options.title || '',
    message: options.message,
    requiredPlan: options.requiredPlan || null,
    upgradePrompt: options.type === 'limit_reached' || options.type === 'upgrade_required',
    meta: {
      plan: options.plan || null,
      usage: options.usage || null,
      features: options.features || {},
      requiredPlan: options.requiredPlan || null,
      retention: options.retention || null,
    },
  };
}

module.exports = {
  buildBlockedPayload,
  buildSuccessPayload,
};
