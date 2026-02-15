using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace Thuddle.Api.Services;

public class ProfilePictureStorage
{
    private const string ContainerName = "profile-pictures";
    private readonly BlobContainerClient _container;

    public ProfilePictureStorage(BlobServiceClient blobServiceClient)
    {
        _container = blobServiceClient.GetBlobContainerClient(ContainerName);
    }

    public async Task<(string originalPath, string scaledPath)> UploadAsync(
        string userId, byte[] original, byte[] scaled, CancellationToken ct = default)
    {
        await _container.CreateIfNotExistsAsync(PublicAccessType.None, cancellationToken: ct);

        var originalPath = $"{userId}/original.png";
        var scaledPath = $"{userId}/profile.png";

        var headers = new BlobHttpHeaders { ContentType = "image/png" };
        var uploadOptions = new BlobUploadOptions { HttpHeaders = headers, Conditions = null };

        await Task.WhenAll(
            _container.GetBlobClient(originalPath).UploadAsync(new BinaryData(original), uploadOptions, ct),
            _container.GetBlobClient(scaledPath).UploadAsync(new BinaryData(scaled), uploadOptions, ct)
        );

        return (originalPath, scaledPath);
    }

    public async Task<byte[]?> DownloadScaledAsync(string scaledPath, CancellationToken ct = default)
    {
        var blob = _container.GetBlobClient(scaledPath);

        if (!await blob.ExistsAsync(ct))
            return null;

        var response = await blob.DownloadContentAsync(ct);
        return response.Value.Content.ToArray();
    }
}
