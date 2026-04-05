$path = "c:\Users\A SARATH KUMAR\Desktop\Company\Lexorium\Lexorium-github-upload\app.html"
$content = Get-Content -Path $path -Raw

# 1. Update applyAuthSession to persist a "success" flag
$oldApply = '    if \(signOutItem\) signOutItem\.style\.display = ''flex'';'
$newApply = '    if (signOutItem) signOutItem.style.display = ''flex'';
    try { localStorage.setItem(''auth_ever_succeeded'', ''1''); } catch (_e) {}'

$content = [regex]::Replace($content, $oldApply, $newApply)

# 2. Update clearStoredPuterArtifacts to reset it on sign-out
$oldClear = '    localStorage\.removeItem\(''puter_auth_token''\);'
$newClear = '    localStorage.removeItem(''puter_auth_token'');
    localStorage.removeItem(''auth_ever_succeeded'');'

$content = [regex]::Replace($content, $oldClear, $newClear)

# 3. Update syncSessionPayloadWithPuter to enforce SILENT MODE if ever succeeded
$oldSyncStart = '  async function syncSessionPayloadWithPuter\(interactive, forceFresh = false\) \{'
$newSyncStart = '  async function syncSessionPayloadWithPuter(interactive, forceFresh = false) {
    // Strictly enforce NO MORE DIALOGS after the first successful sign-in
    if (interactive && localStorage.getItem(''auth_ever_succeeded'')) {
      interactive = false;
    }'

$content = [regex]::Replace($content, $oldSyncStart, $newSyncStart)

Set-Content -Path $path -Value $content -NoNewline
