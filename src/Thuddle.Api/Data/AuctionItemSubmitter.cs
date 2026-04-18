namespace Thuddle.Api.Data;

public class AuctionItemSubmitter
{
    public Guid Id { get; set; }
    public required Guid EventId { get; set; }
    public required Guid UserId { get; set; }

    public Event Event { get; set; } = null!;
    public User User { get; set; } = null!;
}
