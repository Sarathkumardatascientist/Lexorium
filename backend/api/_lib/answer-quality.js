const { prompt } = require('./legal');

const CORE_HEADINGS = ['Issue', 'Applicable Law', 'Analysis', 'Conclusion', 'Practical Note', 'Disclaimer'];

function clean(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getRequiredHeadings(taskType) {
  if (!taskType) return CORE_HEADINGS.slice();
  return CORE_HEADINGS.slice();
}

function countWords(text) {
  return clean(text)
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function hasHeading(text, label) {
  const pattern = escapeRegex(label);
  return new RegExp(`^(?:##\\s*${pattern}|\\*\\*${pattern}\\*\\*:?|${pattern}:)\\b`, 'im').test(text);
}

function getMinimumWords(classification) {
  const taskType = classification?.taskType || 'legal_reasoning';
  const complexity = classification?.complexity || 'moderate';
  const base = {
    quick_qa: 45,
    summarization: 80,
    translation_of_legal_text: 70,
    bare_act_or_provision_explanation: 85,
    doctrine_explanation: 85,
    compliance_checklist: 110,
    legal_reasoning: 90,
    comparison: 120,
    document_analysis: 150,
    legal_research: 170,
    case_law_style_analysis: 190,
    legal_drafting: 180,
  }[taskType] || 90;

  if (complexity === 'complex') return base + 60;
  if (complexity === 'moderate') return base + 20;
  return base;
}

function getMinimumHeadingCount(taskType, headings) {
  if (!headings.length) return 0;
  if (taskType === 'quick_qa') return headings.length;
  return headings.length;
}

function looksTruncated(text) {
  const normalized = clean(text);
  if (!normalized) return false;
  if (/(?:^|\n)##\s+[^\n]+\s*$/.test(normalized)) return true;
  if (/(?:^|\n)[-*]\s*$/.test(normalized)) return true;
  if (/[(:\-]\s*$/.test(normalized)) return true;
  if (/\b(and|or|because|if|when|unless|including|such as|for example|for instance)\s*$/i.test(normalized)) return true;
  return false;
}

function looksGenericTemplate(text) {
  const matches = [
    /\bthe question concerns\b/i,
    /\ba cautious conclusion is\b/i,
    /\bcheck the governing contract or statute\b/i,
    /\bplease verify the exact wording and the latest primary source\b/i,
    /\bin indian legal analysis, the outcome usually turns on the exact wording\b/i,
  ].filter((pattern) => pattern.test(text)).length;

  return matches >= 2;
}

function assessAnswerQuality(answer, classification) {
  const text = clean(answer);
  const taskType = classification?.taskType || 'legal_reasoning';
  const headings = getRequiredHeadings(taskType);
  const headingCount = headings.filter((heading) => hasHeading(text, heading)).length;
  const wordCount = countWords(text);
  const minimumHeadingCount = getMinimumHeadingCount(taskType, headings);
  const reasons = [];

  if (!text) reasons.push('empty_answer');
  if (wordCount < getMinimumWords(classification)) reasons.push('too_short');
  if (minimumHeadingCount > 0 && headingCount < minimumHeadingCount) reasons.push('missing_structure');
  if (looksTruncated(text)) reasons.push('possibly_truncated');
  if (looksGenericTemplate(text)) reasons.push('generic_template');

  const score =
    headingCount * 24 +
    Math.min(wordCount, 320) -
    reasons.length * 38 -
    (looksTruncated(text) ? 18 : 0);

  return {
    ok: reasons.length === 0,
    text,
    taskType,
    reasons,
    requiredHeadings: headings,
    headingCount,
    wordCount,
    score,
  };
}

function buildRepairMessages(options) {
  const classification = options?.classification || {};
  const planId = options?.planId || 'free';
  const mixed = Boolean(options?.mixed);
  const sources = Array.isArray(options?.sources) ? options.sources : [];
  const requiredHeadings = getRequiredHeadings(classification.taskType);
  const issues = Array.isArray(options?.reasons) && options.reasons.length
    ? `Problems to fix: ${options.reasons.join(', ')}.`
    : 'Problems to fix: improve legal precision, structure, and completeness.';
  const headingInstruction = requiredHeadings.length
    ? `Use these exact headings when applicable: ${requiredHeadings.map((heading) => `## ${heading}`).join(', ')}.`
    : 'Use the exact Lexorium response structure.';

  return [
    {
      role: 'system',
      content: [
        prompt(planId, classification, mixed, sources),
        'You are revising a draft answer for Lexorium quality control.',
        headingInstruction,
        'Correct any mismatch between the question and the answer.',
        'Complete every section cleanly and do not leave the last sentence unfinished.',
        'If any authority or proposition is uncertain, say so clearly instead of guessing.',
        'Return only the revised final answer.',
      ].join('\n\n'),
    },
    {
      role: 'user',
      content: [
        `User query:\n${clean(options?.userText)}`,
        `Draft answer:\n${clean(options?.answer)}`,
        issues,
        'Rewrite the answer so it is complete, accurate, and ready to send to the user.',
      ].join('\n\n'),
    },
  ];
}

module.exports = {
  assessAnswerQuality,
  buildRepairMessages,
  getRequiredHeadings,
};
