using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;
using Thuddle.Api.Realtime;

namespace Thuddle.Api.Services;

public sealed class NotificationService(ThuddleDbContext db, IRealtimeNotifier realtime)
{
    public async Task CreateAsync(
        Guid userId,
        NotificationKind kind,
        Guid? eventId,
        Guid? entityId,
        string message,
        CancellationToken ct = default)
    {
        var notification = new Notification
        {
            Id = Guid.NewGuid(),
            RecipientUserId = userId,
            Kind = kind,
            EventId = eventId,
            EntityId = entityId,
            Message = message,
            CreatedAt = DateTime.UtcNow
        };

        db.Notifications.Add(notification);
        await db.SaveChangesAsync(ct);

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
            submitterId,
            NotificationKind.AuctionItemRejected,
            null,
            itemId,
            message,
            ct);
    }

    public async Task NotifyBidVoided(
        Guid bidderId,
        Guid itemId,
        string? reason,
        CancellationToken ct = default)
    {
        var message = $"Your bid was voided because the auction item was removed.{(reason is not null ? $" Reason: {reason}" : "")}";

        await CreateAsync(
            bidderId,
            NotificationKind.AuctionBidVoided,
            null,
            itemId,
            message,
            ct);
    }

    public async Task NotifyUserBannedFromAuction(
        Guid userId,
        Guid eventId,
        string? reason,
        CancellationToken ct = default)
    {
        var message = $"You have been banned from publishing in this auction.{(reason is not null ? $" Reason: {reason}" : "")}";

        await CreateAsync(
            userId,
            NotificationKind.AuctionUserBanned,
            eventId,
            null,
            message,
            ct);
    }
}
