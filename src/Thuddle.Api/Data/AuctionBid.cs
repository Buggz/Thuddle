namespace Thuddle.Api.Data;

public class AuctionBid
{
    public Guid Id { get; set; }
    public required Guid ItemId { get; set; }
    public required Guid BidderUserId { get; set; }
    public decimal Amount { get; set; }
    public bool IsBuyout { get; set; }
    public bool IsVoided { get; set; }
    public required string IdempotencyKey { get; set; }
    public DateTime CreatedAt { get; set; }

    public AuctionItem Item { get; set; } = null!;
    public User Bidder { get; set; } = null!;
}
