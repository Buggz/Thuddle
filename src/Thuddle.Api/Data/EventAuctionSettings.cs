namespace Thuddle.Api.Data;

public enum AuctionStatus { Draft, Scheduled, Live, Ended }
public enum AuctionSubmissionMode { AdminsOnly, SelectedAttendees, AllAttendees }

public class EventAuctionSettings
{
    public Guid EventId { get; set; }
    public bool Enabled { get; set; }
    public AuctionStatus Status { get; set; }
    public DateTime? StartsAt { get; set; }
    public DateTime? LatestEndsAt { get; set; }
    public DateTime? SealedEndsAt { get; set; }
    public TimeSpan? VeiledCloseWindow { get; set; }
    public TimeSpan? BidTimeExtension { get; set; }
    public AuctionSubmissionMode SubmissionMode { get; set; }
    public ModerationPolicy ItemModerationPolicy { get; set; }
    public decimal MinBidIncrement { get; set; }
    public bool AllowBuyout { get; set; }
    public bool AnonymousBidders { get; set; }
    public bool AnonymousSubmitters { get; set; }
    public DateTime? EndingSoon15MinNotifiedAt { get; set; }
    public DateTime? EndingSoon1MinNotifiedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    /// <summary>
    /// Computed: LatestEndsAt minus VeiledCloseWindow. Not stored.
    /// </summary>
    public DateTime? EarliestEndsAt => LatestEndsAt.HasValue && VeiledCloseWindow.HasValue
        ? LatestEndsAt.Value - VeiledCloseWindow.Value
        : LatestEndsAt;

    public Event Event { get; set; } = null!;
}
