namespace Thuddle.Api.Data;

public class DiscussionReadReceipt
{
    public Guid Id { get; set; }
    public required Guid UserId { get; set; }
    public required Guid EventId { get; set; }
    public DateTime LastReadAt { get; set; }

    public User User { get; set; } = null!;
    public Event Event { get; set; } = null!;
}
