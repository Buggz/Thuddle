using Microsoft.AspNetCore.SignalR;

namespace Thuddle.Api.Realtime;

/// <summary>
/// Publishes realtime notifications to connected clients. Payloads are kept
/// small (identifiers only); clients refetch via REST to get user-specific
/// data, keeping authorization logic on the server.
/// </summary>
public interface IRealtimeNotifier
{
    Task EventCreatedAsync(Guid eventId, CancellationToken ct = default);
    Task EventUpdatedAsync(Guid eventId, CancellationToken ct = default);
    Task EventDeletedAsync(Guid eventId, CancellationToken ct = default);
    Task ParticipantChangedAsync(Guid eventId, int participantCount, CancellationToken ct = default);
    Task DiscussionActivityAsync(Guid eventId, CancellationToken ct = default);
    Task InvitationSentAsync(string userKeycloakId, Guid eventId, CancellationToken ct = default);
}

public sealed class RealtimeNotifier(IHubContext<ThuddleHub> hub) : IRealtimeNotifier
{
    public Task EventCreatedAsync(Guid eventId, CancellationToken ct = default) =>
        hub.Clients.All.SendAsync(RealtimeEvents.EventCreated, new { eventId }, ct);

    public Task EventUpdatedAsync(Guid eventId, CancellationToken ct = default) =>
        hub.Clients.All.SendAsync(RealtimeEvents.EventUpdated, new { eventId }, ct);

    public Task EventDeletedAsync(Guid eventId, CancellationToken ct = default) =>
        hub.Clients.All.SendAsync(RealtimeEvents.EventDeleted, new { eventId }, ct);

    public Task ParticipantChangedAsync(Guid eventId, int participantCount, CancellationToken ct = default) =>
        hub.Clients.All.SendAsync(RealtimeEvents.ParticipantChanged, new { eventId, participantCount }, ct);

    public Task DiscussionActivityAsync(Guid eventId, CancellationToken ct = default) =>
        hub.Clients.All.SendAsync(RealtimeEvents.DiscussionActivity, new { eventId }, ct);

    public Task InvitationSentAsync(string userKeycloakId, Guid eventId, CancellationToken ct = default) =>
        hub.Clients.Group(ThuddleHub.UserGroup(userKeycloakId))
            .SendAsync(RealtimeEvents.InvitationSent, new { eventId }, ct);
}
