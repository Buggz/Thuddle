<#
.SYNOPSIS
    Provisions all Azure infrastructure for Thuddle using Bicep.

.DESCRIPTION
    Creates the resource group and deploys the Bicep template.
    Uses the currently logged-in az cli user — no service principal needed.

.PARAMETER ImageTag
    The container image tag to deploy (SemVer, e.g. "0.1.3").

.PARAMETER ContainerRegistry
    The container registry prefix (e.g. "ghcr.io/myuser"). Defaults to GHCR.

.PARAMETER Location
    Azure region. Defaults to norwayeast.

.PARAMETER ResourceGroup
    Resource group name. Defaults to rg-thuddle.

.EXAMPLE
    ./infra/Deploy-Infrastructure.ps1 -ImageTag "0.1.3" -ContainerRegistry "ghcr.io/myuser"
#>
param(
    [Parameter(Mandatory)]
    [string]$ImageTag,

    [Parameter(Mandatory)]
    [string]$ContainerRegistry,

    [string]$Location = 'norwayeast',
    [string]$ResourceGroup = 'rg-thuddle'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ─── Verify az cli login ─────────────────────────────────────────────────────

Write-Host "Checking Azure CLI login..." -ForegroundColor Cyan
$account = az account show 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Not logged in to Azure CLI. Run 'az login' first."
    exit 1
}
$accountInfo = $account | ConvertFrom-Json
Write-Host "Logged in as: $($accountInfo.user.name) | Subscription: $($accountInfo.name)" -ForegroundColor Green

# ─── Prompt for passwords (if not already set as env vars) ────────────────────

if ($env:POSTGRES_PASSWORD) {
    $postgresPassword = $env:POSTGRES_PASSWORD
} else {
    $securePostgres = Read-Host "PostgreSQL admin password" -AsSecureString
    $postgresPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePostgres))
}

if ($env:KEYCLOAK_ADMIN_PASSWORD) {
    $keycloakPassword = $env:KEYCLOAK_ADMIN_PASSWORD
} else {
    $secureKeycloak = Read-Host "Keycloak admin password" -AsSecureString
    $keycloakPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKeycloak))
}

# ─── Create resource group ────────────────────────────────────────────────────

Write-Host "`nCreating resource group '$ResourceGroup' in '$Location'..." -ForegroundColor Cyan
az group create --name $ResourceGroup --location $Location --output none
if ($LASTEXITCODE -ne 0) { exit 1 }

# ─── Deploy Bicep ─────────────────────────────────────────────────────────────

$bicepFile = Join-Path $PSScriptRoot 'main.bicep'

Write-Host "Deploying Bicep template..." -ForegroundColor Cyan
$result = az deployment group create `
    --resource-group $ResourceGroup `
    --template-file $bicepFile `
    --parameters `
        imageTag=$ImageTag `
        containerRegistry=$ContainerRegistry `
        postgresAdminPassword=$postgresPassword `
        keycloakAdminPassword=$keycloakPassword `
    --output json

if ($LASTEXITCODE -ne 0) {
    Write-Error "Bicep deployment failed."
    exit 1
}

$outputs = ($result | ConvertFrom-Json).properties.outputs

$apiFqdn = $outputs.apiFqdn.value
$keycloakFqdn = $outputs.keycloakFqdn.value
$swaName = $outputs.staticWebAppName.value
$swaHostname = $outputs.staticWebAppDefaultHostname.value

Write-Host "`nInfrastructure deployed successfully!" -ForegroundColor Green
Write-Host "  API:      https://$apiFqdn" -ForegroundColor White
Write-Host "  Keycloak: https://$keycloakFqdn" -ForegroundColor White
Write-Host "  Web:      https://$swaHostname" -ForegroundColor White
Write-Host "  SWA Name: $swaName" -ForegroundColor White

# ─── Write outputs to file for use by deploy script ──────────────────────────

$outputFile = Join-Path $PSScriptRoot '.deploy-outputs.json'
@{
    apiFqdn     = $apiFqdn
    keycloakFqdn = $keycloakFqdn
    swaName     = $swaName
    swaHostname = $swaHostname
} | ConvertTo-Json | Set-Content $outputFile -Encoding UTF8

Write-Host "`nOutputs saved to $outputFile" -ForegroundColor Gray
