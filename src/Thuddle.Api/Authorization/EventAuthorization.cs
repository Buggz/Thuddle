using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;

namespace Thuddle.Api.Authorization;

/// <summary>
/// Shared helpers for event-scoped authorization checks used across endpoint files.
/// </summary>
public static class EventAuthorization
{
    public static string? GetKeycloakId(ClaimsPrincipal user) =>
        user.FindFirstValue("sub") ?? user.FindFirstValue("sid") ?? user.FindFirstValue("email");

    public static async Task<bool> IsEventAdmin(ThuddleDbContext db, Guid eventId, Guid userId, CancellationToken ct)
    {
        var evt = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return false;
        if (evt.OwnerId == userId) return true;
        return await db.EventCoAdmins.AnyAsync(c => c.EventId == eventId && c.UserId == userId, ct);
    }

    public static async Task<bool> IsEventParticipant(ThuddleDbContext db, Guid eventId, Guid userId, CancellationToken ct)
    {
        if (await IsEventAdmin(db, eventId, userId, ct)) return true;
        return await db.EventParticipants.AnyAsync(p => p.EventId == eventId && p.UserId == userId, ct);
    }
}
