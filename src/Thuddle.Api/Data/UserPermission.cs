namespace Thuddle.Api.Data;

public class UserPermission
{
    public Guid Id { get; set; }
    public required Guid UserId { get; set; }
    public required string Permission { get; set; }
    public DateTime GrantedAt { get; set; }

    public User User { get; set; } = null!;
}
