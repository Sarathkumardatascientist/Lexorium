$path = "c:\Users\A SARATH KUMAR\Desktop\Company\Lexorium\Lexorium-github-upload\app.html"
$content = Get-Content -Path $path -Raw

# 1. Update the HTML fallback for the account menu header to be more neutral
$oldHeadName = '<strong id="accountMenuName">Sign in to Lexorium</strong>'
$newHeadName = '<strong id="accountMenuName">Account</strong>'
$content = $content -replace [regex]::Escape($oldHeadName), $newHeadName

# 2. Update renderSidebarAccount to handle the name resolution more reliably
$oldRenderSidebar = '    const displayName = currentProfileName || authName\.textContent || ''Sign in to Lexorium'';'
$newRenderSidebar = '    const displayName = currentProfileName || authName.textContent || (currentUserUid ? ''Legal Workspace'' : ''Sign in to Lexorium'');'
$content = [regex]::Replace($content, $oldRenderSidebar, $newRenderSidebar)

# 3. Update renderSignedOutWorkspace to use the correct fallback for the menu header
$oldSignedOutName = 'if \(accountMenuNameEl\) accountMenuNameEl\.textContent = ''Sign in to Lexorium'';'
$newSignedOutName = 'if (accountMenuNameEl) accountMenuNameEl.textContent = ''Account'';'
$content = [regex]::Replace($content, $oldSignedOutName, $newSignedOutName)

Set-Content -Path $path -Value $content -NoNewline
