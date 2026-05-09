namespace Thuddle.Api.Data;

public class EventFeature
{
    public Guid Id { get; set; }
    public required Guid EventId { get; set; }
    public required string FeatureKey { get; set; }
    public DateTime EnabledAt { get; set; }
    public required Guid EnabledByUserId { get; set; }

    public Event Event { get; set; } = null!;
}
