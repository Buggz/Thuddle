using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;
using Thuddle.Api.Realtime;

namespace Thuddle.Api.Services;

public sealed class AuctionLifecycleWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<AuctionLifecycleWorker> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("AuctionLifecycleWorker started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "AuctionLifecycleWorker iteration failed.");
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }

    private async Task ProcessAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ThuddleDbContext>();
        var realtime = scope.ServiceProvider.GetRequiredService<IRealtimeNotifier>();
        var notifications = scope.ServiceProvider.GetRequiredService<NotificationService>();
        var now = DateTime.UtcNow;

        await StartScheduledAuctions(db, realtime, now, ct);
        await FinalizeEndedAuctions(db, realtime, notifications, now, ct);
        await SendEndingSoonNotifications(db, notifications, now, ct);
    }

    private async Task StartScheduledAuctions(
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        DateTime now,
        CancellationToken ct)
    {
        var scheduledAuctions = await db.EventAuctionSettings
            .AsTracking()
            .Where(a => a.Status == AuctionStatus.Scheduled && a.StartsAt != null && a.StartsAt <= now)
            .ToListAsync(ct);

        foreach (var auction in scheduledAuctions)
        {
            if (auction.EarliestEndsAt is null || auction.LatestEndsAt is null)
            {
                logger.LogWarning("Skipping scheduled auction for event {EventId}: EarliestEndsAt or LatestEndsAt is null.", auction.EventId);
                continue;
            }

            auction.SealedEndsAt = AuctionService.SealRandomEndsAt(auction.EarliestEndsAt.Value, auction.LatestEndsAt.Value);
            auction.Status = AuctionStatus.Live;
            auction.UpdatedAt = now;

            await db.SaveChangesAsync(ct);
            await realtime.AuctionStatusChangedAsync(auction.EventId, "Live", ct);

            logger.LogInformation("Auto-started scheduled auction for event {EventId}. SealedEndsAt={SealedEndsAt}.", auction.EventId, auction.SealedEndsAt);
        }
    }

    private async Task FinalizeEndedAuctions(
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        NotificationService notifications,
        DateTime now,
        CancellationToken ct)
    {
        var endedAuctions = await db.EventAuctionSettings
            .AsTracking()
            .Where(a => a.Status == AuctionStatus.Live && a.SealedEndsAt != null && a.SealedEndsAt <= now)
            .ToListAsync(ct);

        foreach (var auction in endedAuctions)
        {
            using var activity = AuctionService.Source.StartActivity("FinalizeAuction");
            activity?.SetTag("eventId", auction.EventId);

            var strategy = db.Database.CreateExecutionStrategy();
            await strategy.ExecuteAsync(async () =>
            {
                await using var tx = await db.Database.BeginTransactionAsync(ct);

                var items = await db.AuctionItems
                    .AsTracking()
                    .Where(i => i.EventId == auction.EventId && i.Status == AuctionItemStatus.Live)
                    .ToListAsync(ct);

                foreach (var item in items)
                {
                    var highestBid = await db.AuctionBids
                        .Where(b => b.ItemId == item.Id)
                        .OrderByDescending(b => b.Amount)
                        .FirstOrDefaultAsync(ct);

                    if (highestBid is not null)
                    {
                        item.Status = AuctionItemStatus.Sold;
                        item.WinnerUserId = highestBid.BidderUserId;
                        item.FinalPrice = highestBid.Amount;
                        item.CurrentBidId = highestBid.Id;
                    }
                    else
                    {
                        item.Status = AuctionItemStatus.Unsold;
                    }

                    item.UpdatedAt = now;
                }

                auction.Status = AuctionStatus.Ended;
                auction.UpdatedAt = now;

                await db.SaveChangesAsync(ct);
                await tx.CommitAsync(ct);

                // Post-commit: notifications and realtime
                foreach (var item in items.Where(i => i.Status == AuctionItemStatus.Sold))
                {
                    await notifications.CreateAsync(
                        item.WinnerUserId!.Value,
                        NotificationKind.AuctionWonItem,
                        auction.EventId,
                        item.Id,
                        $"You won \"{item.Name}\" for {item.FinalPrice:N2}!",
                        ct);

                    await realtime.AuctionItemSoldAsync(auction.EventId, item.Id, ct);
                }

                await realtime.AuctionEndedAsync(auction.EventId, ct);
            });

            logger.LogInformation("Finalized auction for event {EventId}.", auction.EventId);
        }
    }

    /// <summary>
    /// Sends AuctionEndingSoon notifications at T-15min and T-1min relative to LatestEndsAt.
    /// Uses EndingSoon15MinNotifiedAt / EndingSoon1MinNotifiedAt flag columns on EventAuctionSettings
    /// to track which notifications have already been sent — idempotent and survives restarts.
    /// </summary>
    private async Task SendEndingSoonNotifications(
        ThuddleDbContext db,
        NotificationService notifications,
        DateTime now,
        CancellationToken ct)
    {
        var liveAuctions = await db.EventAuctionSettings
            .AsTracking()
            .Where(a => a.Status == AuctionStatus.Live && a.LatestEndsAt != null)
            .Where(a => a.EndingSoon15MinNotifiedAt == null || a.EndingSoon1MinNotifiedAt == null)
            .ToListAsync(ct);

        foreach (var auction in liveAuctions)
        {
            var latestEnd = auction.LatestEndsAt!.Value;

            if (auction.EndingSoon15MinNotifiedAt is null && now >= latestEnd.AddMinutes(-15))
            {
                await NotifyBiddersEndingSoon(db, notifications, auction.EventId, "15 minutes", ct);
                auction.EndingSoon15MinNotifiedAt = now;
                await db.SaveChangesAsync(ct);
            }

            if (auction.EndingSoon1MinNotifiedAt is null && now >= latestEnd.AddMinutes(-1))
            {
                await NotifyBiddersEndingSoon(db, notifications, auction.EventId, "1 minute", ct);
                auction.EndingSoon1MinNotifiedAt = now;
                await db.SaveChangesAsync(ct);
            }
        }
    }

    private static async Task NotifyBiddersEndingSoon(
        ThuddleDbContext db,
        NotificationService notifications,
        Guid eventId,
        string timeLeft,
        CancellationToken ct)
    {
        // Distinct bidders on live items for this auction
        var bidderIds = await db.AuctionBids
            .Where(b => b.Item.EventId == eventId && b.Item.Status == AuctionItemStatus.Live)
            .Select(b => b.BidderUserId)
            .Distinct()
            .ToListAsync(ct);

        foreach (var bidderId in bidderIds)
        {
            await notifications.CreateAsync(
                bidderId,
                NotificationKind.AuctionEndingSoon,
                eventId,
                null,
                $"Auction ending in about {timeLeft}!",
                ct);
        }
    }
}
