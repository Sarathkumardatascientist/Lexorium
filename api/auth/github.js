const { createGithubState, getPublicAppUrl } = require('./_session');

module.exports = async (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const publicAppUrl = getPublicAppUrl();

  if (!clientId) {
    return res.status(500).send('GITHUB_CLIENT_ID is not configured on the server.');
  }

  const redirectUri = `${publicAppUrl}/api/auth/github/callback`;
  const state = createGithubState('/app.html');

  const githubUrl = new URL('https://github.com/login/oauth/authorize');
  githubUrl.searchParams.set('client_id', clientId);
  githubUrl.searchParams.set('redirect_uri', redirectUri);
  githubUrl.searchParams.set('scope', 'read:user user:email');
  githubUrl.searchParams.set('state', state);

  res.writeHead(302, { Location: githubUrl.toString() });
  res.end();
};
