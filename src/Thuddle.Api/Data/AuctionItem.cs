using System.ComponentModel.DataAnnotations;

namespace Thuddle.Api.Data;

public enum AuctionItemStatus { Draft, PendingApproval, Live, Sold, Unsold, Withdrawn }

public class AuctionItem
{
    public Guid Id { get; set; }
    public required Guid EventId { get; set; }
    public required Guid SubmittedByUserId { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public decimal StartingBid { get; set; }
    public decimal? BuyoutPrice { get; set; }
    public AuctionItemStatus Status { get; set; }
    public Guid? CurrentBidId { get; set; }
    public Guid? WinnerUserId { get; set; }
    public decimal? FinalPrice { get; set; }
    public DateTime? ClaimedAt { get; set; }

    [Timestamp]
    public uint RowVersion { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Event Event { get; set; } = null!;
    public User SubmittedByUser { get; set; } = null!;
    public AuctionBid? CurrentBid { get; set; }
    public User? Winner { get; set; }
}
