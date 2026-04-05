$path = "c:\Users\A SARATH KUMAR\Desktop\Company\Lexorium\Lexorium-github-upload\app.html"
$content = Get-Content -Path $path -Raw

# Replace callLexoriumModel logic
$oldLogic = '  async function callLexoriumModel\(modelId, messages, attachments, mode\) \{[\s\r\n]*let puterToken = await getRequiredPuterToken\(false\);[\s\r\n]*// If no token was found silently, trigger interactive auth before making the request\.[\s\r\n]*if \(!puterToken\) \{[\s\r\n]*try \{[\s\r\n]*await syncSessionPayloadWithPuter\(true\);[\s\r\n]*puterToken = getStoredPuterToken\(\);[\s\r\n]*\} catch \(_authErr\) \{[\s\r\n]*// Popup closed or failed\.[\s\r\n]*\}[\s\r\n]*if \(!puterToken\) \{[\s\r\n]*const sessionError = new Error\(''Sign in is required to continue\.''\);[\s\r\n]*sessionError\.code = ''PUTER_AUTH_REQUIRED'';[\s\r\n]*throw sessionError;[\s\r\n]*\}[\s\r\n]*\}'
$newLogic = '  async function callLexoriumModel(modelId, messages, attachments, mode) {
    // Get token silently. If missing, we proceed anyway and trust the session cookie.
    let puterToken = await getRequiredPuterToken(false) || '''';'

$content = [regex]::Replace($content, $oldLogic, $newLogic)

# Replace requestWithToken header
$oldHeader = '''X-Puter-Token'': token,'
$newHeader = '...(token ? { ''X-Puter-Token'': token } : {}),'

$content = $content.Replace($oldHeader, $newHeader)

Set-Content -Path $path -Value $content -NoNewline
