using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace Thuddle.Api.Services;

public sealed class EventImageStorage
{
    private const string ContainerName = "event-images";
    private static readonly HashSet<string> AllowedContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp"
    };
    private const long MaxFileSize = 5 * 1024 * 1024; // 5 MB

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
            throw new ArgumentException("Image exceeds 5 MB limit.");

        await _container.CreateIfNotExistsAsync(PublicAccessType.Blob, cancellationToken: ct);

        var extension = contentType switch
        {
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/gif" => ".gif",
            "image/webp" => ".webp",
            _ => ".bin"
        };

        var blobName = $"{eventId}/{Guid.NewGuid()}{extension}";
        var blob = _container.GetBlobClient(blobName);

        var headers = new BlobHttpHeaders { ContentType = contentType };
        await blob.UploadAsync(content, new BlobUploadOptions { HttpHeaders = headers }, ct);

        return blob.Uri.ToString();
    }
}
