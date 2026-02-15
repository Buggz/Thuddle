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
            await dbContext.Database.MigrateAsync(ct);
            logger.LogInformation("Migrations applied successfully.");
        });
    }
}
