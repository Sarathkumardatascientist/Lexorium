const { getJsonBody, sendJson, sendError } = require('../_lib/http');
const { executeAIRequest } = require('../_lib/ai-provider');

const SYSTEM_PROMPT = `You are the legal intelligence engine for an Indian platform called Lexorium.
Answer only Indian-law "Is it legal?" questions.
Keep answers simple, original, and under 120 words.
Do not copy from any source.
Do not give long disclaimers.
Use clear categories and confidence level.
If the issue is uncertain, choose "DEPENDS".

Respond in this exact JSON format:
{"status": "LEGAL|ILLEGAL|DEPENDS", "answer": "1-2 sentence direct answer", "explanation": "Simple explanation in max 4 lines", "law": "Relevant law, section, article, or principle", "example": "One practical real-life example", "takeaway": "One-line summary", "confidence": "Low|Medium|High"}`;

module.exports = async function (req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const body = await getJsonBody(req);
  const { question } = body;

  if (!question) {
    return sendError(res, 400, 'Question is required');
  }

  try {
    const response = await executeAIRequest('/chat', {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: question }
      ],
      model: 'claude-sonnet-4-20250514',
      temperature: 0.3,
      maxTokens: 500
    });

    const content = response?.content || '';
    
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