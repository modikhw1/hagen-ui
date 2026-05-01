param(
  [Parameter(Mandatory = $true)]
  [string]$SourceRepoPath,
  [string]$SourceBranch = "main",
  [string]$TargetBase = "origin/main",
  [string]$TargetBranch,
  [switch]$SkipVerify,
  [switch]$SkipPush
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

function Write-Step([string]$Message) {
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Run-Git([string]$RepoPath, [string[]]$GitArgs) {
  $quotedArgs = @("-C", $RepoPath) + $GitArgs | ForEach-Object {
    '"' + ($_ -replace '"', '\"') + '"'
  }
  $command = "git $($quotedArgs -join ' ') 2>&1"
  $output = & cmd /d /c $command
  if ($LASTEXITCODE -ne 0) {
    throw "git $($GitArgs -join ' ') failed in $RepoPath`n$output"
  }
  return ($output | Out-String).Trim()
}

function Run-Command([string]$Workdir, [string]$Command) {
  Push-Location $Workdir
  try {
    & powershell -NoProfile -Command $Command
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed in ${Workdir}: $Command"
    }
  }
  finally {
    Pop-Location
  }
}

function Get-MetadataPath([string]$RepoRoot) {
  return Join-Path $RepoRoot ".lovable-sync.json"
}

function Read-Metadata([string]$RepoRoot) {
  $metadataPath = Get-MetadataPath $RepoRoot
  if (-not (Test-Path -LiteralPath $metadataPath)) {
    throw "Missing metadata file: $metadataPath"
  }

  return (Get-Content -Raw -LiteralPath $metadataPath | ConvertFrom-Json)
}

function Write-Metadata([string]$MetadataPath, [pscustomobject]$Metadata) {
  $json = $Metadata | ConvertTo-Json -Depth 5
  Set-Content -LiteralPath $MetadataPath -Value ($json + "`n")
}

function Resolve-ImportTarget([string]$RelativePath) {
  $mappedRootFiles = @{
    ".gitignore"               = "app/.gitignore"
    "auto-test.js"             = "app/auto-test.js"
    "check-data.mjs"           = "app/check-data.mjs"
    "check-profiles.js"        = "app/check-profiles.js"
    "check-quotas.cjs"         = "app/check-quotas.cjs"
    "check-rapidapi-status.mjs"= "app/check-rapidapi-status.mjs"
    "check-tables.js"          = "app/check-tables.js"
    "check-users.js"           = "app/check-users.js"
    "check-view.mjs"           = "app/check-view.mjs"
    "create-table.js"          = "app/create-table.js"
    "debug-rapidapi-v2.mjs"    = "app/debug-rapidapi-v2.mjs"
    "env.example"              = "app/env.example"
    "eslint.config.mjs"        = "app/eslint.config.mjs"
    "find-user.js"             = "app/find-user.js"
    "full-flow-test.js"        = "app/full-flow-test.js"
    "full-test.js"             = "app/full-test.js"
    "next-env.d.ts"            = "app/next-env.d.ts"
    "next.config.ts"           = "app/next.config.ts"
    "package-lock.json"        = "app/package-lock.json"
    "package.json"             = "app/package.json"
    "playwright.config.ts"     = "app/playwright.config.ts"
    "playwright.local.config.ts" = "app/playwright.local.config.ts"
    "pnpm-lock.yaml"           = "app/pnpm-lock.yaml"
    "postcss.config.mjs"       = "app/postcss.config.mjs"
    "README.md"                = "app/README.md"
    "tailwind.config.mjs"      = "app/tailwind.config.mjs"
    "test-invite.js"           = "app/test-invite.js"
    "test-send-invite.js"      = "app/test-send-invite.js"
    "tsconfig.json"            = "app/tsconfig.json"
    "vercel.json"              = "app/vercel.json"
    "vitest.config.ts"         = "app/vitest.config.ts"
  }

  $skipped = @(
    "AGENTS.md",
    "bun.lock",
    "src/integrations/supabase/client.ts",
    "src/integrations/supabase/types.ts"
  )

  if ($skipped -contains $RelativePath) {
    return $null
  }

  if ($RelativePath.StartsWith("docs/")) {
    return $null
  }

  if ($RelativePath.StartsWith("src/")) {
    return "app/$RelativePath"
  }

  if ($RelativePath.StartsWith("public/")) {
    return "app/$RelativePath"
  }

  if ($RelativePath.StartsWith("tests/")) {
    return "app/$RelativePath"
  }

  if ($RelativePath.StartsWith("scripts/")) {
    return "app/$RelativePath"
  }

  if ($RelativePath.StartsWith("supabase/")) {
    return $RelativePath
  }

  if ($mappedRootFiles.ContainsKey($RelativePath)) {
    return $mappedRootFiles[$RelativePath]
  }

  return $null
}

function Ensure-CleanSource([string]$SourcePath) {
  $status = Run-Git $SourcePath @("status", "--short")
  if ($status) {
    throw "Source repo has uncommitted changes. Commit/push Lovable changes first.`n$status"
  }
}

function Ensure-Dependencies([string]$AppPath) {
  $tscPath = Join-Path $AppPath "node_modules/.bin/tsc.cmd"
  $eslintPath = Join-Path $AppPath "node_modules/.bin/eslint.cmd"

  if ((-not (Test-Path -LiteralPath $tscPath)) -or (-not (Test-Path -LiteralPath $eslintPath))) {
    Write-Step "Installing app dependencies in import worktree"
    Run-Command $AppPath "npm install"
  }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$sourcePath = (Resolve-Path $SourceRepoPath).Path
$metadata = Read-Metadata $repoRoot
$metadataPath = Get-MetadataPath $repoRoot

if (-not $TargetBranch) {
  $TargetBranch = "sync/lovable-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
}

$worktreeRoot = Join-Path $repoRoot ".lovable-worktrees"
$safeBranchName = ($TargetBranch -replace "[^A-Za-z0-9._-]", "-")
$worktreePath = Join-Path $worktreeRoot $safeBranchName

Write-Step "Validating source repo"
Ensure-CleanSource $sourcePath

Write-Step "Fetching target and source remotes"
Run-Git $repoRoot @("fetch", "origin")
Run-Git $sourcePath @("fetch", "origin", $SourceBranch)

$sourceHead = Run-Git $sourcePath @("rev-parse", "origin/$SourceBranch")
$sourceBase = [string]$metadata.lastImportedCommit

if (-not $sourceBase) {
  throw "Missing lastImportedCommit in $metadataPath"
}

$sourceBase = Run-Git $sourcePath @("rev-parse", $sourceBase)

if ($sourceBase -eq $sourceHead) {
  Write-Host "No new Lovable commits to import. Source head is already recorded: $sourceHead" -ForegroundColor Yellow
  exit 0
}

if (Test-Path -LiteralPath $worktreePath) {
  throw "Worktree path already exists: $worktreePath"
}

$existingBranch = (& git -C $repoRoot branch --list $TargetBranch | Out-String).Trim()
if ($existingBranch) {
  throw "Branch already exists: $TargetBranch"
}

New-Item -ItemType Directory -Force -Path $worktreeRoot | Out-Null

Write-Step "Creating import worktree from $TargetBase"
Run-Git $repoRoot @("worktree", "add", $worktreePath, "-b", $TargetBranch, $TargetBase) | Out-Null

try {
  Write-Step "Collecting Lovable diff from $sourceBase..$sourceHead"
  $diffLines = @(& git -C $sourcePath diff --name-status "$sourceBase..$sourceHead")
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to diff Lovable repo"
  }

  $copied = 0
  $deleted = 0
  $skipped = 0

  foreach ($line in $diffLines) {
    if (-not $line) {
      continue
    }

    $parts = $line -split "`t"
    $status = $parts[0]

    if ($status.StartsWith("R")) {
      $oldPath = $parts[1]
      $newPath = $parts[2]

      $oldTarget = Resolve-ImportTarget $oldPath
      if ($oldTarget) {
        $oldTargetPath = Join-Path $worktreePath $oldTarget
        if (Test-Path -LiteralPath $oldTargetPath) {
          Remove-Item -LiteralPath $oldTargetPath -Force
          $deleted++
        }
      }

      $target = Resolve-ImportTarget $newPath
      if (-not $target) {
        $skipped++
        continue
      }

      $sourceFile = Join-Path $sourcePath $newPath
      $targetFile = Join-Path $worktreePath $target
      $targetDir = Split-Path -Parent $targetFile
      New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
      Copy-Item -LiteralPath $sourceFile -Destination $targetFile -Force
      $copied++
      continue
    }

    $relativePath = $parts[-1]
    $target = Resolve-ImportTarget $relativePath

    if (-not $target) {
      $skipped++
      continue
    }

    $targetPath = Join-Path $worktreePath $target

    if ($status -eq "D") {
      if (Test-Path -LiteralPath $targetPath) {
        Remove-Item -LiteralPath $targetPath -Force
        $deleted++
      }
      continue
    }

    $sourceFile = Join-Path $sourcePath $relativePath
    $targetDir = Split-Path -Parent $targetPath
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    Copy-Item -LiteralPath $sourceFile -Destination $targetPath -Force
    $copied++
  }

  $branchMetadataPath = Get-MetadataPath $worktreePath
  $branchMetadata = [pscustomobject][ordered]@{
    sourceRepo = $metadata.sourceRepo
    sourceBranch = $metadata.sourceBranch
    lastImportedCommit = $metadata.lastImportedCommit
    lastImportedAt = $null
    importedFrom = $null
    notes = $metadata.notes
  }
  $branchMetadata.lastImportedCommit = $sourceHead
  $branchMetadata.lastImportedAt = (Get-Date).ToString("s")
  $branchMetadata.importedFrom = @{
    sourceRepoPath = $sourcePath
    sourceBranch = $SourceBranch
    sourceBaseCommit = $sourceBase
  }
  Write-Metadata $branchMetadataPath $branchMetadata

  Write-Step "Staging imported files"
  Run-Git $worktreePath @("add", "-A") | Out-Null

  $staged = Run-Git $worktreePath @("diff", "--cached", "--name-only")
  if (-not $staged) {
    Write-Host "No mapped changes were produced from the Lovable diff." -ForegroundColor Yellow
    Write-Host "Worktree kept at: $worktreePath" -ForegroundColor Yellow
    exit 0
  }

  if (-not $SkipVerify) {
    $appPath = Join-Path $worktreePath "app"
    Ensure-Dependencies $appPath

    Write-Step "Running app typecheck"
    Run-Command $appPath "npm run typecheck"

    Write-Step "Running app lint"
    Run-Command $appPath "npm run lint"
  }

  $shortHead = $sourceHead.Substring(0, 7)
  Write-Step "Creating import commit"
  Run-Git $worktreePath @("commit", "-m", "sync(lovable): import $shortHead") | Out-Null

  if (-not $SkipPush) {
    Write-Step "Pushing $TargetBranch"
    Run-Git $worktreePath @("push", "-u", "origin", $TargetBranch) | Out-Null
  }

  Write-Host ""
  Write-Host "Lovable import complete." -ForegroundColor Green
  Write-Host "Source range : $sourceBase..$sourceHead"
  Write-Host "Target branch: $TargetBranch"
  Write-Host "Worktree     : $worktreePath"
  Write-Host "Copied       : $copied"
  Write-Host "Deleted      : $deleted"
  Write-Host "Skipped      : $skipped"
  Write-Host ""
  Write-Host "Next step: open a PR from $TargetBranch to main." -ForegroundColor Green
}
catch {
  Write-Error $_
  throw
}
