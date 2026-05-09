using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;
using Thuddle.Api.Realtime;

namespace Thuddle.Api.Services;

public sealed class NotificationService(ThuddleDbContext db, IRealtimeNotifier realtime, ILogger<NotificationService> logger)
{
    public async Task CreateAsync(
        Guid userId,
        NotificationKind kind,
        string title,
        string message,
        string? entityType = null,
        Guid? eventId = null,
        Guid? entityId = null,
        Guid? secondaryEntityId = null,
        CancellationToken ct = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(title);
        ArgumentException.ThrowIfNullOrWhiteSpace(message);

        var notification = new Notification
        {
            Id = Guid.NewGuid(),
            RecipientUserId = userId,
            Kind = kind,
            Title = title,
            EventId = eventId,
            EntityId = entityId,
            EntityType = entityType,
            SecondaryEntityId = secondaryEntityId,
            Message = message,
            CreatedAt = DateTime.UtcNow
        };

        db.Notifications.Add(notification);
        await db.SaveChangesAsync(ct);

        logger.LogDebug("Notification created: notification_id={NotificationId} recipient_user_id={RecipientUserId}", notification.Id, userId);

        var keycloakId = await db.Users
            .Where(u => u.Id == userId)
            .Select(u => u.KeycloakId)
            .FirstOrDefaultAsync(ct);

        if (!string.IsNullOrEmpty(keycloakId))
        {
            await realtime.NotificationCreatedAsync(keycloakId, notification.Id, ct);
        }
    }

    public async Task NotifyItemRejected(
        Guid submitterId,
        Guid itemId,
        string? reason,
        bool allowResubmit,
        CancellationToken ct = default)
    {
        var message = allowResubmit
            ? $"Your auction item was rejected. You may resubmit after editing.{(reason is not null ? $" Reason: {reason}" : "")}"
            : $"Your auction item was rejected and cannot be resubmitted.{(reason is not null ? $" Reason: {reason}" : "")}";

        await CreateAsync(
            userId: submitterId,
            kind: NotificationKind.AuctionItemRejected,
            title: "Auction item rejected",
            message: message,
            entityType: "AuctionItem",
            entityId: itemId,
            ct: ct);
    }

    public async Task NotifyBidVoided(
        Guid bidderId,
        Guid itemId,
        string? reason,
        CancellationToken ct = default)
    {
        var message = $"Your bid was voided because the auction item was removed.{(reason is not null ? $" Reason: {reason}" : "")}";

        await CreateAsync(
            userId: bidderId,
            kind: NotificationKind.AuctionBidVoided,
            title: "Your bid was voided",
            message: message,
            entityType: "AuctionItem",
            entityId: itemId,
            ct: ct);
    }

    public async Task NotifyUserBannedFromAuction(
        Guid userId,
        Guid eventId,
        string? reason,
        CancellationToken ct = default)
    {
        var message = $"You have been banned from publishing in this auction.{(reason is not null ? $" Reason: {reason}" : "")}";

        await CreateAsync(
            userId: userId,
            kind: NotificationKind.AuctionUserBanned,
            title: "You were banned from publishing",
            message: message,
            entityType: "Event",
            eventId: eventId,
            entityId: eventId,
            ct: ct);
    }

    public async Task NotifyRemovedFromActivity(
        Guid userId,
        Guid eventId,
        Guid activityId,
        string activityTitle,
        CancellationToken ct = default)
    {
        await CreateAsync(
            userId: userId,
            kind: NotificationKind.RemovedFromActivity,
            title: "Removed from activity",
            message: $"You were removed from \"{activityTitle}\".",
            entityType: "EventActivity",
            eventId: eventId,
            entityId: activityId,
            ct: ct);
    }
}
