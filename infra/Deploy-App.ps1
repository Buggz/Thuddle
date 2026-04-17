<#
.SYNOPSIS
    Builds Docker images, runs migrations, deploys the API/Keycloak containers and frontend.

.DESCRIPTION
    1. Builds and pushes Docker images to GHCR
    2. Triggers the migration Container Apps job
    3. Updates Container App images (they pick up the new tag via Bicep re-deploy)
    4. Builds and deploys the Vue.js frontend to Azure Static Web Apps

    Requires: Docker, Node.js, az cli (logged in), npm, SWA CLI.

.PARAMETER ImageTag
    The container image tag (SemVer, e.g. "0.1.3").

.PARAMETER ContainerRegistry
    The container registry prefix (e.g. "ghcr.io/myuser").
    Falls back to the THUDDLE_CONTAINER_REGISTRY environment variable if not specified.

.PARAMETER ResourceGroup
    Resource group name. Defaults to rg-thuddle.

.PARAMETER SkipBuild
    Skip Docker build and push (use existing images).

.PARAMETER SkipMigrations
    Skip running database migrations.

.PARAMETER SkipFrontend
    Skip building and deploying the frontend.

.EXAMPLE
    ./infra/Deploy-App.ps1 -ImageTag "0.1.3" -ContainerRegistry "ghcr.io/myuser"

.EXAMPLE
    ./infra/Deploy-App.ps1 -ImageTag "0.1.3" -SkipBuild
#>
param(
    [Parameter(Mandatory)]
    [string]$ImageTag,

    [string]$ContainerRegistry,

    [string]$ResourceGroup = 'rg-thuddle',

    [switch]$SkipBuild,
    [switch]$SkipMigrations,
    [switch]$SkipFrontend
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $ContainerRegistry) {
    $ContainerRegistry = $env:THUDDLE_CONTAINER_REGISTRY
}
if (-not $ContainerRegistry) {
    Write-Error "ContainerRegistry not specified and THUDDLE_CONTAINER_REGISTRY environment variable is not set."
    exit 1
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

# ─── Read infra outputs ──────────────────────────────────────────────────────

$outputFile = Join-Path $PSScriptRoot '.deploy-outputs.json'
if (-not (Test-Path $outputFile)) {
    Write-Error "Infrastructure outputs not found at $outputFile. Run Deploy-Infrastructure.ps1 first."
    exit 1
}
$outputs = Get-Content $outputFile -Raw | ConvertFrom-Json
Write-Host "Using infrastructure outputs:" -ForegroundColor Cyan
Write-Host "  API:      https://$($outputs.apiFqdn)" -ForegroundColor White
Write-Host "  Keycloak: https://$($outputs.keycloakFqdn)" -ForegroundColor White
Write-Host "  Web:      https://$($outputs.swaHostname)" -ForegroundColor White

# ─── Build & push Docker images ──────────────────────────────────────────────

if (-not $SkipBuild) {
    Write-Host "`n=== Building Docker images ===" -ForegroundColor Cyan

    $images = @(
        @{ Name = 'thuddle-api';        Dockerfile = 'src/Thuddle.Api/Dockerfile' }
        @{ Name = 'thuddle-migrations'; Dockerfile = 'src/Thuddle.MigrationService/Dockerfile' }
        @{ Name = 'thuddle-keycloak';   Dockerfile = 'src/Thuddle.AppHost/KeycloakConfiguration/Dockerfile' }
    )

    foreach ($img in $images) {
        $fullTag = "$ContainerRegistry/$($img.Name):$ImageTag"
        $latestTag = "$ContainerRegistry/$($img.Name):latest"
        Write-Host "`nBuilding $fullTag ..." -ForegroundColor Yellow

        docker build -t $fullTag -t $latestTag -f (Join-Path $repoRoot $img.Dockerfile) $repoRoot
        if ($LASTEXITCODE -ne 0) { Write-Error "Docker build failed for $($img.Name)"; exit 1 }

        Write-Host "Pushing $fullTag ..." -ForegroundColor Yellow
        docker push $fullTag
        if ($LASTEXITCODE -ne 0) { Write-Error "Docker push failed for $fullTag"; exit 1 }
        docker push $latestTag
        if ($LASTEXITCODE -ne 0) { Write-Error "Docker push failed for $latestTag"; exit 1 }
    }

    Write-Host "`nAll images built and pushed." -ForegroundColor Green
}

# ─── Run migrations ──────────────────────────────────────────────────────────

if (-not $SkipMigrations) {
    Write-Host "`n=== Running database migrations ===" -ForegroundColor Cyan

    # Update the migration job image
    $migrationImage = "$ContainerRegistry/thuddle-migrations:$ImageTag"
    Write-Host "Updating migration job image to $migrationImage ..." -ForegroundColor Yellow

    az containerapp job update `
        --name thuddle-migrations `
        --resource-group $ResourceGroup `
        --image $migrationImage `
        --output none
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to update migration job image"; exit 1 }

    Write-Host "Starting migration job..." -ForegroundColor Yellow
    az containerapp job start `
        --name thuddle-migrations `
        --resource-group $ResourceGroup `
        --output none
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to start migration job"; exit 1 }

    Write-Host "Waiting for migration to complete..." -ForegroundColor Yellow
    for ($i = 1; $i -le 30; $i++) {
        Start-Sleep -Seconds 10
        $status = az containerapp job execution list `
            --name thuddle-migrations `
            --resource-group $ResourceGroup `
            --query "[0].properties.status" `
            --output tsv
        Write-Host "  Status: $status" -ForegroundColor Gray

        if ($status -eq 'Succeeded') {
            Write-Host "Migrations completed successfully." -ForegroundColor Green
            break
        }
        if ($status -eq 'Failed') {
            Write-Error "Migration job failed."
            exit 1
        }
    }
    if ($status -ne 'Succeeded') {
        Write-Error "Migration timed out after 5 minutes."
        exit 1
    }
}

# ─── Update Container App images ─────────────────────────────────────────────

Write-Host "`n=== Updating Container Apps ===" -ForegroundColor Cyan

$apiImage = "$ContainerRegistry/thuddle-api:$ImageTag"
Write-Host "Updating thuddle-api to $apiImage ..." -ForegroundColor Yellow
$apiUpdateArgs = @(
    'containerapp', 'update',
    '--name', 'thuddle-api',
    '--resource-group', $ResourceGroup,
    '--image', $apiImage,
    '--output', 'none'
)
$keycloakDomain = if ($outputs.PSObject.Properties['keycloakCustomDomain'] -and $outputs.keycloakCustomDomain) { $outputs.keycloakCustomDomain } else { $null }
if ($keycloakDomain) {
    $apiUpdateArgs += @('--set-env-vars', "Keycloak__AuthServerUrl=https://$keycloakDomain")
    Write-Host "  Keycloak URL: https://$keycloakDomain" -ForegroundColor White
}
az @apiUpdateArgs
if ($LASTEXITCODE -ne 0) { Write-Error "Failed to update API container app"; exit 1 }

$keycloakImage = "$ContainerRegistry/thuddle-keycloak:$ImageTag"
Write-Host "Updating thuddle-keycloak to $keycloakImage ..." -ForegroundColor Yellow
az containerapp update `
    --name thuddle-keycloak `
    --resource-group $ResourceGroup `
    --image $keycloakImage `
    --output none
if ($LASTEXITCODE -ne 0) { Write-Error "Failed to update Keycloak container app"; exit 1 }

# ─── Build and deploy frontend ───────────────────────────────────────────────

if (-not $SkipFrontend) {
    Write-Host "`n=== Building and deploying frontend ===" -ForegroundColor Cyan

    $webDir = Join-Path $repoRoot 'src' 'Thuddle.Web'

    $apiUrl = if ($outputs.PSObject.Properties['apiCustomDomain'] -and $outputs.apiCustomDomain) { $outputs.apiCustomDomain } else { $outputs.apiFqdn }
    $keycloakUrl = if ($outputs.PSObject.Properties['keycloakCustomDomain'] -and $outputs.keycloakCustomDomain) { $outputs.keycloakCustomDomain } else { $outputs.keycloakFqdn }
    $env:VITE_API_BASE_URL = "https://$apiUrl"
    $env:VITE_KEYCLOAK_URL = "https://$keycloakUrl"
    $env:VITE_KEYCLOAK_REALM = 'Thuddle'
    $env:VITE_KEYCLOAK_CLIENT_ID = 'thuddle-web'

    Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
    Push-Location $webDir
    try {
        npm ci
        if ($LASTEXITCODE -ne 0) { Write-Error "npm ci failed"; exit 1 }

        Write-Host "Building frontend..." -ForegroundColor Yellow
        npm run build
        if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed"; exit 1 }
    } finally {
        Pop-Location
    }

    Write-Host "Fetching SWA deployment token..." -ForegroundColor Yellow
    $swaToken = az staticwebapp secrets list `
        --name $outputs.swaName `
        --resource-group $ResourceGroup `
        --query 'properties.apiKey' `
        --output tsv
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to get SWA deployment token"; exit 1 }

    Write-Host "Deploying to Static Web App..." -ForegroundColor Yellow
    npx --yes @azure/static-web-apps-cli deploy `
        (Join-Path $webDir 'dist') `
        --deployment-token $swaToken `
        --env production
    if ($LASTEXITCODE -ne 0) { Write-Error "SWA deployment failed"; exit 1 }

    Write-Host "`nFrontend deployed to https://$($outputs.swaHostname)" -ForegroundColor Green
}

# ─── Done ─────────────────────────────────────────────────────────────────────

# Clean up VITE env vars so they don't leak into local dev
Remove-Item Env:VITE_API_BASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:VITE_KEYCLOAK_URL -ErrorAction SilentlyContinue
Remove-Item Env:VITE_KEYCLOAK_REALM -ErrorAction SilentlyContinue
Remove-Item Env:VITE_KEYCLOAK_CLIENT_ID -ErrorAction SilentlyContinue

Write-Host "`n=== Deployment complete ===" -ForegroundColor Green
Write-Host "  API:      https://$($outputs.apiFqdn)" -ForegroundColor White
Write-Host "  Keycloak: https://$($outputs.keycloakFqdn)" -ForegroundColor White
Write-Host "  Web:      https://$($outputs.swaHostname)" -ForegroundColor White
