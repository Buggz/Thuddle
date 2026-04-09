using SkiaSharp;

namespace Thuddle.Api.Services;

public class ImageScaler
{
    private readonly int _targetSize;

    public ImageScaler(IConfiguration configuration)
    {
        _targetSize = configuration.GetValue<int>("ProfilePicture:Size");
    }

    /// <summary>
    /// Scales the image to a square of the configured target size.
    /// Returns the scaled image as a PNG byte array.
    /// </summary>
    public byte[] Scale(byte[] imageData)
    {
        using var original = SKBitmap.Decode(imageData)
            ?? throw new InvalidOperationException("Unable to decode image.");

        using var scaled = original.Resize(new SKImageInfo(_targetSize, _targetSize), SKSamplingOptions.Default)
            ?? throw new InvalidOperationException("Unable to resize image.");

        using var image = SKImage.FromBitmap(scaled);
        using var data = image.Encode(SKEncodedImageFormat.Png, 90);

        return data.ToArray();
    }
}
