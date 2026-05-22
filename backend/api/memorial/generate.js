const { sendJson, sendError, parseJsonBody, requireMethod } = require('../_lib/http');

const PUTER_API_ORIGIN = 'https://api.puter.com';

function normalizeToken(value) {
  return String(value || '').trim();
}

function extractPuterToken(req, body) {
  const headerToken = normalizeToken(req?.headers?.['x-puter-token']);
  const bodyToken = normalizeToken(body?.puterToken || body?.token);
  if (bodyToken && headerToken && bodyToken !== headerToken) return bodyToken;
  if (headerToken) return headerToken;
  const authorization = normalizeToken(req?.headers?.authorization);
  if (/^bearer\s+/i.test(authorization)) {
    return authorization.replace(/^bearer\s+/i, '').trim();
  }
  return bodyToken;
}

function buildMemorialPrompt(proposition, side) {
  const sideLabel = side === 'both' ? 'Petitioner and Respondent' : side === 'petitioner' ? 'Petitioner' : 'Respondent';
  return [
    { role: 'system', content: `You are an expert moot court memorial drafter with deep knowledge of legal drafting, citation standards, and jurisdictional reasoning. Draft a professional moot court memorial for the ${sideLabel} side.

The memorial must include ALL of the following sections in order:

1. COVER PAGE — Include:
   - Title: "MEMORIAL ON BEHALF OF THE ${sideLabel === 'Petitioner and Respondent' ? '[SIDE]' : sideLabel.toUpperCase()}"
   - Court name: "Before the Honorable Supreme Court of India" (adjust if jurisdiction differs)
   - Case title (derive from proposition)
   - Submitted by: "Counsel on Behalf of the ${sideLabel === 'Petitioner and Respondent' ? '[SIDE]' : sideLabel}"

2. INDEX / TABLE OF CONTENTS — List all sections with page numbers.

3. TABLE OF AUTHORITIES — Categorize into:
   - Cases (with full citations: case name, year, volume, reporter, page)
   - Statutes (with act name, year, section numbers)
   - Books/Articles (if referenced)

4. STATEMENT OF JURISDICTION — State the court's jurisdiction with relevant constitutional/statutory provisions.

5. STATEMENT OF FACTS — Concise, neutral summary of the material facts from the proposition. Do not argue here.

6. ISSUES RAISED — Frame 2-4 legal issues precisely as questions.

7. SUMMARY OF ARGUMENTS — Brief overview of the core arguments (2-3 paragraphs).

8. ARGUMENTS ADVANCED — Detailed legal arguments for EACH issue raised:
   - Cite relevant case law with proper citations
   - Reference statutory provisions
   - Apply legal principles to the facts
   - Use formal legal language
   - Each argument should cite at least 2-3 relevant precedents

9. PRAYER — Formal prayer for relief in 3-4 points.

10. RELEVANT CASE LAWS AND CITATIONS — Complete list of all authorities cited with full citations.

CRITICAL FORMATTING RULES:
- Use formal legal English throughout
- Each section heading must be in format: "## SECTION NAME"
- Use proper legal citation format (Indian citation style)
- Arguments must be logically structured and legally sound
- Include jurisdiction-specific reasoning based on the facts
- If the proposition mentions specific laws or jurisdictions, tailor arguments accordingly
- For "Both" sides, you will receive two separate calls — one for Petitioner, one for Respondent

Content of the moot proposition to base the memorial on:` },
    { role: 'user', content: proposition },
  ];
}

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
  const response = await fetch(`${PUTER_API_ORIGIN}/puterai/openai/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash',
      messages,
      temperature: 0.4,
      max_tokens: 8192,
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result?.error) {
    const status = response.status;
    const msg = result?.error?.message || result?.message || `AI request failed with status ${status}`;
    const err = new Error(msg);
    err.statusCode = status;
    throw err;
  }

  const payload = result?.result || result;
  const content = payload?.choices?.[0]?.message?.content
    || payload?.choices?.[0]?.text
    || (typeof payload === 'string' ? payload : null);

  if (!content) {
    const err = new Error('AI returned an empty response.');
    err.statusCode = 500;
    throw err;
  }

  return content;
}

module.exports = async (req, res) => {
  if (!requireMethod(req, res, 'POST')) return;

  const body = await parseJsonBody(req).catch((err) => ({ __error: err }));
  if (body.__error) return sendError(res, body.__error.statusCode || 400, body.__error.message);

  const authToken = extractPuterToken(req, body);
  if (!authToken) return sendError(res, 401, 'Authentication is required. Please sign in.');

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
