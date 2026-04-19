namespace Thuddle.Api.Data;

public class AuctionItemBoardGame
{
    public Guid Id { get; set; }
    public required Guid ItemId { get; set; }
    public required int BggId { get; set; }
    public int SortOrder { get; set; }
    public DateTime AddedAt { get; set; }

    public AuctionItem Item { get; set; } = null!;
    public BoardGame BoardGame { get; set; } = null!;
}
