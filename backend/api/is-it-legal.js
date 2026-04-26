const { getJsonBody, sendJson } = require('../_lib/http');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

const SYSTEM_PROMPT = `You are the legal intelligence engine for an Indian platform called Lexorium.
Answer only Indian-law "Is it legal?" questions.
Keep answers simple, original, and under 120 words.
Do not copy from any source.
Do not give long disclaimers.
Use clear categories and confidence level.
If the issue is uncertain, choose "DEPENDS".

Respond in this EXACT JSON format - no extra text:
{"status":"LEGAL","answer":"answer here","explanation":"explanation","law":"law section","example":"example","takeaway":"takeaway","confidence":"High"}`;

async function callOpenRouter(messages) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('API key not set. Add OPENROUTER_API_KEY env in Vercel.');
  }

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
      max_tokens: 500,
      response_format: { type: 'json_object' }
    }),
  });

  const text = await response.text();
  
  if (!response.ok) {
    throw new Error('OpenRouter error ' + response.status + ': ' + text.slice(0, 200));
  }

  try {
    const result = JSON.parse(text);
    return result?.choices?.[0]?.message?.content || '';
  } catch {
    throw new Error('Invalid JSON response: ' + text.slice(0, 100));
  }
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const body = await getJsonBody(req);
  const { question } = body;

  if (!question) {
    return sendJson(res, 400, { error: 'Question is required' });
  }

  try {
    const content = await callOpenRouter([
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: question }
    ]);
    
    let answer;
    try {
      answer = JSON.parse(content);
    } catch {
      answer = {
        status: 'DEPENDS',
        answer: content.slice(0, 100),
        explanation: 'Could not parse. Consult a lawyer.',
        law: '',
        example: '',
        takeaway: 'Get professional legal advice.',
        confidence: 'Low'
      };
    }

    return sendJson(res, 200, { answer });
  } catch (error) {
    console.error('Is It Legal error:', error.message);
    return sendJson(res, 500, { error: error.message });
  }
};