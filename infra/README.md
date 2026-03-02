# Manual Deployment with PowerShell Scripts

This guide covers deploying Thuddle manually from your local machine using the PowerShell scripts in the `infra/` folder. This is useful for initial setup, debugging, or environments where you're not using GitHub Actions.

## Prerequisites

| Tool | Purpose |
|------|---------|
| **Azure CLI** (`az`) | Provisioning infrastructure and managing Container Apps |
| **Docker** | Building and pushing container images |
| **Node.js** (22+) and **npm** | Building the Vue.js frontend |
| **PowerShell** (7+) | Running the scripts |

You must be logged in to both Azure CLI and a container registry:

```powershell
az login
docker login ghcr.io -u <github-username>
```

## Scripts

### `Deploy-Infrastructure.ps1` — Provision Azure Resources

Creates the resource group and deploys all Azure infrastructure via the Bicep template.

```powershell
./infra/Deploy-Infrastructure.ps1 -ImageTag "0.1.3" -ContainerRegistry "ghcr.io/myuser"
```

#### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `-ImageTag` | Yes | — | SemVer tag for the container images (e.g. `0.1.3`) |
| `-ContainerRegistry` | Yes | — | Registry prefix (e.g. `ghcr.io/myuser`) |
| `-Location` | No | `norwayeast` | Azure region for all resources |
| `-ResourceGroup` | No | `rg-thuddle` | Resource group name |

#### Passwords

The script will prompt for two passwords interactively:

- **PostgreSQL admin password**
- **Keycloak admin password**

To skip the prompts, set environment variables before running:

```powershell
$env:POSTGRES_PASSWORD = "your-postgres-password"
$env:KEYCLOAK_ADMIN_PASSWORD = "your-keycloak-password"
./infra/Deploy-Infrastructure.ps1 -ImageTag "0.1.3" -ContainerRegistry "ghcr.io/myuser"
```

#### What it creates

- Resource Group
- Log Analytics workspace
- Container Apps Environment
- PostgreSQL Flexible Server (Burstable B1ms) with `thuddledb` and `keycloakdb`
- Azure Storage Account with `profile-pictures` blob container
- Container Apps: `thuddle-api`, `thuddle-keycloak`
- Container Apps Job: `thuddle-migrations`
- Static Web App: `thuddle-web`

#### Output

On success, the script prints the endpoint URLs and writes them to `infra/.deploy-outputs.json`. This file is read by `Deploy-App.ps1`.

---

### `Deploy-App.ps1` — Build, Push, and Deploy

Builds Docker images, pushes them, updates the Container Apps, runs migrations, and deploys the frontend. **Run `Deploy-Infrastructure.ps1` first** — this script reads the outputs it generates.

```powershell
./infra/Deploy-App.ps1 -ImageTag "0.1.3" -ContainerRegistry "ghcr.io/myuser"
```

#### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `-ImageTag` | Yes | — | SemVer tag for the container images |
| `-ContainerRegistry` | Yes | — | Registry prefix (e.g. `ghcr.io/myuser`) |
| `-ResourceGroup` | No | `rg-thuddle` | Resource group name |
| `-SkipBuild` | No | `false` | Skip Docker build and push (use existing images) |
| `-SkipMigrations` | No | `false` | Skip running database migrations |
| `-SkipFrontend` | No | `false` | Skip building and deploying the Vue.js frontend |

#### What it does

1. **Builds and pushes** three Docker images to the registry:
   - `thuddle-api`
   - `thuddle-migrations`
   - `thuddle-keycloak`
2. **Updates Container Apps** (`thuddle-api`, `thuddle-keycloak`) to the new image tag
3. **Runs database migrations** — updates the migration job image, starts it, and polls until it completes (timeout: 5 minutes)
4. **Builds the Vue.js frontend** with the correct API and Keycloak URLs baked in via Vite environment variables
5. **Deploys the frontend** to Azure Static Web Apps using the SWA CLI

#### Skip flags

You can skip any stage independently. This is useful when iterating:

```powershell
# Re-deploy only the frontend (images already built, migrations already ran)
./infra/Deploy-App.ps1 -ImageTag "0.1.3" -ContainerRegistry "ghcr.io/myuser" -SkipBuild -SkipMigrations

# Push new images + update containers, but don't touch the frontend
./infra/Deploy-App.ps1 -ImageTag "0.1.4" -ContainerRegistry "ghcr.io/myuser" -SkipFrontend
```

## Typical First-Time Deployment

```powershell
# 1. Log in
az login
docker login ghcr.io -u <github-username>

# 2. Provision infrastructure
./infra/Deploy-Infrastructure.ps1 -ImageTag "0.1.0" -ContainerRegistry "ghcr.io/myuser"
#    → enter PostgreSQL and Keycloak passwords when prompted

# 3. Build, push, migrate, deploy
./infra/Deploy-App.ps1 -ImageTag "0.1.0" -ContainerRegistry "ghcr.io/myuser"
```

## Typical Update Deployment

```powershell
# Only need Deploy-App — infrastructure is already provisioned
./infra/Deploy-App.ps1 -ImageTag "0.2.0" -ContainerRegistry "ghcr.io/myuser"
```

If you've changed the Bicep template (e.g. added resources or changed settings), re-run `Deploy-Infrastructure.ps1` first.

## File Reference

| File | Purpose |
|------|---------|
| `Deploy-Infrastructure.ps1` | Provisions Azure resources via Bicep |
| `Deploy-App.ps1` | Builds, pushes, and deploys the application |
| `main.bicep` | Bicep template defining all Azure resources |
| `.deploy-outputs.json` | Generated by `Deploy-Infrastructure.ps1`, consumed by `Deploy-App.ps1` (git-ignored) |
