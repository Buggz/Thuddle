namespace Thuddle.Api.Data;

public class EventInvitation
{
    public Guid Id { get; set; }
    public required Guid EventId { get; set; }
    public required string Email { get; set; }
    public DateTime CreatedAt { get; set; }

    public Event Event { get; set; } = null!;
}
