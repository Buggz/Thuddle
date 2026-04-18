namespace Thuddle.Api.Data;

public enum EventVisibility { Public, Unlisted }
public enum JoinMode { Open, InviteOnly }

/// <summary>
/// Controls whether posts/comments from non-hosts require approval before being visible.
/// </summary>
public enum ModerationPolicy { RequireApproval, AutoApprove }

public class Event
{
    public Guid Id { get; set; }
    public required Guid OwnerId { get; set; }
    public required string Title { get; set; }
    public required string Location { get; set; }
    public string? Description { get; set; }
    public string? PicturePath { get; set; }
    public required DateTime Start { get; set; }
    public required DateTime End { get; set; }
    public required EventVisibility Visibility { get; set; }
    public required JoinMode JoinMode { get; set; }
    public int? Capacity { get; set; }
    public decimal? Cost { get; set; }
    public string Currency { get; set; } = "EUR";
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Discussion settings
    public ModerationPolicy MemberPostPolicy { get; set; } = ModerationPolicy.AutoApprove;
    public ModerationPolicy NonMemberPostPolicy { get; set; } = ModerationPolicy.RequireApproval;
    public bool AllowNonMemberPosts { get; set; }
    public bool AllowNonMemberComments { get; set; }

    public User Owner { get; set; } = null!;
}
