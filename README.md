# Thuddle

Event management platform built with .NET Aspire, Vue.js, Keycloak, and PostgreSQL.

The name is a blend of *Thud* (a board game from Terry Pratchett's Discworld) and *huddle* — loosely meaning coming together in a group.

For deployment instructions, see [DEPLOY.md](DEPLOY.md).

## Prerequisites

- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- [Node.js 20+](https://nodejs.org/) (with npm)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)

## Getting Started

1. **Install frontend dependencies:**

   ```bash
   cd src/Thuddle.Web
   npm install
   ```

2. **Run the AppHost:**

   ```bash
   cd src/Thuddle.AppHost
   dotnet run
   ```

   This starts all services via .NET Aspire:
   - **PostgreSQL** — two databases (app data + Keycloak)
   - **Keycloak** — identity provider with a pre-configured `Thuddle` realm
   - **Azurite** — Azure Blob Storage emulator (event images, profile pictures)
   - **Migration Service** — applies EF Core migrations then exits
   - **API** — .NET backend (`/api`)
   - **Web** — Vue.js frontend (Vite dev server)

   The Aspire dashboard opens automatically and shows endpoints for each service.

## Test Users

The dev realm (`KeycloakConfiguration/Thuddle-realm.dev.json`) seeds these users with stable IDs:

| Username   | Email                | Password       | Notes                          |
|------------|----------------------|----------------|--------------------------------|
| `testuser` | testuser@thuddle.dev | `testpassword` | Seeded with `events:write`     |
| `alice`    | alice@thuddle.dev    | `testpassword` |                                |
| `bob`      | bob@thuddle.dev      | `testpassword` |                                |
| `charlie`  | charlie@thuddle.dev  | `testpassword` |                                |

`testuser` is automatically granted the `events:write` permission by the migration service, allowing it to create events. Other users can be granted permissions through the app.

User IDs are pinned in the realm file so they remain consistent across container recreations. Permissions and other database references will match after a volume reset.

## Architecture

| Project | Description |
|---|---|
| `Thuddle.AppHost` | .NET Aspire orchestration — wires up all services |
| `Thuddle.Api` | .NET minimal API — endpoints, EF Core, auth, image processing |
| `Thuddle.Web` | Vue 3 SPA — Composition API, TipTap, Tailwind CSS |
| `Thuddle.MigrationService` | Worker that runs EF Core migrations on startup |
| `Thuddle.ServiceDefaults` | Shared Aspire service configuration |

## Docker Volumes

The AppHost creates persistent Docker volumes for local data:

| Volume pattern | Purpose |
|---|---|
| `*-postgres-data` | PostgreSQL databases (app + Keycloak) |
| `*-keycloak-data` | Keycloak configuration and realm data |

### Resetting Local Data

If you need a clean slate (e.g. after changing Keycloak realm config or user seed data), remove the volumes:

```powershell
# Find volumes
docker volume ls | Select-String "thuddle"

# Remove them (stop AppHost first)
docker volume ls --format "{{.Name}}" | Select-String "thuddle" | ForEach-Object { docker volume rm $_.ToString().Trim() }
```

The next `dotnet run` will recreate everything from scratch — Keycloak re-imports the realm, and the migration service rebuilds the database.

## EF Core Migrations

Migrations live in `src/Thuddle.Api/Migrations/` and are applied automatically by the migration service on startup.

To add a new migration:

```bash
cd src/Thuddle.Api
dotnet ef migrations add <MigrationName> --startup-project ../Thuddle.MigrationService
```
