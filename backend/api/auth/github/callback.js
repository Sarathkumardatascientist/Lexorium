const { createSessionCookie, getPublicAppUrl, readGithubState } = require('../_session');

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || `GitHub API error ${response.status}`);
  }
  return data;
}

module.exports = async (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const publicAppUrl = getPublicAppUrl();

  if (!clientId || !clientSecret) {
    return res.status(500).send('GitHub OAuth is not configured on the server.');
  }

  const code = req.query?.code;
  const state = req.query?.state;
  if (!code) {
    return res.status(400).send('Missing GitHub authorization code.');
  }

  const statePayload = readGithubState(state);
  if (!statePayload) {
    return res.status(400).send('GitHub OAuth state was invalid or expired.');
  }

  try {
    const tokenData = await fetchJson('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${publicAppUrl}/api/auth/github/callback`,
      }),
    });

    const accessToken = tokenData.access_token;
    if (!accessToken) {
      throw new Error(tokenData.error_description || 'GitHub access token was not returned.');
    }

    const user = await fetchJson('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Lexorium',
      },
    });

    const emailData = await fetchJson('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Lexorium',
      },
    });

    const primaryEmail = Array.isArray(emailData)
      ? (emailData.find(item => item.primary)?.email || emailData[0]?.email || '')
      : '';

    const redirectUrl = new URL(statePayload.next || '/app.html', publicAppUrl);

    res.setHeader('Set-Cookie', createSessionCookie({
      sub: String(user.id || ''),
      name: user.name || user.login || '',
      email: primaryEmail,
      picture: user.avatar_url || '',
      provider: 'github',
    }));

    res.writeHead(302, { Location: redirectUrl.toString() });
    res.end();
  } catch (error) {
    res.status(500).send(error?.message || 'GitHub sign-in failed.');
  }
};
