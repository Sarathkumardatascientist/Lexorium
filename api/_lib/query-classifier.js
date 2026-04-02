function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function detectTaskType(text, mode, hasAttachments) {
  if (mode === 'draft') return 'legal_drafting';
  if (mode === 'summarize') return 'summarization';
  if (mode === 'research') return 'legal_research';
  if (mode === 'analyse' && hasAttachments) return 'document_analysis';

  const complianceChecklistIntent = hasAny(text, [
    /\bcompliance checklist\b/i,
    /\bchecklist\b/i,
    /\bcompliance steps?\b/i,
    /\bwhat should we comply with\b/i,
    /\bregulatory checklist\b/i,
  ]);

  const documentAnalysisIntent = hasAny(text, [
    /\banaly[sz]e\b.+\b(clause|contract|agreement|document|notice|policy|term|provision)\b/i,
    /\breview\b.+\b(clause|contract|agreement|document|notice|policy|term|provision)\b/i,
    /\bcheck\b.+\b(risk|risks|red flags?|issues?)\b/i,
    /\bred flags?\b/i,
    /\brisk assessment\b/i,
  ]);
  const researchIntent = hasAny(text, [
    /\bresearch\b/i,
    /\bfind authorities\b/i,
    /\bfind cases\b/i,
    /\bcase law\b/i,
    /\bcitations?\b/i,
    /\bprecedents?\b/i,
  ]);

  const draftingIntent = hasAny(text, [
    /\bdraft\b/i,
    /\bprepare\b.+\b(notice|agreement|contract|clause|reply|petition|affidavit|memo|memorandum)\b/i,
    /\bwrite\b.+\b(notice|agreement|contract|clause|reply|petition|affidavit|memo|memorandum)\b/i,
    /\bcreate\b.+\b(notice|agreement|contract|clause|reply|petition|affidavit|memo|memorandum)\b/i,
    /\bredraft\b/i,
    /\brevise\b.+\b(clause|agreement|contract|notice)\b/i,
    /\btemplate\b/i,
    /\bformat\b.+\b(notice|agreement|contract|clause)\b/i,
    /\bshow me a draft\b/i,
  ]);
  const explanatoryIntent = hasAny(text, [
    /^\s*(explain|what|whether|can|does|is|when|how|why)\b/i,
    /\bmeaning of\b/i,
    /\binterpret\b/i,
    /\banalyse\b/i,
    /\banalysis\b/i,
    /\bsurvive\b/i,
    /\benforceable\b/i,
    /\bvalidity\b/i,
  ]);

  if (draftingIntent && !explanatoryIntent) {
    return 'legal_drafting';
  }
  if (documentAnalysisIntent || (hasAttachments && explanatoryIntent)) {
    return 'document_analysis';
  }
  if (researchIntent) {
    return 'legal_research';
  }
  if (complianceChecklistIntent) {
    return 'compliance_checklist';
  }
  if (hasAny(text, [/\bsummar(?:y|ise|ize)\b/i, /\bbrief\b/i, /\bcondense\b/i])) {
    return 'summarization';
  }
  if (hasAny(text, [/\bcompare\b/i, /\bdifference\b/i, /\bversus\b/i, /\bvs\.?\b/i])) {
    return 'comparison';
  }
  if (hasAny(text, [/\btranslate\b/i, /\btranslation\b/i])) {
    return 'translation_of_legal_text';
  }
  if (hasAny(text, [/\bsection\b/i, /\barticle\b/i, /\brule\b/i, /\bprovision\b/i, /\bbare act\b/i])) {
    return 'bare_act_or_provision_explanation';
  }
  if (hasAny(text, [/\bdoctrine\b/i, /\bprinciple\b/i, /\bratio\b/i, /\bprecedent\b/i])) {
    return 'doctrine_explanation';
  }
  if (hasAny(text, [/\bjudgment\b/i, /\bjudgement\b/i, /\bholding\b/i, /\bcase law\b/i, /\bcitation\b/i])) {
    return 'case_law_style_analysis';
  }
  if (explanatoryIntent) {
    return 'legal_reasoning';
  }
  if (text.length < 140 && !hasAttachments) return 'quick_qa';
  return 'legal_reasoning';
}

function detectComplexity(text, taskType, hasAttachments) {
  const score =
    (text.length > 1000 ? 3 : text.length > 450 ? 2 : text.length > 180 ? 1 : 0) +
    (hasAttachments ? 2 : 0) +
    (taskType === 'legal_drafting' ? 2 : 0) +
    (taskType === 'case_law_style_analysis' ? 2 : 0) +
    (taskType === 'document_analysis' ? 2 : 0) +
    (taskType === 'legal_research' ? 2 : 0) +
    (taskType === 'compliance_checklist' ? 2 : 0) +
    (taskType === 'comparison' ? 2 : 0) +
    (taskType === 'legal_reasoning' ? 1 : 0);

  if (score >= 5) return 'complex';
  if (score >= 2) return 'moderate';
  return 'simple';
}

function getRequiredFeature(taskType, mode) {
  if (mode === 'draft' || taskType === 'legal_drafting') return 'draftMode';
  if (mode === 'summarize' || taskType === 'summarization') return 'summarizeMode';
  if (mode === 'research') return 'researchTool';
  return null;
}

function classifyQuery(options) {
  const text = clean(options?.text);
  const mode = String(options?.mode || 'chat').trim().toLowerCase();
  const attachments = Array.isArray(options?.attachments) ? options.attachments : [];
  const hasAttachments = attachments.length > 0;
  const taskType = detectTaskType(text, mode, hasAttachments);
  const complexity = detectComplexity(text, taskType, hasAttachments);

  return {
    text,
    mode,
    taskType,
    complexity,
    hasAttachments,
    requiresStrongReasoning: complexity === 'complex' || ['legal_reasoning', 'case_law_style_analysis', 'comparison', 'document_analysis', 'legal_research', 'compliance_checklist'].includes(taskType),
    prefersStructuredOutput: true,
    acceptsFastResponse: complexity === 'simple' && ['quick_qa', 'summarization', 'translation_of_legal_text'].includes(taskType),
    assumesJurisdiction: 'india',
    requiredFeature: getRequiredFeature(taskType, mode),
  };
}

module.exports = {
  classifyQuery,
};
