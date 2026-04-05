# Update service-worker.js
$swPath = "c:\Users\A SARATH KUMAR\Desktop\Company\Lexorium\Lexorium-github-upload\service-worker.js"
$swContent = Get-Content -Path $swPath -Raw
$swContent = $swContent -replace "lexorium-shell-v5", "lexorium-shell-v6"
Set-Content -Path $swPath -Value $swContent -NoNewline

# Update app.html version
$appPath = "c:\Users\A SARATH KUMAR\Desktop\Company\Lexorium\Lexorium-github-upload\app.html"
$appContent = Get-Content -Path $appPath -Raw
$appContent = $appContent -replace "CLIENT_BUILD_VERSION = '1.0.8'", "CLIENT_BUILD_VERSION = '1.1.0'"
# Also force a check for the refresh flag
$appContent = $appContent -replace "refreshClientShellIfNeeded\(\) \{", "refreshClientShellIfNeeded() { return true; // Force refresh"
Set-Content -Path $appPath -Value $appContent -NoNewline
