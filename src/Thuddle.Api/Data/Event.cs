namespace Thuddle.Api.Data;

public class Event
{
    public Guid Id { get; set; }
    public required Guid OwnerId { get; set; }
    public required string Title { get; set; }
    public required string Description { get; set; }
    public string? PicturePath { get; set; }
    public required DateTime Start { get; set; }
    public required DateTime End { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public User Owner { get; set; } = null!;
}
