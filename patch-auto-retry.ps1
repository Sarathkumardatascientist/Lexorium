$path = "c:\Users\A SARATH KUMAR\Desktop\Company\Lexorium\Lexorium-github-upload\app.html"
$content = Get-Content -Path $path -Raw

# Update callLexoriumModel to handle 401 with an automatic retry after silent re-sync
$oldCallModel = '    let response = await requestWithToken\(puterToken\);[\s\r\n]+// 3\. Handle 401 \(Unauthorised\) - strictly via background refresh only[\s\r\n]+if \(response\.status === 401\) \{[\s\r\n]+// Attempt ONE silent token refresh in the background\.[\s\r\n]+await syncSessionPayloadWithPuter\(false\)\.catch\(\(\) => null\);[\s\r\n]+const refreshedToken = getStoredPuterToken\(\);[\s\r\n]+if \(refreshedToken && refreshedToken !== puterToken\) \{[\s\r\n]+puterToken = refreshedToken;[\s\r\n]+response = await requestWithToken\(puterToken\);[\s\r\n]+\}[\s\r\n]+\}[\s\r\n]+// 4\. Final check for 401: If still unauthorised, we throw an error instead of showing a dialog box\.[\s\r\n]+if \(response\.status === 401\) \{[\s\r\n]+// We do NOT call syncSessionPayloadWithPuter\(true\) here to avoid the guest popup\.[\s\r\n]+const authError = new Error\(''Your session has expired\. Please refresh the page to continue\.''\);[\s\r\n]+authError\.code = ''PUTER_AUTH_REQUIRED'';[\s\r\n]+throw authError;[\s\r\n]+\}'

$newCallModel = '    let response = await requestWithToken(puterToken);

    // 3. Handle 401 (Unauthorized) with automatic silent recovery
    if (response.status === 401) {
      // Clear potentially corrupted local state
      setStoredPuterToken('''');
      
      // Attempt a full fresh silent sync (fetches user profile + sets new cookie)
      const freshSync = await syncSessionPayloadWithPuter(false, true).catch(() => null);
      if (freshSync?.ok || freshSync?.profile) {
        puterToken = getStoredPuterToken();
        // Retry the request with the fresh session
        response = await requestWithToken(puterToken);
      }
    }

    // 4. Final check for 401: If still unauthorized after silent refresh, we show a retryable inline message
    if (response.status === 401) {
      const authError = new Error(''Session connectivity issue. Please try sending your message again in a moment.'');
      authError.code = ''PUTER_AUTH_REQUIRED'';
      throw authError;
    }'

$content = [regex]::Replace($content, $oldCallModel, $newCallModel)

Set-Content -Path $path -Value $content -NoNewline
