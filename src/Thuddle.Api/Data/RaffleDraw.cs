namespace Thuddle.Api.Data;

public class RaffleDraw
{
    public Guid Id { get; set; }
    public required Guid RaffleId { get; set; }
    public required Guid WinnerUserId { get; set; }
    public DateTime DrawnAt { get; set; }
    public int TicketsBefore { get; set; }
    public int TicketsAfter { get; set; }

    public Raffle Raffle { get; set; } = null!;
    public User Winner { get; set; } = null!;
}
