# Deployment

Thuddle is deployed to Azure using Container Apps, PostgreSQL Flexible Server, Azure Blob Storage, and Static Web Apps. Infrastructure is defined in Bicep (`infra/main.bicep`).

## Azure Resources

| Resource | Service | Purpose |
|---|---|---|
| Container App | `thuddle-api` | .NET API backend |
| Container App | `thuddle-keycloak` | Keycloak identity provider |
| Container Apps Job | `thuddle-migrations` | EF Core database migrations (runs once per deploy) |
| Static Web App | `thuddle-web` | Vue.js frontend |
| PostgreSQL Flexible Server | B1ms | Two databases: `thuddledb` + `keycloakdb` |
| Storage Account | Blob | Profile pictures, event images |
| Log Analytics | — | Container Apps logging |

## Option 1: GitHub Actions (CI/CD)

Two workflows handle building and deploying:

| Workflow | Trigger | What it does |
|---|---|---|
| **CI** (`.github/workflows/ci.yml`) | Push / PR | Versions (GitVersion), builds .NET + frontend, pushes Docker images to GHCR on `main` |
| **Deploy** (`.github/workflows/deploy.yml`) | Manual (`workflow_dispatch`) | Deploys infrastructure via Bicep, runs migrations, deploys frontend |

### Setup

#### 1. Create an Azure Service Principal (OIDC)

```bash
# Create app registration
az ad app create --display-name "thuddle-github-deploy"

# Create service principal (use appId from above)
az ad sp create --id <appId>

# Assign Contributor role
az role assignment create \
  --assignee <appId> \
  --role Contributor \
  --scope /subscriptions/<subscription-id>

# Add federated credential for GitHub Actions
az ad app federated-credential create --id <appId> --parameters '{
  "name": "github-main-deploy",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:<owner>/<repo>:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'
```

#### 2. Configure GitHub Secrets

In **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `AZURE_CLIENT_ID` | App Registration `appId` |
| `AZURE_TENANT_ID` | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | `az account show --query id -o tsv` |
| `POSTGRES_PASSWORD` | Strong password for PostgreSQL admin |
| `KEYCLOAK_ADMIN_PASSWORD` | Strong password for Keycloak admin |

#### 3. Enable GHCR Package Publishing

The CI workflow pushes images to `ghcr.io/<owner>/thuddle-*`. To allow Container Apps to pull without credentials, make packages public:

1. Go to **GitHub profile → Packages**
2. For each package (`thuddle-api`, `thuddle-migrations`, `thuddle-keycloak`): **Package settings → Change visibility → Public**

### Running the Workflows

**CI** runs automatically on push/PR. On `main`, it also builds and pushes Docker images tagged with the GitVersion SemVer.

**Deploy** is manual:
1. Go to **Actions → Deploy → Run workflow**
2. Enter the **image tag** from a CI run (e.g. `0.1.3`)
3. Click **Run workflow**

### Pipeline Flow

```
CI:     push/PR → GitVersion → .NET build → Frontend build → (main) Docker build+push
Deploy: workflow_dispatch(version) → Bicep deploy → Run migrations → Build & deploy frontend
```

Docker images built:
- `ghcr.io/<owner>/thuddle-api:<semver>`
- `ghcr.io/<owner>/thuddle-migrations:<semver>`
- `ghcr.io/<owner>/thuddle-keycloak:<semver>`

## Option 2: Manual Deployment (PowerShell)

Two scripts in `infra/` handle provisioning and deploying from your local machine.

### Prerequisites

- Azure CLI (`az login`)
- Docker (`docker login ghcr.io`)
- Node.js 22+ and npm
- PowerShell 7+

### Step 1: Provision Infrastructure

```powershell
./infra/Deploy-Infrastructure.ps1 -ImageTag "0.1.3" -ContainerRegistry "ghcr.io/myuser"
```

| Parameter | Required | Default | Description |
|---|---|---|---|
| `-ImageTag` | Yes | — | SemVer tag for container images |
| `-ContainerRegistry` | Yes | — | Registry prefix (e.g. `ghcr.io/myuser`) |
| `-Location` | No | `norwayeast` | Azure region |
| `-ResourceGroup` | No | `rg-thuddle` | Resource group name |
| `-KeycloakCustomDomain` | No | — | Custom hostname for Keycloak (e.g. `auth.thuddle.app`) |
| `-ApiCustomDomain` | No | — | Custom hostname for the API (e.g. `api.thuddle.app`) |

The script prompts for PostgreSQL and Keycloak passwords (or reads `$env:POSTGRES_PASSWORD` / `$env:KEYCLOAK_ADMIN_PASSWORD`).

On success, it writes endpoint URLs to `infra/.deploy-outputs.json`.

#### Custom domains

Passing `-KeycloakCustomDomain` or `-ApiCustomDomain` will:

1. Bind the hostname to the respective Container App's ingress (declaratively in Bicep).
2. Request an Azure-managed TLS certificate via `Microsoft.App/managedEnvironments/managedCertificates`. Managed certs auto-renew — no manual intervention needed.

**Before running the script**, create a CNAME record pointing the custom hostname at the Container App's auto-generated FQDN (shown in the Azure portal under the app's ingress settings, or in the `apiFqdn` / `keycloakFqdn` outputs). DNS must resolve before Azure can validate and issue the certificate.

> **Note for existing deployments**: if you previously added custom domain bindings manually in the portal, ARM will reconcile on the next Bicep deploy. Manually-created certs with auto-generated names (e.g. `auth-thuddle-app-xxxxx`) will be orphaned; Bicep creates new certs named `auth-thuddle-app` and `api-thuddle-app`. The orphaned certs can be deleted from the portal safely after the deploy succeeds.

### Step 2: Build, Push, and Deploy

```powershell
./infra/Deploy-App.ps1 -ImageTag "0.1.3" -ContainerRegistry "ghcr.io/myuser"
```

| Parameter | Required | Default | Description |
|---|---|---|---|
| `-ImageTag` | Yes | — | SemVer tag for container images |
| `-ContainerRegistry` | Yes | — | Registry prefix |
| `-ResourceGroup` | No | `rg-thuddle` | Resource group name |
| `-SkipBuild` | No | `false` | Skip Docker build/push |
| `-SkipMigrations` | No | `false` | Skip database migrations |
| `-SkipFrontend` | No | `false` | Skip frontend build/deploy |

This script:
1. Builds and pushes Docker images (`thuddle-api`, `thuddle-migrations`, `thuddle-keycloak`)
2. Updates Container Apps to the new image tag
3. Runs database migrations (starts the job, polls until complete)
4. Builds the Vue.js frontend with baked-in API/Keycloak URLs
5. Deploys the frontend to Azure Static Web Apps

## Troubleshooting

| Problem | Solution |
|---|---|
| OIDC login fails with "AADSTS700024" | Check that the federated credential `subject` matches the triggering ref exactly |
| Docker push returns 403 | Ensure the workflow has `packages: write` permission |
| Bicep deploy fails on first run | Service principal needs **Contributor** on the subscription (not just the RG, since it creates the RG) |
| Migrations time out | Check migration job logs via `az containerapp job execution list` |
