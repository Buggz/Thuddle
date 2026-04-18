using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using SkiaSharp;

namespace Thuddle.Api.Services;

public sealed class AuctionImageStorage
{
    private const string ContainerName = "auction-images";
    private const int MaxDimension = 1920;
    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp"
    };
    private const long MaxFileSize = 10 * 1024 * 1024;

    private readonly BlobContainerClient _container;

    public AuctionImageStorage(BlobServiceClient blobServiceClient)
    {
        _container = blobServiceClient.GetBlobContainerClient(ContainerName);
    }

    public async Task<string> UploadAsync(Guid eventId, Guid itemId, Stream content, string contentType, CancellationToken ct = default)
    {
        if (!AllowedContentTypes.Contains(contentType))
            throw new ArgumentException("Unsupported image type.");

        if (content.Length > MaxFileSize)
            throw new ArgumentException("Image exceeds 10 MB limit.");

        await _container.CreateIfNotExistsAsync(PublicAccessType.Blob, cancellationToken: ct);

        using var ms = new MemoryStream();
        await content.CopyToAsync(ms, ct);
        var imageData = ms.ToArray();

        var outputData = ScaleAndEncode(imageData);
        var blobName = $"{eventId}/{itemId}/{Guid.NewGuid()}.jpg";
        var blob = _container.GetBlobClient(blobName);

        var headers = new BlobHttpHeaders { ContentType = "image/jpeg" };
        using var uploadStream = new MemoryStream(outputData);
        await blob.UploadAsync(uploadStream, new BlobUploadOptions { HttpHeaders = headers }, ct);

        return blob.Uri.ToString();
    }

    public async Task DeleteAsync(string blobUrl, CancellationToken ct = default)
    {
        var uri = new Uri(blobUrl);
        var blobName = uri.AbsolutePath.TrimStart('/');
        // Strip container name prefix
        var containerPrefix = $"{ContainerName}/";
        if (blobName.StartsWith(containerPrefix, StringComparison.OrdinalIgnoreCase))
            blobName = blobName[containerPrefix.Length..];

        var blob = _container.GetBlobClient(blobName);
        await blob.DeleteIfExistsAsync(cancellationToken: ct);
    }

    private static byte[] ScaleAndEncode(byte[] imageData)
    {
        using var original = SKBitmap.Decode(imageData)
            ?? throw new ArgumentException("Unable to decode image.");

        var needsScale = original.Width > MaxDimension || original.Height > MaxDimension;
        SKBitmap target;

        if (needsScale)
        {
            int newW, newH;
            if (original.Width >= original.Height)
            {
                newW = MaxDimension;
                newH = (int)Math.Round((double)original.Height * MaxDimension / original.Width);
            }
            else
            {
                newH = MaxDimension;
                newW = (int)Math.Round((double)original.Width * MaxDimension / original.Height);
            }

            target = original.Resize(new SKImageInfo(newW, newH), SKSamplingOptions.Default)
                ?? throw new InvalidOperationException("Unable to resize image.");
        }
        else
        {
            target = original;
        }

        try
        {
            using var image = SKImage.FromBitmap(target);
            using var data = image.Encode(SKEncodedImageFormat.Jpeg, 85);
            return data.ToArray();
        }
        finally
        {
            if (target != original) target.Dispose();
        }
    }
}
