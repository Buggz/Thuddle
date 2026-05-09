namespace Thuddle.Api.Data;

public class EventActivityParticipant
{
    public Guid Id { get; set; }
    public required Guid EventActivityId { get; set; }
    public required Guid UserId { get; set; }
    public DateTime SignedUpAt { get; set; }

    public EventActivity Activity { get; set; } = null!;
    public User User { get; set; } = null!;
}
