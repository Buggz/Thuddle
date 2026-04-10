using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;

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

    private async Task RunMigrationsAsync(ThuddleDbContext dbContext, CancellationToken ct)
    {
        var strategy = dbContext.Database.CreateExecutionStrategy();

        await strategy.ExecuteAsync(async () =>
        {
            logger.LogInformation("Applying pending migrations...");
            await dbContext.Database.MigrateAsync(ct);
            logger.LogInformation("Migrations applied successfully.");
        });
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
            logger.LogInformation("Admin user {Email} not found in database yet — permission will be granted on first login.", adminEmail);
            return;
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
    }
}
