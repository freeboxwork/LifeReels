param(
  [string]$Region = "us-east-1",
  [string]$FunctionName = "lifereels-pipeline-bridge",
  [string]$RoleName = "lifereels-bridge-lambda-role"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$bridgeDir = Join-Path $root "bridge-lambda"
$distDir = Join-Path $bridgeDir "dist"
$zipPath = Join-Path $bridgeDir "bridge.zip"
$aws = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"

if (!(Test-Path $aws)) {
  throw "AWS CLI not found: $aws"
}

function Get-EnvFromDotEnv {
  param([string]$Path)
  $map = @{}
  if (!(Test-Path $Path)) { return $map }
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (!$line -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $k = $line.Substring(0, $idx).Trim()
    $v = $line.Substring($idx + 1).Trim()
    $map[$k] = $v
  }
  return $map
}

function Require-Key {
  param([hashtable]$Map,[string]$Key)
  if (-not $Map.ContainsKey($Key) -or [string]::IsNullOrWhiteSpace([string]$Map[$Key])) {
    throw "Missing required key in .env: $Key"
  }
  return [string]$Map[$Key]
}

Write-Host "[1/6] Build bridge bundle..."
if (Test-Path $distDir) { Remove-Item $distDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
Push-Location $root
npm.cmd exec --yes -- esbuild bridge-lambda/src/handler.ts --bundle --platform=node --target=node20 --format=cjs --outfile=bridge-lambda/dist/index.js
Pop-Location

Write-Host "[2/6] Create zip..."
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $distDir "index.js") -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "[3/6] Ensure IAM role..."
$roleArn = ""
try {
  $roleJson = & $aws iam get-role --role-name $RoleName | ConvertFrom-Json
  $roleArn = $roleJson.Role.Arn
} catch {
  $assume = @{
    Version = "2012-10-17"
    Statement = @(
      @{
        Effect = "Allow"
        Principal = @{ Service = "lambda.amazonaws.com" }
        Action = "sts:AssumeRole"
      }
    )
  } | ConvertTo-Json -Depth 6 -Compress
  $tmpAssume = Join-Path $bridgeDir "assume-role.json"
  Set-Content -Path $tmpAssume -Value $assume -Encoding ascii
  $created = & $aws iam create-role --role-name $RoleName --assume-role-policy-document ("file:///" + $tmpAssume.Replace("\","/")) | ConvertFrom-Json
  $roleArn = $created.Role.Arn
  & $aws iam attach-role-policy --role-name $RoleName --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole | Out-Null
  & $aws iam attach-role-policy --role-name $RoleName --policy-arn arn:aws:iam::aws:policy/AdministratorAccess | Out-Null
  Start-Sleep -Seconds 8
}

Write-Host "[4/6] Create or update Lambda..."
$exists = $false
try {
  & $aws lambda get-function --function-name $FunctionName --region $Region | Out-Null
  $exists = $true
} catch {
  $exists = $false
}

if (-not $exists) {
  & $aws lambda create-function `
    --function-name $FunctionName `
    --runtime nodejs20.x `
    --role $roleArn `
    --handler index.handler `
    --timeout 900 `
    --memory-size 2048 `
    --zip-file ("fileb://" + $zipPath) `
    --region $Region | Out-Null
} else {
  & $aws lambda update-function-code `
    --function-name $FunctionName `
    --zip-file ("fileb://" + $zipPath) `
    --region $Region | Out-Null
}

Write-Host "[5/6] Update environment..."
$envMap = Get-EnvFromDotEnv -Path (Join-Path $root ".env")
$vars = @{
  OPENAI_API_KEY = (Require-Key $envMap "VITE_OPENAI_API_KEY")
  OPENAI_MODEL = [string]($envMap["VITE_OPENAI_MODEL"])
  OPENAI_IMAGE_MODEL = "gpt-image-1.5"
  ELEVENLABS_API_KEY = (Require-Key $envMap "ELEVENLABS_API_KEY")
  ELEVENLABS_VOICE_ID = (Require-Key $envMap "VITE_ELEVENLABS_VOICE_ID")
  ELEVENLABS_MODEL_ID = [string]($envMap["VITE_ELEVENLABS_MODEL_ID"])
  REMOTION_AWS_REGION = (Require-Key $envMap "REMOTION_AWS_REGION")
  REMOTION_FUNCTION_NAME = (Require-Key $envMap "REMOTION_FUNCTION_NAME")
  REMOTION_SERVE_URL = (Require-Key $envMap "REMOTION_SERVE_URL")
  REMOTION_LAMBDA_CONCURRENCY = [string]($envMap["REMOTION_LAMBDA_CONCURRENCY"])
  REMOTION_FRAMES_PER_LAMBDA = [string]($envMap["REMOTION_FRAMES_PER_LAMBDA"])
  REMOTION_MAX_RETRIES = [string]($envMap["REMOTION_MAX_RETRIES"])
  REMOTION_PROGRESS_POLL_MS = [string]($envMap["REMOTION_PROGRESS_POLL_MS"])
  REMOTION_PRIVACY = [string]($envMap["REMOTION_PRIVACY"])
  REMOTION_BGM_SRC = "https://remotionlambda-useast1-yuc9eon4qr.s3.us-east-1.amazonaws.com/sites/lifereels-site/assets/bgm/BGM-01_warm-lofi-diary_78bpm_30s_loop_v01_type_A.mp3"
}

if ($envMap.ContainsKey("REMOTION_AWS_ACCESS_KEY_ID") -and -not [string]::IsNullOrWhiteSpace([string]$envMap["REMOTION_AWS_ACCESS_KEY_ID"])) {
  $vars["REMOTION_AWS_ACCESS_KEY_ID"] = [string]$envMap["REMOTION_AWS_ACCESS_KEY_ID"]
}
if ($envMap.ContainsKey("REMOTION_AWS_SECRET_ACCESS_KEY") -and -not [string]::IsNullOrWhiteSpace([string]$envMap["REMOTION_AWS_SECRET_ACCESS_KEY"])) {
  $vars["REMOTION_AWS_SECRET_ACCESS_KEY"] = [string]$envMap["REMOTION_AWS_SECRET_ACCESS_KEY"]
}
if ($envMap.ContainsKey("REMOTION_AWS_SESSION_TOKEN") -and -not [string]::IsNullOrWhiteSpace([string]$envMap["REMOTION_AWS_SESSION_TOKEN"])) {
  $vars["REMOTION_AWS_SESSION_TOKEN"] = [string]$envMap["REMOTION_AWS_SESSION_TOKEN"]
}

$jsonVars = @{ Variables = $vars } | ConvertTo-Json -Depth 8 -Compress
& $aws lambda update-function-configuration `
  --function-name $FunctionName `
  --region $Region `
  --environment $jsonVars | Out-Null

Write-Host "[6/6] Ensure Function URL..."
try {
  $url = & $aws lambda get-function-url-config --function-name $FunctionName --region $Region | ConvertFrom-Json
  $functionUrl = $url.FunctionUrl
} catch {
  $createdUrl = & $aws lambda create-function-url-config --function-name $FunctionName --auth-type NONE --cors AllowOrigins='*',AllowMethods='GET,POST,OPTIONS',AllowHeaders='*' --region $Region | ConvertFrom-Json
  $functionUrl = $createdUrl.FunctionUrl
}

Write-Host ""
Write-Host "Bridge Lambda deployed."
Write-Host "Function Name: $FunctionName"
Write-Host "Function URL:  $functionUrl"
