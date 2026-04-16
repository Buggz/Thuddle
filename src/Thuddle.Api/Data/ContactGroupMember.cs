namespace Thuddle.Api.Data;

public class ContactGroupMember
{
    public Guid Id { get; set; }
    public required Guid GroupId { get; set; }
    public required Guid UserId { get; set; }
    public DateTime AddedAt { get; set; }

    public ContactGroup Group { get; set; } = null!;
    public User User { get; set; } = null!;
}
