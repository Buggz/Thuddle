namespace Thuddle.Api.Realtime;

/// <summary>
/// Event names used on the SignalR hub. Keep in sync with the frontend.
/// </summary>
public static class RealtimeEvents
{
    public const string EventCreated = "EventCreated";
    public const string EventUpdated = "EventUpdated";
    public const string EventDeleted = "EventDeleted";
    public const string ParticipantChanged = "ParticipantChanged";
    public const string DiscussionActivity = "DiscussionActivity";
    public const string CommentCountChanged = "CommentCountChanged";
    public const string InvitationSent = "InvitationSent";
}
