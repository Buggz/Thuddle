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

    // Auction events
    public const string AuctionSettingsChanged = "AuctionSettingsChanged";
    public const string AuctionStatusChanged = "AuctionStatusChanged";
    public const string AuctionItemAdded = "AuctionItemAdded";
    public const string AuctionItemUpdated = "AuctionItemUpdated";
    public const string AuctionItemRemoved = "AuctionItemRemoved";
    public const string AuctionBidPlaced = "AuctionBidPlaced";
    public const string AuctionItemSold = "AuctionItemSold";
    public const string AuctionEnded = "AuctionEnded";
    public const string AuctionUserBanned = "AuctionUserBanned";
    public const string AuctionUserUnbanned = "AuctionUserUnbanned";

    // Notifications
    public const string NotificationCreated = "NotificationCreated";

    // Raffle events
    public const string RaffleCreated = "RaffleCreated";
    public const string RaffleUpdated = "RaffleUpdated";
    public const string RaffleDeleted = "RaffleDeleted";
    public const string RaffleEntryChanged = "RaffleEntryChanged";
    public const string RaffleStarted = "RaffleStarted";
    public const string RaffleWinnerRevealed = "RaffleWinnerRevealed";
}
