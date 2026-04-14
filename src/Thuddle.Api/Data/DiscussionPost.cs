namespace Thuddle.Api.Data;

public class DiscussionPost
{
    public Guid Id { get; set; }
    public required Guid EventId { get; set; }
    public required Guid AuthorId { get; set; }
    public required string Content { get; set; }
    public bool IsApproved { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Event Event { get; set; } = null!;
    public User Author { get; set; } = null!;
}
