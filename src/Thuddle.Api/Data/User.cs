namespace Thuddle.Api.Data;

public class User
{
    public Guid Id { get; set; }
    public required string KeycloakId { get; set; }
    public required string Email { get; set; }
    public string? DisplayName { get; set; }
    public string? OriginalPicturePath { get; set; }
    public string? ScaledPicturePath { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
