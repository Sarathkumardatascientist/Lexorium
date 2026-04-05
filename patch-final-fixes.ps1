$path = "c:\Users\A SARATH KUMAR\Desktop\Company\Lexorium\Lexorium-github-upload\app.html"
$content = Get-Content -Path $path -Raw

# 1. Fix the Upgrade Button in the usage container to open the modal first
$oldBtn = 'onclick="startUpgradeFlow\(''pro''\)"'
$newBtn = 'onclick="openUpgradeModal({ reason: ''limit_reached'', planId: ''pro'' })"'

$content = [regex]::Replace($content, $oldBtn, $newBtn)

# 2. Fix getDirectPuterToken to hydrate from the SDK silently
$oldGetToken = '  function getDirectPuterToken\(\) \{[\s\r\n]+return getStoredPuterToken\(\);[\s\r\n]+\}'
$newGetToken = '  function getDirectPuterToken() {
    let token = getStoredPuterToken();
    if (!token && window.puter?.auth?.getAuthToken) {
      token = String(window.puter.auth.getAuthToken() || '''').trim();
      if (token) setStoredPuterToken(token);
    }
    return token;
  }'

$content = [regex]::Replace($content, $oldGetToken, $newGetToken)

# 3. Update callPuterDirect error message to match the silent flow
$oldDirectErr = 'throw new Error\(''Sign in is required to continue\.''\);'
$newDirectErr = 'throw new Error(''Your session has expired. Please refresh the page to continue.'');'

$content = [regex]::Replace($content, $oldDirectErr, $newDirectErr)

Set-Content -Path $path -Value $content -NoNewline
