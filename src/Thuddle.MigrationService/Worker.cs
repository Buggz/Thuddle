using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;
using Thuddle.Api.Services;

namespace Thuddle.MigrationService;

public class MigrationWorker(
    IServiceProvider serviceProvider,
    IHostApplicationLifetime hostApplicationLifetime,
    IConfiguration configuration,
    ILogger<MigrationWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("Migration service starting...");

        try
        {
            using var scope = serviceProvider.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ThuddleDbContext>();

            await RunMigrationsAsync(dbContext, stoppingToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Migration failed: {Error}", ex.Message);
            throw;
        }

        try
        {
            await BackfillEventSlugsAsync(stoppingToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Event slug backfill failed: {Error}", ex.Message);
            throw;
        }

        try
        {
            using var scope = serviceProvider.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<ThuddleDbContext>();

            await SeedDataAsync(dbContext, stoppingToken);
            logger.LogInformation("Migration service completed successfully.");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Seeding failed: {Error}", ex.Message);
            throw;
        }
        finally
        {
            hostApplicationLifetime.StopApplication();
        }
    }

    private async Task RunMigrationsAsync(ThuddleDbContext dbContext, CancellationToken ct)    {
        var strategy = dbContext.Database.CreateExecutionStrategy();

        await strategy.ExecuteAsync(async () =>
        {
            // Repair: if history table exists but is empty while the database has tables,
            // re-baseline by marking already-applied migrations as applied.
            await RepairMigrationHistoryAsync(dbContext, ct);

            logger.LogInformation("Applying pending migrations...");
            await dbContext.Database.MigrateAsync(ct);
            logger.LogInformation("Migrations applied successfully.");
        });
    }

    private async Task BackfillEventSlugsAsync(CancellationToken ct)
    {
        logger.LogInformation("Checking for events missing slugs...");

        using var scope = serviceProvider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ThuddleDbContext>();
        var slugService = scope.ServiceProvider.GetRequiredService<SlugService>();

        // Use EF.Property to query the nullable DB column without fighting the required C# property.
        // Older events are processed first so they get the bare slug; newer ones get the -N suffix.
        var events = await db.Events
            .AsNoTracking()
            .Where(e => EF.Property<string?>(e, "Slug") == null)
            .OrderBy(e => e.CreatedAt)
            .Select(e => new { e.Id, e.Title })
            .ToListAsync(ct);

        if (events.Count == 0)
        {
            logger.LogInformation("No events missing slugs; backfill skipped.");
            return;
        }

        logger.LogInformation("Backfilling slugs for {Count} event(s)...", events.Count);

        foreach (var row in events)
        {
            var baseSlug = slugService.Slugify(row.Title);
            var slug = await slugService.EnsureUniqueAsync(baseSlug, excludeEventId: row.Id, ct);
            await db.Database.ExecuteSqlAsync(
                $"UPDATE \"Events\" SET \"Slug\" = {slug} WHERE \"Id\" = {row.Id}", ct);
        }

        logger.LogInformation("Event slug backfill complete.");
    }

    private async Task RepairMigrationHistoryAsync(ThuddleDbContext dbContext, CancellationToken ct)
    {
        var conn = dbContext.Database.GetDbConnection();

        await conn.OpenAsync(ct);

        // Check if __EFMigrationsHistory exists
        await using var historyCmd = conn.CreateCommand();
        historyCmd.CommandText = """
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_name = '__EFMigrationsHistory'
            """;
        var historyExists = (long)(await historyCmd.ExecuteScalarAsync(ct))! > 0;
        if (!historyExists)
        {
            await conn.CloseAsync();
            return;
        }

        // Check if history is empty
        await using var countCmd = conn.CreateCommand();
        countCmd.CommandText = """SELECT COUNT(*) FROM "__EFMigrationsHistory" """;
        var historyCount = (long)(await countCmd.ExecuteScalarAsync(ct))!;
        if (historyCount > 0)
        {
            await conn.CloseAsync();
            return;
        }

        // Check if the Users table already exists (proxy for "database was previously migrated")
        await using var tableCmd = conn.CreateCommand();
        tableCmd.CommandText = """
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_name = 'Users'
            """;
        var tablesExist = (long)(await tableCmd.ExecuteScalarAsync(ct))! > 0;
        if (!tablesExist)
        {
            await conn.CloseAsync();
            return;
        }

        logger.LogWarning("Migration history is empty but database tables exist. Re-baselining...");

        // Get all migrations known to EF, mark all but the pending ones as applied
        var allMigrations = dbContext.Database.GetMigrations().ToList();
        var pendingMigrations = (await dbContext.Database.GetPendingMigrationsAsync(ct)).ToHashSet();

        // Since history is empty, ALL migrations are "pending". We need to figure out which
        // ones are actually already applied by checking the schema.
        // Strategy: insert all migrations EXCEPT the truly new ones (those that add columns/tables
        // that don't exist yet). We detect this by checking for the FullName column.
        await using var fullNameCmd = conn.CreateCommand();
        fullNameCmd.CommandText = """
            SELECT COUNT(*) FROM information_schema.columns
            WHERE table_name = 'Users' AND column_name = 'FullName'
            """;
        var fullNameExists = (long)(await fullNameCmd.ExecuteScalarAsync(ct))! > 0;

        // All migrations that existed before AddUserFullName are already applied
        var baselineMigrations = allMigrations
            .TakeWhile(m => !m.Contains("AddUserFullName"))
            .ToList();

        // If FullName column exists, AddUserFullName is also already applied
        if (fullNameExists)
        {
            var addUserFullName = allMigrations.FirstOrDefault(m => m.Contains("AddUserFullName"));
            if (addUserFullName is not null)
                baselineMigrations.Add(addUserFullName);
        }

        var version = typeof(DbContext).Assembly.GetName().Version?.ToString() ?? "10.0.5";

        foreach (var migration in baselineMigrations)
        {
            await using var insertCmd = conn.CreateCommand();
            insertCmd.CommandText = $"""
                INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
                VALUES ('{migration}', '{version}')
                ON CONFLICT DO NOTHING
                """;
            await insertCmd.ExecuteNonQueryAsync(ct);
            logger.LogInformation("Baselined migration: {MigrationId}", migration);
        }

        logger.LogInformation("Re-baseline complete. {Count} migrations marked as applied.", baselineMigrations.Count);
        await conn.CloseAsync();
    }

    private async Task SeedDataAsync(ThuddleDbContext dbContext, CancellationToken ct)
    {
        var adminEmail = configuration["Seed:AdminEmail"];
        if (string.IsNullOrWhiteSpace(adminEmail))
        {
            logger.LogInformation("No Seed:AdminEmail configured, skipping admin seed.");
            return;
        }

        var user = await dbContext.Users.FirstOrDefaultAsync(
            u => u.Email.ToLower() == adminEmail.ToLower(), ct);
        if (user is null)
        {
            // Create the user so the permission can be granted immediately.
            // On first login, /api/profile/init will match by email and update the KeycloakId.
            user = new User
            {
                Id = Guid.NewGuid(),
                KeycloakId = "",
                Email = adminEmail,
                DisplayName = "Test User",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            dbContext.Users.Add(user);
            await dbContext.SaveChangesAsync(ct);
            logger.LogInformation("Created seed user {Email}.", adminEmail);
        }

        var hasPermission = await dbContext.UserPermissions
            .AnyAsync(p => p.UserId == user.Id && p.Permission == "events:write", ct);

        if (!hasPermission)
        {
            dbContext.UserPermissions.Add(new UserPermission
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                Permission = "events:write",
                GrantedAt = DateTime.UtcNow
            });
            await dbContext.SaveChangesAsync(ct);
            logger.LogInformation("Granted events:write permission to {Email}.", adminEmail);
        }
        else
        {
            logger.LogInformation("Admin {Email} already has events:write permission.", adminEmail);
        }

        var hasGroupsPermission = await dbContext.UserPermissions
            .AnyAsync(p => p.UserId == user.Id && p.Permission == "groups:manage", ct);

        if (!hasGroupsPermission)
        {
            dbContext.UserPermissions.Add(new UserPermission
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                Permission = "groups:manage",
                GrantedAt = DateTime.UtcNow
            });
            await dbContext.SaveChangesAsync(ct);
            logger.LogInformation("Granted groups:manage permission to {Email}.", adminEmail);
        }

        var hasAdminPermission = await dbContext.UserPermissions
            .AnyAsync(p => p.UserId == user.Id && p.Permission == "admin:access", ct);

        if (!hasAdminPermission)
        {
            dbContext.UserPermissions.Add(new UserPermission
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                Permission = "admin:access",
                GrantedAt = DateTime.UtcNow
            });
            await dbContext.SaveChangesAsync(ct);
            logger.LogInformation("Granted admin:access permission to {Email}.", adminEmail);
        }
    }
}
