# GitHub Actions CI/CD Setup

This guide explains how to configure GitHub Actions to automatically build, publish, and deploy Thuddle.

## Overview

There are two workflows:

| Workflow | File | Trigger | What it does |
|----------|------|---------|--------------|
| **CI** | `.github/workflows/ci.yml` | Every push / PR | Versions (GitVersion), builds .NET + frontend, pushes Docker images to GHCR on `main` |
| **Deploy** | `.github/workflows/deploy.yml` | Manual (`workflow_dispatch`) | Deploys infrastructure via Bicep, runs DB migrations, deploys the Vue.js frontend |

## Prerequisites

- An **Azure subscription**
- A **GitHub** repository with **Packages** enabled (GHCR)

## 1. Create an Azure Service Principal (Federated / OIDC)

The deploy workflow authenticates to Azure using **workload identity federation** (OIDC) — no long-lived secrets needed.

### 1.1 Create an App Registration

```bash
az ad app create --display-name "thuddle-github-deploy"
```

Note the `appId` from the output.

### 1.2 Create a Service Principal

```bash
az ad sp create --id <appId>
```

### 1.3 Assign the Contributor role

```bash
az role assignment create \
  --assignee <appId> \
  --role Contributor \
  --scope /subscriptions/<subscription-id>
```

### 1.4 Add a Federated Credential for GitHub Actions

```bash
az ad app federated-credential create --id <appId> --parameters '{
  "name": "github-main-deploy",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:<owner>/<repo>:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'
```

Replace `<owner>/<repo>` with your GitHub repository (e.g. `myuser/Thuddle`).

> **Tip:** If you also want to allow manual deployments from any branch, add another federated credential with `"subject": "repo:<owner>/<repo>:environment:production"` and configure a `production` environment in GitHub.

### 1.5 Note the IDs

You'll need three values from the steps above:

| Value | Where to find it |
|-------|------------------|
| **Client ID** (appId) | `az ad app list --display-name thuddle-github-deploy --query "[].appId" -o tsv` |
| **Tenant ID** | `az account show --query tenantId -o tsv` |
| **Subscription ID** | `az account show --query id -o tsv` |

## 2. Configure GitHub Secrets

Go to **Settings → Secrets and variables → Actions** in your GitHub repository and add these **repository secrets**:

| Secret | Value | How to create it |
|--------|-------|------------------|
| `AZURE_CLIENT_ID` | The App Registration's `appId` | From step 1.1 |
| `AZURE_TENANT_ID` | Your Azure AD tenant ID | `az account show --query tenantId -o tsv` |
| `AZURE_SUBSCRIPTION_ID` | Your Azure subscription ID | `az account show --query id -o tsv` |
| `POSTGRES_PASSWORD` | A strong password for the PostgreSQL admin user | Generate one (e.g. `openssl rand -base64 24`) |
| `KEYCLOAK_ADMIN_PASSWORD` | A strong password for the Keycloak admin user | Generate one (e.g. `openssl rand -base64 24`) |

> **Security note:** `POSTGRES_PASSWORD` and `KEYCLOAK_ADMIN_PASSWORD` are used during the first Bicep deployment to create the database server and Keycloak container. Keep them consistent across deployments — changing them requires manual resource updates.

## 3. Enable GHCR Package Publishing

The CI workflow pushes Docker images to `ghcr.io/<owner>/thuddle-*`. This works automatically via the `GITHUB_TOKEN`, but the packages will initially be **private**.

To allow the Container Apps to pull images without registry credentials, make the packages public:

1. Go to your **GitHub profile → Packages**
2. For each package (`thuddle-api`, `thuddle-migrations`, `thuddle-keycloak`):
   - Click the package → **Package settings** → **Change visibility** → **Public**

Alternatively, configure GHCR pull credentials in the Bicep template.

## 4. Running the Workflows

### CI (automatic)

Runs on every push and PR. On `main`, it also builds and pushes Docker images tagged with the GitVersion SemVer (e.g. `0.1.3`) and `latest`.

### Deploy (manual)

1. Go to **Actions → Deploy → Run workflow**
2. Enter the **image tag** — use the SemVer from a CI run (e.g. `0.1.3`)
3. Click **Run workflow**

The deploy workflow will:
1. Create/update the resource group and all Azure resources via Bicep
2. Start and wait for the database migration job
3. Build the Vue.js frontend with the correct API/Keycloak URLs
4. Deploy the frontend to Azure Static Web Apps

## 5. Workflow Details

### CI Pipeline

```
push/PR → GitVersion → .NET build+test → Frontend build → (main only) Docker build+push to GHCR
```

**Docker images built:**
- `ghcr.io/<owner>/thuddle-api:<semver>`
- `ghcr.io/<owner>/thuddle-migrations:<semver>`
- `ghcr.io/<owner>/thuddle-keycloak:<semver>`

### Deploy Pipeline

```
workflow_dispatch(version) → Bicep deploy → Run migrations → Build & deploy frontend
```

**Azure resources created/updated:**
- Resource Group (`rg-thuddle`)
- Log Analytics workspace
- Container Apps Environment
- PostgreSQL Flexible Server (Burstable B1ms) with `thuddledb` and `keycloakdb`
- Storage Account with `profile-pictures` blob container
- Container Apps: `thuddle-api`, `thuddle-keycloak`
- Container Apps Job: `thuddle-migrations`
- Static Web App: `thuddle-web`

## Troubleshooting

| Problem | Solution |
|---------|----------|
| OIDC login fails with "AADSTS700024" | Check that the federated credential `subject` matches the triggering ref exactly |
| Docker push returns 403 | Ensure the workflow has `packages: write` permission and `GITHUB_TOKEN` is used |
| Bicep deploy fails on first run | Ensure the service principal has **Contributor** on the subscription (not just the resource group, since it creates the RG) |
| Migrations time out | Check the migration job logs with `az containerapp job execution list -n thuddle-migrations -g rg-thuddle` |
| Frontend deploy fails | Verify the SWA exists and the `az staticwebapp secrets list` command succeeds |
