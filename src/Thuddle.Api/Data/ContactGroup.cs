namespace Thuddle.Api.Data;

public class ContactGroup
{
    public Guid Id { get; set; }
    public required Guid OwnerId { get; set; }
    public required string Name { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public User Owner { get; set; } = null!;
}
