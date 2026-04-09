namespace Thuddle.Api.Data;

public enum EventVisibility { Public, Unlisted }
public enum JoinMode { Open, InviteOnly }

public class Event
{
    public Guid Id { get; set; }
    public required Guid OwnerId { get; set; }
    public required string Title { get; set; }
    public required string Description { get; set; }
    public string? PicturePath { get; set; }
    public required DateTime Start { get; set; }
    public required DateTime End { get; set; }
    public required EventVisibility Visibility { get; set; }
    public required JoinMode JoinMode { get; set; }
    public int? Capacity { get; set; }
    public decimal? Cost { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public User Owner { get; set; } = null!;
}
