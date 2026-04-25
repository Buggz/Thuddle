namespace Thuddle.Api.Data;

public enum RaffleStatus { Open = 0, Drawing = 1 }

public class Raffle
{
    public Guid Id { get; set; }
    public required Guid EventId { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public decimal? PricePerTicket { get; set; }
    public bool SelfReportingEnabled { get; set; }
    public RaffleStatus Status { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? DeletedAt { get; set; }

    public Event Event { get; set; } = null!;
    public ICollection<RaffleEntry> Entries { get; set; } = [];
    public ICollection<RaffleDraw> Draws { get; set; } = [];
}
