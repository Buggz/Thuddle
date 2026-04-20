namespace Thuddle.Api.Data;

public class BoardGame
{
    public int BggId { get; set; }
    public required string Name { get; set; }
    public int? YearPublished { get; set; }
    public int? BggRank { get; set; }
    public decimal? AverageRating { get; set; }
    public int UsersRated { get; set; }
    public bool IsExpansion { get; set; }
    public int? AbstractsRank { get; set; }
    public int? CgsRank { get; set; }
    public int? ChildrensGamesRank { get; set; }
    public int? FamilyGamesRank { get; set; }
    public int? PartyGamesRank { get; set; }
    public int? StrategyGamesRank { get; set; }
    public int? ThematicRank { get; set; }
    public int? WarGamesRank { get; set; }
    public string? ThumbnailUrl { get; set; }
    public string? ImageUrl { get; set; }
    public DateTime? LastDetailFetch { get; set; }
    public DateTime ImportedAt { get; set; }
}
