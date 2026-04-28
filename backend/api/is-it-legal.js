const { getJsonBody, sendJson } = require('../_lib/http');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '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';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

const SYSTEM_PROMPT = `You are Lexorium's legal intelligence engine. Answer ONLY Indian-law "Is it legal?" questions.

Respond in this EXACT JSON format:
{
  "status": "LEGAL" or "ILLEGAL" or "DEPENDS",
  "answer": "1-2 sentence direct answer",
  "explanation": "Simple explanation in 2-4 lines about Indian law",
  "law": "Relevant law, section, IPC, article, or legal principle",
  "example": "One practical real-life example in India",
  "takeaway": "One-line summary",
  "confidence": "Low" or "Medium" or "High",
  "warning": "Any important caveat or warning"
}

Keep answers under 120 words. Use "DEPENDS" if uncertain. Format as JSON only.`;

async function callAI(messages) {
  try {
    const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://lexorium.com',
        'X-Title': 'Lexorium',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages: messages,
        temperature: 0.3,
        max_tokens: 600,
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error('AI error: ' + response.status + ' - ' + err.slice(0, 100));
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content || '';
    
    if (!content) {
      throw new Error('Empty response from AI');
    }
    
    return JSON.parse(content);
  } catch (err) {
    console.error('callAI error:', err.message);
    return {
      status: 'DEPENDS',
      answer: 'Service temporarily unavailable. Please try again.',
      explanation: 'Could not get a response from the legal AI.',
      law: '',
      example: '',
      takeaway: 'Consult a qualified lawyer for legal advice.',
      confidence: 'Low',
      warning: ''
    };
  }
}

module.exports = async function (req, res) {
  console.log('[is-it-legal] Request method:', req.method, 'url:', req.url);
  
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const body = await getJsonBody(req);
  const { question, mode } = body;
  
  console.log('[is-it-legal] Question:', question, 'mode:', mode);

  if (!question || mode !== 'is-it-legal') {
    return sendJson(res, 400, { error: 'Invalid request' });
  }

  try {
    console.log('[is-it-legal] Calling AI...');
    const answer = await callAI([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: question }
    ]);
    console.log('[is-it-legal] AI response:', JSON.stringify(answer).slice(0, 200));

    return sendJson(res, 200, { answer });
  } catch (error) {
    console.error('[isItLegal error]:', error.message);
    return sendJson(res, 500, { error: error.message });
  }
};