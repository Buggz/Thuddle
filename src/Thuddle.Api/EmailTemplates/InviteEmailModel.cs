namespace Thuddle.Api.EmailTemplates;

public class InviteEmailModel
{
    public required string EventTitle { get; set; }
    public required string Start { get; set; }
    public required string End { get; set; }
    public required string Location { get; set; }
    public required string JoinUrl { get; set; }
}
