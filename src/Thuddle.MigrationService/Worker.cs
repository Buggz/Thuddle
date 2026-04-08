using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;

namespace Thuddle.MigrationService;

public class MigrationWorker(
    IServiceProvider serviceProvider,
    IHostApplicationLifetime hostApplicationLifetime,
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
            await SeedDataAsync(dbContext, stoppingToken);

            logger.LogInformation("Migration service completed successfully.");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Migration service failed: {Error}", ex.Message);
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
            try
            {
                // Ensure database exists first
                await dbContext.Database.EnsureCreatedAsync(ct);
                
                // Then apply migrations
                await dbContext.Database.MigrateAsync(ct);
                logger.LogInformation("Migrations applied successfully.");
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error during migration: {Message}", ex.Message);
                throw;
            }
        });
    }

    private async Task SeedDataAsync(ThuddleDbContext dbContext, CancellationToken ct)
    {
        const string testEmail = "testuser@thuddle.dev";

        var testUser = await dbContext.Users.FirstOrDefaultAsync(u => u.Email == testEmail, ct);
        if (testUser is null)
        {
            testUser = new User
            {
                Id = Guid.NewGuid(),
                KeycloakId = "testuser",
                Email = testEmail,
                DisplayName = "Test User",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            dbContext.Users.Add(testUser);
            await dbContext.SaveChangesAsync(ct);
            logger.LogInformation("Seeded test user: {Email}", testEmail);
        }

        var hasPermission = await dbContext.UserPermissions
            .AnyAsync(p => p.UserId == testUser.Id && p.Permission == "events:write", ct);

        if (!hasPermission)
        {
            dbContext.UserPermissions.Add(new UserPermission
            {
                Id = Guid.NewGuid(),
                UserId = testUser.Id,
                Permission = "events:write",
                GrantedAt = DateTime.UtcNow
            });
            await dbContext.SaveChangesAsync(ct);
            logger.LogInformation("Seeded events:write permission for test user.");
        }
    }
}
