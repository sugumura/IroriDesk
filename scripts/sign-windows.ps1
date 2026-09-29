# Windows のファイルに SSL.com eSigner（CodeSignTool）で署名する。
# Tauri の bundle.windows.signCommand から、署名するファイルごとに呼ばれる（アプリ本体・インストーラー・アンインストーラー）。
# 使う環境変数: CODESIGNTOOL_DIR, ES_USERNAME, ES_PASSWORD, ES_CREDENTIAL_ID, ES_TOTP_SECRET
param([Parameter(Mandatory = $true)][string]$File)

$ErrorActionPreference = 'Stop'

foreach ($name in 'CODESIGNTOOL_DIR', 'ES_USERNAME', 'ES_PASSWORD', 'ES_CREDENTIAL_ID', 'ES_TOTP_SECRET') {
  if (-not (Get-Item "env:$name" -ErrorAction SilentlyContinue).Value) { throw "$name is not set" }
}

# 同じワンタイムパスワード（30秒ごとに変わる）は2回使えないため、前回の署名と同じ時間枠なら次の枠まで待つ
$marker = Join-Path ([IO.Path]::GetTempPath()) 'esigner-last-totp-window'
$window = [math]::Floor([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() / 30)
if ((Test-Path $marker) -and ([long](Get-Content $marker) -ge $window)) {
  $wait = 30 - ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() % 30) + 1
  Write-Host "Waiting ${wait}s for the next one-time password"
  Start-Sleep -Seconds $wait
  $window = [math]::Floor([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() / 30)
}
Set-Content -Path $marker -Value $window

$jar = Get-ChildItem (Join-Path $env:CODESIGNTOOL_DIR 'jar') -Filter 'code_sign_tool-*.jar' | Select-Object -First 1
$path = (Resolve-Path $File).Path
Write-Host "Signing $path"

# CodeSignTool は conf/code_sign_tool.properties を作業ディレクトリから読む
Push-Location $env:CODESIGNTOOL_DIR
try {
  $output = & java -jar $jar.FullName sign `
    "-username=$env:ES_USERNAME" `
    "-password=$env:ES_PASSWORD" `
    "-credential_id=$env:ES_CREDENTIAL_ID" `
    "-totp_secret=$env:ES_TOTP_SECRET" `
    "-input_file_path=$path" `
    '-override=true' 2>&1
  $code = $LASTEXITCODE
} finally {
  Pop-Location
}
$output | ForEach-Object { Write-Host $_ }

# CodeSignTool は失敗しても終了コードが 0 のことがあるため、署名そのものを確認する
$signature = Get-AuthenticodeSignature -FilePath $path
if ($code -ne 0 -or $signature.Status -ne 'Valid') {
  throw "Signing failed for $path (exit code $code, signature status $($signature.Status))"
}
Write-Host "Signed by $($signature.SignerCertificate.Subject)"
