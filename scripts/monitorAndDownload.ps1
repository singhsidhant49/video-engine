param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^vid_[A-Za-z0-9_-]+$')]
  [string]$VideoId,

  [string]$ApiBaseUrl = 'http://localhost:3000',
  [string]$ApiKey = 'replace-with-a-long-random-api-key',

  [ValidateRange(1, 300)]
  [int]$PollSeconds = 5
)

$ErrorActionPreference = 'Stop'
$headers = @{ Authorization = "Bearer $ApiKey" }
$projectRoot = Split-Path -Parent $PSScriptRoot
$downloadDirectory = Join-Path $projectRoot 'renders\downloads'

New-Item -ItemType Directory -Path $downloadDirectory -Force | Out-Null

Write-Host "Monitoring video: $VideoId" -ForegroundColor Cyan

try {
  do {
    $job = Invoke-RestMethod `
      -Method Get `
      -Uri "$ApiBaseUrl/v1/videos/$VideoId" `
      -Headers $headers

    Write-Host "$($job.status) | $($job.stage) | $($job.progress)%"

    if ($job.status -notin @('completed', 'failed', 'cancelled')) {
      Start-Sleep -Seconds $PollSeconds
    }
  } while ($job.status -notin @('completed', 'failed', 'cancelled'))

  if ($job.status -eq 'failed') {
    throw "Generation failed: $($job.error.code) - $($job.error.message)"
  }

  if ($job.status -eq 'cancelled') {
    throw 'Video generation was cancelled.'
  }

  $outputFile = Join-Path $downloadDirectory "$VideoId.mp4"
  Invoke-WebRequest `
    -Method Get `
    -Uri "$ApiBaseUrl/v1/videos/$VideoId/download" `
    -Headers $headers `
    -OutFile $outputFile

  Write-Host "Video downloaded: $outputFile" -ForegroundColor Green
}
catch {
  $details = $_.ErrorDetails.Message
  if ([string]::IsNullOrWhiteSpace($details)) {
    $details = $_.Exception.Message
  }
  Write-Error -Message $details -ErrorAction Continue
  return
}
