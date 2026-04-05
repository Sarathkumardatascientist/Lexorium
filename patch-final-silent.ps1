$path = "c:\Users\A SARATH KUMAR\Desktop\Company\Lexorium\Lexorium-github-upload\app.html"
$content = Get-Content -Path $path -Raw

# Replace the interactive call in callPuterDirect with a silent one
$oldDirect = '  async function callPuterDirect\(messages, attachments, mode\) \{[\s\r\n]+await getRequiredPuterToken\(true\);'
$newDirect = '  async function callPuterDirect(messages, attachments, mode) {
    // Strictly silent token check for the fallback path
    await getRequiredPuterToken(false);'

$content = [regex]::Replace($content, $oldDirect, $newDirect)

Set-Content -Path $path -Value $content -NoNewline
