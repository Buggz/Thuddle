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
}
