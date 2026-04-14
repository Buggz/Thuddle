using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using SkiaSharp;

namespace Thuddle.Api.Services;

public sealed class EventImageStorage
{
    private const string ContainerName = "event-images";
    private const int MaxDimension = 1920;
    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp"
    };
    private const long MaxFileSize = 10 * 1024 * 1024; // 10 MB (pre-scaling)

    private readonly BlobContainerClient _container;

    public EventImageStorage(BlobServiceClient blobServiceClient)
    {
        _container = blobServiceClient.GetBlobContainerClient(ContainerName);
    }

    public async Task<string> UploadAsync(Guid eventId, Stream content, string contentType, CancellationToken ct = default)
    {
        if (!AllowedContentTypes.Contains(contentType))
            throw new ArgumentException("Unsupported image type.");

        if (content.Length > MaxFileSize)
            throw new ArgumentException("Image exceeds 10 MB limit.");

        await _container.CreateIfNotExistsAsync(PublicAccessType.Blob, cancellationToken: ct);

        var blobName = $"{eventId}/{Guid.NewGuid()}.jpg";
        var blob = _container.GetBlobClient(blobName);

        using var ms = new MemoryStream();
        await content.CopyToAsync(ms, ct);
        var imageData = ms.ToArray();

        var scaled = ScaleIfNeeded(imageData);
        var headers = new BlobHttpHeaders { ContentType = "image/jpeg" };
        using var uploadStream = new MemoryStream(scaled);
        await blob.UploadAsync(uploadStream, new BlobUploadOptions { HttpHeaders = headers }, ct);

        return blob.Uri.ToString();
    }

    private static byte[] ScaleIfNeeded(byte[] imageData)
    {
        using var original = SKBitmap.Decode(imageData)
            ?? throw new ArgumentException("Unable to decode image.");

        if (original.Width <= MaxDimension && original.Height <= MaxDimension)
        {
            using var img = SKImage.FromBitmap(original);
            using var data = img.Encode(SKEncodedImageFormat.Jpeg, 85);
            return data.ToArray();
        }

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

        using var scaled = original.Resize(new SKImageInfo(newW, newH), SKSamplingOptions.Default)
            ?? throw new InvalidOperationException("Unable to resize image.");

        using var image = SKImage.FromBitmap(scaled);
        using var encoded = image.Encode(SKEncodedImageFormat.Jpeg, 85);
        return encoded.ToArray();
    }
}
