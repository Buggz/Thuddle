using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace Thuddle.Api.Services;

public sealed class ActivityDescriptionImageStorage
{
    private const string ContainerName = "activity-images";
    private static readonly Dictionary<string, string> ContentTypeToExtension = new(StringComparer.OrdinalIgnoreCase)
    {
        ["image/jpeg"] = "jpg",
        ["image/png"] = "png",
        ["image/gif"] = "gif",
        ["image/webp"] = "webp"
    };
    private const long MaxFileSize = 10 * 1024 * 1024; // matches auction image limit

    private readonly BlobContainerClient _container;

    public ActivityDescriptionImageStorage(BlobServiceClient blobServiceClient)
    {
        _container = blobServiceClient.GetBlobContainerClient(ContainerName);
    }

    public async Task<string> UploadAsync(Guid eventId, Stream content, string contentType, CancellationToken ct = default)
    {
        if (!ContentTypeToExtension.TryGetValue(contentType, out var ext))
            throw new ArgumentException("Unsupported image type.");

        if (content.Length > MaxFileSize)
            throw new ArgumentException("Image exceeds 10 MB limit.");

        await _container.CreateIfNotExistsAsync(PublicAccessType.Blob, cancellationToken: ct);

        var blobName = $"events/{eventId}/activities/descriptions/{Guid.NewGuid()}.{ext}";
        var blob = _container.GetBlobClient(blobName);

        var headers = new BlobHttpHeaders { ContentType = contentType };
        await blob.UploadAsync(content, new BlobUploadOptions { HttpHeaders = headers }, ct);

        return blob.Uri.ToString();
    }
}
