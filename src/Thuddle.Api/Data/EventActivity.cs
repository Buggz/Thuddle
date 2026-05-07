namespace Thuddle.Api.Data;

public class EventActivity
{
    public Guid Id { get; set; }
    public required Guid EventId { get; set; }
    public required string Title { get; set; }
    public string? Description { get; set; }   // rich HTML, nullable
    public required DateTime StartsAt { get; set; }
    public DateTime? EndsAt { get; set; }
    public required int MaxParticipants { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public required Guid CreatedByUserId { get; set; }

    public Event Event { get; set; } = null!;
    public ICollection<EventActivityParticipant> Participants { get; set; } = [];
}
