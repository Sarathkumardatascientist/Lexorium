const { getJsonBody, sendJson, sendError } = require('../_lib/http');

module.exports = async function (req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'Sarathkumardatascientist';
  const REPO_NAME = process.env.GITHUB_REPO_NAME || 'Lexorium';
  
  if (!GITHUB_TOKEN) {
    return sendError(res, 500, 'GitHub token not configured. Set GITHUB_TOKEN in Vercel environment variables.');
  }

  const body = await getJsonBody(req);
  const { content, message } = body;

  if (!content) {
    return sendError(res, 400, 'Content is required');
  }

  const filePath = 'insights-data.json';
  const commitMessage = message || 'Update legal insights data';
  const encodedContent = Buffer.from(content).toString('base64');

  try {
    // Check if file exists
    let sha = null;
    const getUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`;
    const getResponse = await fetch(getUrl, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Lexorium-Bot'
      }
    });
    
    if (getResponse.ok) {
      const getData = await getResponse.json();
      sha = getData.sha;
    }

    // Create or update file
    const putData = {
      message: commitMessage,
      content: encodedContent,
    };
    if (sha) putData.sha = sha;

    const putResponse = await fetch(getUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Lexorium-Bot'
      },
      body: JSON.stringify(putData)
    });

    if (!putResponse.ok) {
      const error = await putResponse.text();
      return sendError(res, 500, `GitHub API error: ${error}`);
    }

    const result = await putResponse.json();
    
    return sendJson(res, 200, { 
      success: true, 
      message: 'Published to GitHub! Vercel will auto-deploy.',
      commit: result.commit.sha
    });
  } catch (error) {
    return sendError(res, 500, `Error: ${error.message}`);
  }
};