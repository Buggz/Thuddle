namespace Thuddle.Api.Data;

public class AuctionItemImage
{
    public Guid Id { get; set; }
    public required Guid ItemId { get; set; }
    public required string BlobUrl { get; set; }
    public int SortOrder { get; set; }
    public DateTime UploadedAt { get; set; }

    public AuctionItem Item { get; set; } = null!;
}
