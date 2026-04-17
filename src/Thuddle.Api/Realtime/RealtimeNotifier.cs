using Microsoft.AspNetCore.SignalR;
using Thuddle.Api.Data;

namespace Thuddle.Api.Realtime;

/// <summary>
/// Publishes realtime notifications to connected clients. Messages are scoped
/// to the smallest audience that needs them: per-event groups for per-event
/// updates, the dashboard group for public-event discovery, and per-user
/// groups for personal notifications. Payloads are ids-only; clients refetch
/// via REST so authorization stays on the server.
/// </summary>
public interface IRealtimeNotifier
{
    Task EventCreatedAsync(Guid eventId, EventVisibility visibility, CancellationToken ct = default);
    Task EventUpdatedAsync(Guid eventId, CancellationToken ct = default);
    Task EventDeletedAsync(Guid eventId, CancellationToken ct = default);
    Task ParticipantChangedAsync(Guid eventId, int participantCount, CancellationToken ct = default);
    Task DiscussionActivityAsync(Guid eventId, CancellationToken ct = default);
    /// <summary>
    /// Broadcasts an authoritative comment count + latest activity timestamp
    /// for a single post. Clients replace local state with these values — they
    /// must NEVER be applied as deltas to avoid double-counting races with
    /// optimistic client updates.
    /// </summary>
    Task CommentCountChangedAsync(Guid eventId, Guid postId, int commentCount, DateTime? latestCommentAt, CancellationToken ct = default);
    Task InvitationSentAsync(string userKeycloakId, Guid eventId, CancellationToken ct = default);
}

public sealed class RealtimeNotifier(IHubContext<ThuddleHub> hub) : IRealtimeNotifier
{
    // Only public events go to the dashboard group (guests see those too).
    // Unlisted/invite-only events are discovered via InvitationSent on the
    // owner's user group.
    public Task EventCreatedAsync(Guid eventId, EventVisibility visibility, CancellationToken ct = default)
    {
        if (visibility != EventVisibility.Public) return Task.CompletedTask;
        return hub.Clients.Group(ThuddleHub.DashboardGroup)
            .SendAsync(RealtimeEvents.EventCreated, new { eventId }, ct);
    }

    public Task EventUpdatedAsync(Guid eventId, CancellationToken ct = default) =>
        hub.Clients.Group(ThuddleHub.EventGroup(eventId))
            .SendAsync(RealtimeEvents.EventUpdated, new { eventId }, ct);

    public Task EventDeletedAsync(Guid eventId, CancellationToken ct = default) =>
        hub.Clients.Group(ThuddleHub.EventGroup(eventId))
            .SendAsync(RealtimeEvents.EventDeleted, new { eventId }, ct);

    public Task ParticipantChangedAsync(Guid eventId, int participantCount, CancellationToken ct = default) =>
        hub.Clients.Group(ThuddleHub.EventGroup(eventId))
            .SendAsync(RealtimeEvents.ParticipantChanged, new { eventId, participantCount }, ct);

    public Task DiscussionActivityAsync(Guid eventId, CancellationToken ct = default) =>
        hub.Clients.Group(ThuddleHub.EventGroup(eventId))
            .SendAsync(RealtimeEvents.DiscussionActivity, new { eventId }, ct);

    public Task CommentCountChangedAsync(Guid eventId, Guid postId, int commentCount, DateTime? latestCommentAt, CancellationToken ct = default) =>
        hub.Clients.Group(ThuddleHub.EventGroup(eventId))
            .SendAsync(RealtimeEvents.CommentCountChanged, new { eventId, postId, commentCount, latestCommentAt }, ct);

    public Task InvitationSentAsync(string userKeycloakId, Guid eventId, CancellationToken ct = default) =>
        hub.Clients.Group(ThuddleHub.UserGroup(userKeycloakId))
            .SendAsync(RealtimeEvents.InvitationSent, new { eventId }, ct);
}
