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

    /// <summary>
    /// Uploads the original and scaled profile pictures for a user.
    /// Returns the blob path prefix (e.g. "userId") used for both files.
    /// </summary>
    public async Task<string> UploadAsync(string userId, byte[] original, byte[] scaled, CancellationToken ct = default)
    {
        await _container.CreateIfNotExistsAsync(PublicAccessType.None, cancellationToken: ct);

        var originalBlob = _container.GetBlobClient($"{userId}/original.png");
        var scaledBlob = _container.GetBlobClient($"{userId}/profile.png");

        var headers = new BlobHttpHeaders { ContentType = "image/png" };
        var uploadOptions = new BlobUploadOptions { HttpHeaders = headers, Conditions = null };

        await Task.WhenAll(
            originalBlob.UploadAsync(new BinaryData(original), uploadOptions, ct),
            scaledBlob.UploadAsync(new BinaryData(scaled), uploadOptions, ct)
        );

        return userId;
    }

    /// <summary>
    /// Gets the URI of the scaled profile picture for a user.
    /// </summary>
    public Uri? GetProfilePictureUri(string userId)
    {
        var blob = _container.GetBlobClient($"{userId}/profile.png");
        return blob.Uri;
    }
}
