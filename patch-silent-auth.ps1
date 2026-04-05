$path = "c:\Users\A SARATH KUMAR\Desktop\Company\Lexorium\Lexorium-github-upload\app.html"
$content = Get-Content -Path $path -Raw

# Replace the entire callLexoriumModel function with the strictly silent version
$oldFunction = '  async function callLexoriumModel\(modelId, messages, attachments, mode\) \{[\s\r\n]+// Get token silently\. If missing, we proceed anyway and trust the session cookie\.[\s\r\n]+let puterToken = await getRequiredPuterToken\(false\) \|\| '''';[\s\r\n]+const retention = getRetentionState\(\);[\s\r\n]+const personalization = getPersonalizationState\(\);[\s\r\n]+const requestBody = JSON\.stringify\(\{[\s\r\n]+conversationId: currentConversationId,[\s\r\n]+title: chatTitle,[\s\r\n]+mode: mode \|\| ''chat'',[\s\r\n]+persona: retention\.persona \|\| '''',[\s\r\n]+primaryUseCase: retention\.primaryUseCase \|\| '''',[\s\r\n]+personalization,[\s\r\n]+messages: buildApiMessages\(messages, attachments\),[\s\r\n]+\}\);[\s\r\n]+const requestWithToken = async \(token\) => fetch\(CHAT_API_URL, \{[\s\r\n]+method: ''POST'',[\s\r\n]+headers: \{[\s\r\n]+''Content-Type'': ''application/json'',[\s\r\n]+\.\.\.\(token \? \{ ''X-Puter-Token'': token \} : \{\}\),[\s\r\n]+\},[\s\r\n]+credentials: ''same-origin'',[\s\r\n]+body: requestBody,[\s\r\n]+\}\)\.catch\(\(\) => \{ throw new Error\(''Could not reach the Lexorium server\. Start the local server or open the deployed app\.''\); \}\);[\s\r\n]+let response = await requestWithToken\(puterToken\);[\s\r\n]+if \(response\.status === 401\) \{[\s\r\n]+// First 401: attempt a silent token refresh\.[\s\r\n]+await syncSessionPayloadWithPuter\(false\)\.catch\(\(\) => null\);[\s\r\n]+const silentToken = getStoredPuterToken\(\);[\s\r\n]+if \(silentToken && silentToken !== puterToken\) \{[\s\r\n]+puterToken = silentToken;[\s\r\n]+response = await requestWithToken\(puterToken\);[\s\r\n]+\}[\s\r\n]+\}[\s\r\n]+if \(response\.status === 401\) \{[\s\r\n]+// Second 401: show the Puter sign-in popup and retry once more\.[\s\r\n]+try \{[\s\r\n]+await syncSessionPayloadWithPuter\(true\);[\s\r\n]+\} catch \(_reauthError\) \{[\s\r\n]+// Popup was closed or failed — fall through to sign-in error below\.[\s\r\n]+\}[\s\r\n]+const freshToken = getStoredPuterToken\(\);[\s\r\n]+if \(freshToken && freshToken !== puterToken\) \{[\s\r\n]+puterToken = freshToken;[\s\r\n]+response = await requestWithToken\(puterToken\);[\s\r\n]+\}[\s\r\n]+\}[\s\r\n]+if \(response\.status === 401\) \{[\s\r\n]+const sessionError = new Error\(''Sign in is required to continue\.''\);[\s\r\n]+sessionError\.code = ''PUTER_AUTH_REQUIRED'';[\s\r\n]+throw sessionError;[\s\r\n]+\}'

$newFunction = '  async function callLexoriumModel(modelId, messages, attachments, mode) {
    // 1. Get token silently.
    let puterToken = await getRequiredPuterToken(false) || '''';

    // 2. If token is missing but we are supposedly signed in, try one last background hydration from the SDK.
    if (!puterToken && currentUserUid && window.puter?.auth?.getAuthToken) {
      puterToken = String(window.puter.auth.getAuthToken() || '''').trim();
      if (puterToken) setStoredPuterToken(puterToken);
    }

    const retention = getRetentionState();
    const personalization = getPersonalizationState();
    const requestBody = JSON.stringify({
      conversationId: currentConversationId,
      title: chatTitle,
      mode: mode || ''chat'',
      persona: retention.persona || '''',
      primaryUseCase: retention.primaryUseCase || '''',
      personalization,
      messages: buildApiMessages(messages, attachments),
    });
    const requestWithToken = async (token) => fetch(CHAT_API_URL, {
      method: ''POST'',
      headers: {
        ''Content-Type'': ''application/json'',
        ...(token ? { ''X-Puter-Token'': token } : {}),
      },
      credentials: ''same-origin'',
      body: requestBody,
    }).catch(() => { throw new Error(''Could not reach the Lexorium server. Start the local server or open the deployed app.''); });

    let response = await requestWithToken(puterToken);

    // 3. Handle 401 (Unauthorised) - strictly via background refresh only
    if (response.status === 401) {
      // Attempt ONE silent token refresh in the background.
      await syncSessionPayloadWithPuter(false).catch(() => null);
      const refreshedToken = getStoredPuterToken();
      if (refreshedToken && refreshedToken !== puterToken) {
        puterToken = refreshedToken;
        response = await requestWithToken(puterToken);
      }
    }

    // 4. Final check for 401: If still unauthorised, we throw an error instead of showing a dialog box.
    if (response.status === 401) {
      // We do NOT call syncSessionPayloadWithPuter(true) here to avoid the guest popup.
      const authError = new Error(''Your session has expired. Please refresh the page to continue.'');
      authError.code = ''PUTER_AUTH_REQUIRED'';
      throw authError;
    }'

$content = [regex]::Replace($content, $oldFunction, $newFunction)
Set-Content -Path $path -Value $content -NoNewline
