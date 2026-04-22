namespace Thuddle.Api.Data;

public sealed class EventBlocklistEntry
{
    public Guid EventId { get; set; }
    public Event Event { get; set; } = null!;

    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    public Guid BlockedByUserId { get; set; }
    public User BlockedByUser { get; set; } = null!;

    public DateTime BlockedAt { get; set; }
}
