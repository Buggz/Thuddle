namespace Thuddle.Api.Data;

public class DiscussionComment
{
    public Guid Id { get; set; }
    public required Guid PostId { get; set; }
    public required Guid AuthorId { get; set; }
    public required string Content { get; set; }
    public DateTime CreatedAt { get; set; }

    public DiscussionPost Post { get; set; } = null!;
    public User Author { get; set; } = null!;
}
