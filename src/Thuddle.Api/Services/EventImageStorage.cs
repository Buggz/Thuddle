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

        using var ms = new MemoryStream();
        await content.CopyToAsync(ms, ct);
        var imageData = ms.ToArray();

        var outputData = ScaleAndEncode(imageData);
        var blobName = $"{eventId}/{Guid.NewGuid()}.jpg";
        var blob = _container.GetBlobClient(blobName);

        var headers = new BlobHttpHeaders { ContentType = "image/jpeg" };
        using var uploadStream = new MemoryStream(outputData);
        await blob.UploadAsync(uploadStream, new BlobUploadOptions { HttpHeaders = headers }, ct);

        return blob.Uri.ToString();
    }

    public async Task<string> UploadEventPictureAsync(Guid eventId, byte[] imageData, CancellationToken ct = default)
    {
        await _container.CreateIfNotExistsAsync(PublicAccessType.Blob, cancellationToken: ct);

        var outputData = ScaleAndEncode(imageData);
        var blobName = $"{eventId}/picture.jpg";
        var blob = _container.GetBlobClient(blobName);

        await blob.UploadAsync(
            new BinaryData(outputData),
            overwrite: true,
            cancellationToken: ct);

        await blob.SetHttpHeadersAsync(
            new BlobHttpHeaders { ContentType = "image/jpeg" },
            cancellationToken: ct);

        return blob.Uri.ToString();
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
            using var encoded = image.Encode(SKEncodedImageFormat.Jpeg, 85);
            return encoded.ToArray();
        }
        finally
        {
            if (needsScale) target.Dispose();
        }
    }
}
