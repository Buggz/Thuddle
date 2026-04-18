using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;

namespace Thuddle.Api.Realtime;

/// <summary>
/// SignalR hub for realtime updates. Clients join three kinds of groups so
/// we only send a message to the connections that actually need it:
///
///   dashboard            — every connection (auth or anon) — receives
///                          <see cref="RealtimeEvents.EventCreated"/> for
///                          publicly visible events only.
///   event:{eventId}      — connections that are viewing/listing an event
///                          and have been authorized to do so. Receives all
///                          per-event updates.
///   user:{keycloakId}    — authenticated user's personal channel. Receives
///                          <see cref="RealtimeEvents.InvitationSent"/>.
///
/// Anonymous connections are permitted so dashboard guests still see public
/// event lifecycle updates.
/// </summary>
public sealed class ThuddleHub(ThuddleDbContext db) : Hub
{
    internal const string DashboardGroup = "dashboard";

    public override async Task OnConnectedAsync()
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, DashboardGroup);
        var keycloakId = GetKeycloakId(Context.User);
        if (!string.IsNullOrEmpty(keycloakId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, UserGroup(keycloakId));
        }
    }

    /// <summary>
    /// Subscribes the caller to realtime updates for each of the given event
    /// ids for which the caller is authorized. Returns the subset of ids the
    /// subscription was granted for so the client can reconcile state.
    /// </summary>
    public async Task<Guid[]> SubscribeEvents(Guid[] eventIds)
    {
        if (eventIds is null || eventIds.Length == 0) return [];

        var accessible = await FilterAccessibleAsync(eventIds);
        foreach (var id in accessible)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, EventGroup(id));
        }
        return accessible;
    }

    /// <summary>
    /// Removes the caller from the event-specific groups. No authorization
    /// check is needed for leaving a group.
    /// </summary>
    public async Task UnsubscribeEvents(Guid[] eventIds)
    {
        if (eventIds is null || eventIds.Length == 0) return;
        foreach (var id in eventIds)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, EventGroup(id));
        }
    }

    internal static string UserGroup(string keycloakId) => $"user:{keycloakId}";
    internal static string EventGroup(Guid eventId) => $"event:{eventId}";

    private async Task<Guid[]> FilterAccessibleAsync(Guid[] eventIds)
    {
        var keycloakId = GetKeycloakId(Context.User);
        var query = db.Events.AsNoTracking()
            .Where(e => eventIds.Contains(e.Id));

        if (string.IsNullOrEmpty(keycloakId))
        {
            // Anonymous: only public events are visible.
            return await query
                .Where(e => e.Visibility == EventVisibility.Public)
                .Select(e => e.Id)
                .ToArrayAsync(Context.ConnectionAborted);
        }

        // Authenticated: public events OR events the user has some connection
        // to (owner / participant / co-admin / invitee by email).
        var email = Context.User?.FindFirstValue("email");
        return await query
            .Where(e =>
                e.Visibility == EventVisibility.Public
                || e.Owner.KeycloakId == keycloakId
                || db.EventParticipants.Any(p => p.EventId == e.Id && p.User.KeycloakId == keycloakId)
                || db.EventCoAdmins.Any(c => c.EventId == e.Id && c.User.KeycloakId == keycloakId)
                || (email != null && db.EventInvitations.Any(i => i.EventId == e.Id && i.Email == email)))
            .Select(e => e.Id)
            .ToArrayAsync(Context.ConnectionAborted);
    }

    private static string? GetKeycloakId(ClaimsPrincipal? user)
    {
        if (user?.Identity?.IsAuthenticated != true) return null;
        return user.FindFirstValue("sub")
            ?? user.FindFirstValue("sid")
            ?? user.FindFirstValue("email");
    }
}
