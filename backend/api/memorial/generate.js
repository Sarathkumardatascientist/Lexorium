const { sendJson, sendError, parseJsonBody, requireMethod } = require('../_lib/http');
const { executeWithPuter, extractPuterToken } = require('../_lib/puter-client');

const MEMORIAL_MODEL = { id: 'google/gemini-3.1-flash-lite-preview', label: 'Gemini Flash' };

function buildMemorialPromptForSide(proposition, side) {
  const label = side.charAt(0).toUpperCase() + side.slice(1);
  return [
    { role: 'system', content: `You are an expert moot court memorial drafter. Draft a complete moot court memorial for the ${label}.

The memorial must follow this structure exactly:

## COVER PAGE
## INDEX
## TABLE OF AUTHORITIES
## STATEMENT OF JURISDICTION  
## STATEMENT OF FACTS
## ISSUES RAISED
## SUMMARY OF ARGUMENTS
## ARGUMENTS ADVANCED
## PRAYER
## RELEVANT CASE LAWS AND CITATIONS

RULES:
- Use formal legal English
- Each section starts with "## SECTION NAME"
- Include proper legal citations (Indian citation style)
- Arguments must be legally sound and cite relevant precedents
- Tailor to the jurisdiction implied by the facts
- ${side === 'petitioner' ? 'Argue FROM the Petitioner\'s perspective, advocating FOR the petitioner.' : 'Argue FROM the Respondent\'s perspective, defending AGAINST the petitioner\'s claims.'}
- Be thorough — arguments advanced should be detailed (3-5 paragraphs per issue)

Moot proposition:` },
    { role: 'user', content: proposition },
  ];
}

async function callPuterAI(messages, authToken) {
  const route = { orderedModels: [MEMORIAL_MODEL] };
  const result = await executeWithPuter(route, {
    authToken,
    payload: { messages, temperature: 0.4, max_tokens: 8192 },
  });
  return result.content;
}

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;

  const body = await parseJsonBody(req).catch((err) => ({ __error: err }));
  if (body.__error) return sendError(res, body.__error.statusCode || 400, body.__error.message);

  const authToken = extractPuterToken(req, body);
  if (!authToken) return sendError(res, 401, 'Sign in is required.');

  const proposition = String(body.proposition || '').trim();
  if (!proposition) return sendError(res, 400, 'Moot proposition text is required.');

  const side = String(body.side || '').trim().toLowerCase();
  if (!['petitioner', 'respondent', 'both'].includes(side)) {
    return sendError(res, 400, 'Side must be "petitioner", "respondent", or "both".');
  }

  try {
    if (side === 'both') {
      const [petitionerMemorial, respondentMemorial] = await Promise.all([
        callPuterAI(buildMemorialPromptForSide(proposition, 'petitioner'), authToken),
        callPuterAI(buildMemorialPromptForSide(proposition, 'respondent'), authToken),
      ]);

      return sendJson(res, 200, {
        ok: true,
        side: 'both',
        petitioner: { content: petitionerMemorial },
        respondent: { content: respondentMemorial },
      });
    }

    const content = await callPuterAI(buildMemorialPromptForSide(proposition, side), authToken);

    return sendJson(res, 200, {
      ok: true,
      side,
      content,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    const message = error.message || 'Memorial generation failed. Please try again.';
    return sendError(res, status, message);
  }
};
