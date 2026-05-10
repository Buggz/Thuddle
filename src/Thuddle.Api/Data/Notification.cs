namespace Thuddle.Api.Data;

public enum NotificationKind
{
    OutbidOnAuctionItem,
    AuctionEndingSoon,
    AuctionWonItem,
    AuctionItemPendingApproval,
    AuctionItemRejected,
    AuctionBidVoided,
    AuctionUserBanned,
    RaffleWon,
    EventInvitationReceived,
    EventUpdated,
    DiscussionReplyToYourPost,
    DiscussionMention,
    ContactGroupInvitation,
    RemovedFromActivity,
    PromotedFromWaitlist
}

public class Notification
{
    public Guid Id { get; set; }
    public required Guid RecipientUserId { get; set; }
    public NotificationKind Kind { get; set; }
    public required string Title { get; set; }
    public Guid? EventId { get; set; }
    public Guid? EntityId { get; set; }
    public string? EntityType { get; set; }
    public Guid? SecondaryEntityId { get; set; }
    public required string Message { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? ReadAt { get; set; }

    public User Recipient { get; set; } = null!;
}
