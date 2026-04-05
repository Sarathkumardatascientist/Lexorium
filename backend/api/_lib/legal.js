const LEGAL = [
  'contract', 'agreement', 'clause', 'legal', 'compliance', 'notice', 'policy', 'privacy',
  'employment', 'labour', 'tax', 'gst', 'sebi', 'rbi', 'consumer', 'company law', 'nda',
  'litigation', 'dispute', 'regulation', 'license', 'licence', 'intellectual property',
  'copyright', 'trademark', 'lease', 'termination', 'breach', 'arbitration',
  'indemnity', 'liability', 'jurisdiction', 'forum', 'petition', 'plaint', 'affidavit',
  'injunction', 'damages', 'default', 'notice period', 'cause of action', 'warranty',
  'representation', 'undertaking', 'settlement', 'specific performance', 'survival',
  'confidentiality', 'non-compete', 'non solicitation', 'non-solicitation', 'draft',
  'drafting', 'legal notice', 'show cause', 'summons', 'appeal', 'revision', 'review',
  'court', 'tribunal', 'high court', 'supreme court', 'nclt', 'nclat', 'consumer forum',
  'civil', 'criminal', 'bail', 'fir', 'ipc', 'bns', 'bnss', 'bsa', 'crpc', 'cpc',
  'contract act', 'specific relief', 'evidence act', 'company act', 'company law',
  'partnership', 'llp', 'writ', 'consumer protection', 'rti', 'cheque', 'property',
  'title', 'partition', 'sale deed', 'gift deed', 'power of attorney', 'mortgage',
  'eviction', 'rent', 'tenant', 'landlord', 'divorce', 'maintenance', 'custody',
  'dowry', 'will', 'succession', 'inheritance', 'trademark', 'patent', 'design',
  'data protection', 'cyber', 'it act', 'employment law', 'gratuity', 'pf', 'esi',
  'posh', 'retrenchment', 'salary', 'termination letter', 'indemnify', 'indemnification',
];
const NONLEGAL = ['recipe', 'poem', 'joke', 'movie', 'song', 'lyrics', 'travel', 'workout', 'diet', 'game'];
const SENSITIVE_PATTERNS = [
  /\b(?:how to|how do i|help me|guide me|steps to|show me how to|best way to|ways to|teach me to)\b[\s\S]{0,90}\b(?:hack|deploy malware|spread malware|malware|ransomware|launder|blackmail|forge|extort)\b/i,
  /\b(?:hack|malware|ransomware|launder|blackmail|forge|extort)\b[\s\S]{0,60}\b(?:without getting caught|undetected|avoid detection|cover it up|hide it|evade the law)\b/i,
  /\b(?:evade|bypass|circumvent|avoid)\b[\s\S]{0,50}\b(?:law|tax|sanction|sanctions|compliance|police|regulator|regulators)\b/i,
];
const NONLEGAL_GREETINGS = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'thanks', 'thank you'];
const KNOWN_PROVISIONS = [
  {
    act: 'Indian Contract Act, 1872',
    matchers: [/\bsection\s*2\s*\(?h\)?\b/i, /\bs\.?\s*2\s*\(?h\)?\b/i],
    actMatchers: [/\bindian contract act\b/i, /\bcontract act\b/i],
    answer: [
      '## Issue',
      'The question asks for the meaning of Section 2(h) of the Indian Contract Act, 1872.',
      '',
      '## Applicable Law',
      'Section 2(h) states: "An agreement enforceable by law is a contract."',
      '',
      '## Analysis',
      'This is the basic statutory definition of a contract under Indian law. It separates a mere agreement from an agreement that the law will enforce. In practice, an agreement becomes a contract only when it satisfies the legal requirements for enforceability, such as lawful consideration, competent parties, free consent, lawful object, and sufficient certainty where applicable.',
      '',
      '## Conclusion',
      'Section 2(h) means that a contract is an agreement which the law recognizes as enforceable.',
      '',
      '## Practical Note',
      'Check whether the agreement satisfies Sections 10, 23, and 25 before treating it as enforceable in practice.',
      '',
      '## Disclaimer',
      'For live legal work, the related provisions, especially Sections 2(e), 10, 23, and 25, should also be checked against the latest primary source.',
    ].join('\n'),
  },
];

function clean(value) {
  return String(value || '').replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim();
}

function combine(text, files) {
  const docs = (Array.isArray(files) ? files : [])
    .map((file) => clean((file && file.textContent) || ''))
    .filter(Boolean);
  return [clean(text), ...docs].filter(Boolean).join('\n\n');
}

function hits(text, list) {
  const lower = text.toLowerCase();
  return list.some((item) => lower.includes(item));
}

function matchesAnyPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function looksClearlyNonLegal(text) {
  const lower = text.toLowerCase();
  const hasNonLegalKeyword = NONLEGAL.some((item) => lower.includes(item));
  if (!hasNonLegalKeyword) return false;

  const hasLegalSignal =
    hits(text, LEGAL) ||
    /\b(law|legal|court|clause|section|agreement|contract|notice|policy|dispute|termination|breach|liability|indemnity|arbitration|jurisdiction|petition|affidavit|lease|employment|property|company|consumer|civil|criminal|bail|fir|draft|summaris|summariz|analyse|analyze|compliance)\b/i.test(text);

  return !hasLegalSignal;
}

function looksPotentiallyLegal(text) {
  return (
    hits(text, LEGAL) ||
    /\b(explain|whether|valid|enforceable|liable|liability|rights?|obligations?|damages?|termination|survival|indemnity|contract|agreement|notice|legal|law|court|compliance|policy|clause|section|draft|summaris|summariz|analyse|analyze|research|petition|affidavit|tax|gst|consumer|employment|property)\b/i.test(text)
  );
}

function inferTopic(text) {
  return clean(text)
    .replace(/^(please\s+)?(explain whether|explain if|tell me about|what is|who is|how does|how to|explain|summaris(?:e|ing)|summariz(?:e|ing))\s+/i, '')
    .replace(/^[\s:,-]+/, '')
    .replace(/[.?!]+$/g, '')
    .slice(0, 140)
    .trim() || 'the legal issue you raised';
}

function buildNonLegalReply(text) {
  const lower = clean(text).toLowerCase();
  if (!lower) return 'Please enter a question.';

  if (NONLEGAL_GREETINGS.some((value) => lower === value || lower.startsWith(`${value} `))) {
    return 'Hello. I can help with legal and compliance questions, and I keep non-legal replies brief. If you want the legal aspect of a topic, ask it directly.';
  }

  return 'This appears to be outside Lexorium’s main legal scope, so I will keep the response brief. If you want the legal or compliance angle of this topic, ask that directly and I will address it precisely.';
}

function matchKnownProvision(text) {
  const source = clean(text);
  if (!source) return null;

  return KNOWN_PROVISIONS.find((item) => {
    const sectionMatched = item.matchers.some((matcher) => matcher.test(source));
    const actMatched = !Array.isArray(item.actMatchers) || item.actMatchers.length === 0
      ? true
      : item.actMatchers.some((matcher) => matcher.test(source));
    return sectionMatched && actMatched;
  }) || null;
}

function classify(text, files, mode) {
  const input = combine(text, files);
  if (!input) return { kind: 'empty', text: '', reply: 'Please enter a legal or compliance question.' };
  if (input.length > 16000) return { kind: 'large', text: input, reply: 'Please shorten the request or upload a smaller excerpt.' };
  const sensitive = matchesAnyPattern(input, SENSITIVE_PATTERNS);
  const legal = looksPotentiallyLegal(input) || (mode && mode !== 'chat');
  const clearNonLegal = looksClearlyNonLegal(input);
  if (legal && !clearNonLegal) return { kind: 'legal', text: input, reply: '', sensitive };
  if (legal) return { kind: 'mixed', text: input, reply: '', sensitive };
  if (!clearNonLegal) return { kind: 'legal', text: input, reply: '', sensitive };
  return {
    kind: 'nonlegal',
    text: input,
    reply: buildNonLegalReply(input),
    sensitive,
  };
}

function formatSourcePack(sources) {
  if (!Array.isArray(sources) || !sources.length) {
    return 'Verified source pack: none available. Do not invent source tags or authorities when no verified sources were provided.';
  }

  return [
    'Verified source pack. Use these only when relevant and cite them exactly with [SOURCE:n|Name|URL] tags at the end of the answer:',
    ...sources.map((source, index) => `${index + 1}. ${source.name} | ${source.url}${source.snippet ? ` | ${source.snippet}` : ''}`),
  ].join('\n');
}

function getTaskSpecificInstruction(taskType) {
  if (taskType === 'legal_drafting') {
    return 'In ## Analysis, include a clearly marked "Draft Output:" followed by the draft text. In ## Practical Note, list placeholders to confirm before use.';
  }
  if (taskType === 'case_law_style_analysis') {
    return 'In ## Analysis, summarise the key facts, issues, and reasoning of the case without inventing a citation.';
  }
  if (taskType === 'document_analysis') {
    return 'In ## Analysis, identify key findings and risk points from the document or clause.';
  }
  if (taskType === 'legal_research') {
    return 'In ## Applicable Law and ## Analysis, distinguish governing rule, unsettled areas, and what should be verified against primary sources.';
  }
  if (taskType === 'predictive_risk_scoring') {
    return 'In ## Analysis, assess the stated facts using a clearly labelled predictive risk score from 1 to 100, give a risk band of Low, Moderate, High, or Severe, explain the main legal drivers of the score, and identify what additional facts could materially change the assessment. Do not present the score as certain or actuarial.';
  }
  if (taskType === 'compliance_checklist') {
    return 'In ## Analysis, provide a practical compliance checklist using short bullet points.';
  }
  if (taskType === 'summarization') {
    return 'Keep each section concise while preserving the legal position accurately.';
  }
  if (taskType === 'comparison') {
    return 'In ## Analysis, compare the legal positions side by side before giving the final takeaway.';
  }
  return 'Keep the reasoning crisp, legally grounded, and easy to follow for a professional user.';
}

function getPersonalizationInstruction(personalization) {
  const prefs = personalization && typeof personalization === 'object' ? personalization : {};
  const lines = [];
  const customInstructions = clean(prefs.customInstructions || '').slice(0, 320);

  if (prefs.baseTone === 'professional') lines.push('Use a polished professional tone.');
  if (prefs.baseTone === 'concise') lines.push('Be especially concise while preserving all required headings.');
  if (prefs.baseTone === 'supportive') lines.push('Use a calm supportive tone while remaining precise and professional.');

  if (prefs.warmth === 'subtle') lines.push('Keep warmth subtle and restrained.');
  if (prefs.warmth === 'balanced') lines.push('Use a balanced amount of warmth and clarity.');
  if (prefs.warmth === 'high') lines.push('Sound distinctly warm and human while staying disciplined.');

  if (prefs.enthusiasm === 'low') lines.push('Keep the phrasing calm and understated.');
  if (prefs.enthusiasm === 'balanced') lines.push('Use lightly energetic phrasing where natural.');
  if (prefs.enthusiasm === 'high') lines.push('Use confident energetic phrasing without sounding casual.');

  if (prefs.headersLists === 'minimal') lines.push('Keep section formatting compact and avoid unnecessary bullets.');
  if (prefs.headersLists === 'balanced') lines.push('Use short bullet points only when they improve clarity.');
  if (prefs.headersLists === 'detailed') lines.push('Use concise internal lists where they improve readability inside the fixed response structure.');

  if (customInstructions) {
    lines.push(`Follow these user style preferences when safe and consistent with legal accuracy: ${customInstructions}`);
  }

  return lines.join(' ');
}

function prompt(planId, classification, mixed, sources, sensitive, personalization) {
  const taskType = classification?.taskType || 'legal_reasoning';
  const complexity = classification?.complexity || 'moderate';
  const paidPlan = ['pro', 'enterprise'].includes(planId);
  const depthInstruction = paidPlan
    ? 'Be precise, premium, and professionally structured.'
    : 'Be accurate, precise, clear, disciplined, and concise while preserving legal accuracy.';
  const personalizationInstruction = getPersonalizationInstruction(personalization);

  return [
    paidPlan ? 'You are Lexorium, a premium legal intelligence engine.' : 'You are Lexorium, a legal intelligence engine.',
    'You answer only legal and compliance questions.',
    'You are not a law firm and you do not create a lawyer-client relationship.',
    'If jurisdiction is not specified, assume India and mention that assumption in ## Applicable Law or ## Disclaimer when relevant.',
    depthInstruction,
    complexity === 'complex'
      ? 'Accuracy takes priority over speed. If authority is uncertain, say so clearly and identify what should be verified against the latest primary source.'
      : 'Keep the answer concise but structured. Do not omit important legal caveats.',
    'Every legal response must use these exact headings, in this exact order: ## Issue, ## Applicable Law, ## Analysis, ## Conclusion, ## Practical Note, ## Disclaimer.',
    'Every heading must be completed. Do not omit a heading, and do not leave the final sentence unfinished.',
    'If files, clauses, extracts, or images are provided, analyse their contents directly and answer the legal issue they raise instead of merely describing the upload.',
    mixed ? 'Answer only the legal and compliance aspects of the request.' : 'Answer only legal and compliance subject matter.',
    'Do not mention Puter, provider names, model names, routing, or backend systems unless the user explicitly asks.',
    'Never say "as an AI model" or expose internal implementation details.',
    'Never fabricate statutes, sections, case names, citations, courts, dates, holdings, tests, or source URLs.',
    'Do not introduce named case citations unless the user specifically asked for case law or a verified source pack was provided. If certainty is low, say the authority should be checked against the latest primary source.',
    'Do not cite a statutory provision, section number, or case merely to sound authoritative.',
    'If a legal authority or proposition is uncertain, say so plainly.',
    sensitive
      ? 'If the request appears to seek wrongdoing, evasion, or harmful operational steps, do not provide instructions. Instead explain the legal exposure, likely offences or penalties, reporting or compliance duties, and lawful next steps.'
      : 'If the request raises potentially unlawful conduct, keep the response lawful, safety-focused, and compliance-oriented.',
    getTaskSpecificInstruction(taskType),
    personalizationInstruction,
    'Distinguish clearly between established rule, interpretation, practical guidance, and uncertainty.',
    'In ## Disclaimer, state clearly that Lexorium provides legal information, not legal advice, and mention when local counsel or primary-source verification is needed.',
    'When verified sources are available, cite only those sources at the end of the response using exactly this format: [SOURCE:1|Name of Source|https://example.com]',
    formatSourcePack(sources),
  ].filter(Boolean).join('\n\n');
}

function buildFallbackAnswer(options) {
  const classification = options?.classification || {};
  const text = clean(options?.text || '');
  const taskType = classification.taskType || 'legal_reasoning';
  const topic = inferTopic(text);
  const knownProvision = matchKnownProvision(text);

  if (taskType === 'bare_act_or_provision_explanation' && knownProvision) {
    return knownProvision.answer;
  }

  return [
    '## Issue',
    `Lexorium could not complete a verified answer on ${topic} from the live legal model.`,
    '',
    '## Applicable Law',
    'The exact legal position could not be confirmed from the current live response, so no legal rule is being asserted here.',
    '',
    '## Analysis',
    'The safest next step is to retry with the exact clause, provision, jurisdiction, and factual context so the answer can be verified properly.',
    '',
    '## Conclusion',
    'No reliable legal conclusion should be drawn from this failed model response.',
    '',
    '## Practical Note',
    'Resend the query with the governing document excerpt or the exact statutory provision for a more accurate result.',
    '',
    '## Disclaimer',
    'Lexorium provides legal information, not legal advice. Verify the latest primary source before relying on any legal position.',
  ].join('\n\n');
}

module.exports = { buildFallbackAnswer, classify, combine, clean, prompt };
