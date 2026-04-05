# Fix auth in app.html
# Read as raw bytes to preserve original encoding
$bytes = [System.IO.File]::ReadAllBytes("app.html")
$text = [System.Text.Encoding]::UTF8.GetString($bytes)

# ---- Fix 1: Rewrite getRequiredPuterToken ----
# Find the old function and replace it entirely
$oldGetRequiredPuterToken = @'
  async function getRequiredPuterToken(interactive = false) {
    let token = getStoredPuterToken();
    if (token) return token;
'@

# We need to find the function and replace everything until the closing }
# Let's find the start and end indices
$startIdx = $text.IndexOf('async function getRequiredPuterToken(')
if ($startIdx -lt 0) {
    Write-Host "ERROR: Could not find getRequiredPuterToken function"
    exit 1
}
# Back up to find the leading whitespace
$lineStart = $text.LastIndexOf("`n", $startIdx) + 1
$startIdx = $lineStart

Write-Host "Found getRequiredPuterToken at index $startIdx"

# Find the end of the function - look for the pattern "  }" followed by newline and then "  async function fetchSessionProfile"
$endMarker = 'async function fetchSessionProfile'
$endIdx = $text.IndexOf($endMarker, $startIdx)
if ($endIdx -lt 0) {
    Write-Host "ERROR: Could not find fetchSessionProfile after getRequiredPuterToken"
    exit 1
}
# Back up to find the start of the line containing fetchSessionProfile
$funcEndLineStart = $text.LastIndexOf("`n", $endIdx)
# The function ends right before this line (including any blank line)
$funcEnd = $funcEndLineStart + 1

Write-Host "Function ends at index $funcEnd (before fetchSessionProfile)"

# Build the replacement function
$newGetRequiredPuterToken = @"
  async function getRequiredPuterToken(interactive = false) {
    let token = getStoredPuterToken();
    if (token) return token;
    // Silent refresh attempt - picks up live Puter session without a popup.
    await syncSessionPayloadWithPuter(false).catch(() => null);
    token = getStoredPuterToken();
    if (token) return token;
    // When interactive is false, return null so the caller's 401 handler
    // can trigger interactive auth at the right moment instead of throwing.
    if (!interactive) return null;
    try {
      await syncSessionPayloadWithPuter(true);
    } catch (_reauthError) {
      // If the popup was closed or failed, fall through to the error below.
    }
    token = getStoredPuterToken();
    if (!token) {
      throw new Error('Sign in is required to continue.');
    }
    return token;
  }

"@

# Replace the old function
$text = $text.Substring(0, $startIdx) + $newGetRequiredPuterToken + $text.Substring($funcEnd)

Write-Host "Replaced getRequiredPuterToken"

# ---- Fix 2: Update callLexoriumModel to handle null token ----
# Find "let puterToken = await getRequiredPuterToken(false);" and replace callLexoriumModel start
$oldCallStart = 'let puterToken = await getRequiredPuterToken(false);'
$newCallStart = @"
let puterToken = await getRequiredPuterToken(false);
    // If no token was found silently, trigger interactive auth before making the request.
    if (!puterToken) {
      try {
        await syncSessionPayloadWithPuter(true);
        puterToken = getStoredPuterToken();
      } catch (_authErr) {
        // Popup closed or failed.
      }
      if (!puterToken) {
        const sessionError = new Error('Sign in is required to continue.');
        sessionError.code = 'PUTER_AUTH_REQUIRED';
        throw sessionError;
      }
    }
"@

$idx = $text.IndexOf($oldCallStart)
if ($idx -lt 0) {
    Write-Host "ERROR: Could not find callLexoriumModel token line"
    exit 1
}

$text = $text.Substring(0, $idx) + $newCallStart + $text.Substring($idx + $oldCallStart.Length)

Write-Host "Replaced callLexoriumModel token retrieval"

# ---- Write the file back preserving UTF-8 without BOM ----
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText("app.html", $text, $utf8NoBom)

Write-Host "Done! File written successfully."
