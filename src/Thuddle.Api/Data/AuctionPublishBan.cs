namespace Thuddle.Api.Data;

public class AuctionPublishBan
{
    public Guid Id { get; set; }
    public required Guid EventId { get; set; }
    public required Guid UserId { get; set; }
    public required Guid BannedByUserId { get; set; }
    public string? Reason { get; set; }
    public DateTime CreatedAt { get; set; }

    public Event Event { get; set; } = null!;
    public User User { get; set; } = null!;
    public User BannedByUser { get; set; } = null!;
}
