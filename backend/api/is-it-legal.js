const { getJsonBody, sendJson, sendError } = require('../_lib/http');

const PUTER_API_ORIGIN = 'https://api.puter.com';

async function callPuter(messages) {
  const response = await fetch(`${PUTER_API_ORIGIN}/puterai/openai/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      messages: messages,
      temperature: 0.3,
      max_tokens: 500
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error('Puter API error: ' + response.status);
  }

  const result = await response.json();
  return result?.choices?.[0]?.message?.content || '';
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const body = await getJsonBody(req);
  const { question } = body;

  if (!question) {
    return sendError(res, 400, 'Question is required');
  }

  const defaultPrompt = `You are the legal intelligence engine for an Indian platform called Lexorium.
Answer only Indian-law "Is it legal?" questions.
Keep answers simple, original, and under 120 words.
Do not copy from any source.
Do not give long disclaimers.
Use clear categories and confidence level.
If the issue is uncertain, choose "DEPENDS".

Respond in this exact JSON format:
{"status": "LEGAL|ILLEGAL|DEPENDS", "answer": "1-2 sentence direct answer", "explanation": "Simple explanation in max 4 lines", "law": "Relevant law, section, article, or principle", "example": "One practical real-life example", "takeaway": "One-line summary", "confidence": "Low|Medium|High"}`;

  try {
    const content = await callPuter([
      { role: 'system', content: defaultPrompt },
      { role: 'user', content: question }
    ]);
    
    let answer;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        answer = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      answer = {
        status: 'DEPENDS',
        answer: content.slice(0, 100) || content,
        explanation: 'Could not parse structured answer. Consult a lawyer.',
        law: '',
        example: '',
        takeaway: 'Consult a lawyer for definitive advice.',
        confidence: 'Low'
      };
    }

    return sendJson(res, 200, { answer });
  } catch (error) {
    console.error('Is It Legal API error:', error.message);
    return sendError(res, 500, error.message);
  }
};