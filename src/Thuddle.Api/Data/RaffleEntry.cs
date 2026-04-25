namespace Thuddle.Api.Data;

public class RaffleEntry
{
    public Guid Id { get; set; }
    public required Guid RaffleId { get; set; }
    public required Guid UserId { get; set; }
    public int Tickets { get; set; }

    public Raffle Raffle { get; set; } = null!;
    public User User { get; set; } = null!;
}
