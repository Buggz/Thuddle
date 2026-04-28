using System.Security.Cryptography;
using System.Text;
using System.Xml.Linq;
using Microsoft.EntityFrameworkCore;
using SkiaSharp;
using Thuddle.Api.Data;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();
builder.AddNpgsqlDbContext<ThuddleDbContext>("thuddledb");

var app = builder.Build();

app.MapDefaultEndpoints();

app.MapGet("/xmlapi2/thing", async Task<IResult> (
    int id,
    ThuddleDbContext db,
    HttpRequest request,
    CancellationToken ct) =>
{
    var game = await db.BoardGames
        .AsNoTracking()
        .FirstOrDefaultAsync(boardGame => boardGame.BggId == id, ct);

    if (game is null)
        return Results.NotFound();

    var minPlayers = game.MinPlayers ?? DeriveMinPlayers(game);
    var maxPlayers = game.MaxPlayers ?? DeriveMaxPlayers(game, minPlayers);
    var minPlayTime = game.MinPlayTime ?? DeriveMinPlayTime(game);
    var maxPlayTime = game.MaxPlayTime ?? DeriveMaxPlayTime(game, minPlayTime);
    var imageUrl = BuildAbsoluteUrl(request, $"/images/{game.BggId}.jpg");

    var document = new XDocument(
        new XElement("items",
            new XAttribute("termsofuse", "https://boardgamegeek.com/xmlapi/termsofuse"),
            new XElement("item",
                new XAttribute("type", game.IsExpansion ? "boardgameexpansion" : "boardgame"),
                new XAttribute("id", game.BggId),
                new XElement("description", game.Description ?? GenerateDescription(game, minPlayers, maxPlayers, minPlayTime, maxPlayTime)),
                new XElement("thumbnail", imageUrl),
                new XElement("image", imageUrl),
                new XElement("minplayers", new XAttribute("value", minPlayers)),
                new XElement("maxplayers", new XAttribute("value", maxPlayers)),
                new XElement("minplaytime", new XAttribute("value", minPlayTime)),
                new XElement("maxplaytime", new XAttribute("value", maxPlayTime)))));

    return Results.Text(document.ToString(SaveOptions.DisableFormatting), "application/xml", Encoding.UTF8);
});

app.MapGet("/images/{bggId:int}.jpg", async Task<IResult> (
    int bggId,
    ThuddleDbContext db,
    CancellationToken ct) =>
{
    var game = await db.BoardGames
        .AsNoTracking()
        .Select(boardGame => new { boardGame.BggId, boardGame.Name })
        .FirstOrDefaultAsync(boardGame => boardGame.BggId == bggId, ct);

    if (game is null)
        return Results.NotFound();

    return Results.File(CreatePlaceholderImage(game.BggId, game.Name), "image/jpeg");
});

app.Run();

static string BuildAbsoluteUrl(HttpRequest request, string path) =>
    $"{request.Scheme}://{request.Host}{path}";

static string GenerateDescription(BoardGame game, int minPlayers, int maxPlayers, int minPlayTime, int maxPlayTime)
{
    var year = game.YearPublished is { } publishedYear ? $" from {publishedYear}" : string.Empty;
    var rank = game.BggRank is { } bggRank ? $" It currently sits around BGG rank #{bggRank}." : string.Empty;
    return $"{game.Name}{year} is using a local fake BGG detail payload for development and E2E. Expect {minPlayers}-{maxPlayers} players and roughly {minPlayTime}-{maxPlayTime} minutes of play.{rank}";
}

static int DeriveMinPlayers(BoardGame game) => 1 + GetDeterministicValue(game, 0, 4);

static int DeriveMaxPlayers(BoardGame game, int minPlayers) => minPlayers + 1 + GetDeterministicValue(game, 1, 5);

static int DeriveMinPlayTime(BoardGame game) => 15 + (GetDeterministicValue(game, 2, 10) * 5);

static int DeriveMaxPlayTime(BoardGame game, int minPlayTime) => minPlayTime + 15 + (GetDeterministicValue(game, 3, 19) * 5);

static int GetDeterministicValue(BoardGame game, int salt, int modulo)
{
    var hash = SHA256.HashData(Encoding.UTF8.GetBytes($"{game.BggId}:{game.Name}:{salt}"));
    return hash[0] % modulo;
}

static byte[] CreatePlaceholderImage(int bggId, string name)
{
    const int width = 1200;
    const int height = 630;
    const float defaultTitleSize = 74f;
    const float minTitleSize = 20f;
    const float safeContentWidth = width - 120f;
    const float subtitleSpacing = 24f;

    using var surface = SKSurface.Create(new SKImageInfo(width, height));
    var canvas = surface.Canvas;
    canvas.Clear(GetBackgroundColor(bggId, name));

    using var accentPaint = new SKPaint
    {
        Color = GetAccentColor(bggId, name),
        IsAntialias = true,
        Style = SKPaintStyle.Fill
    };

    canvas.DrawCircle(width * 0.82f, height * 0.22f, 180, accentPaint);
    canvas.DrawCircle(width * 0.12f, height * 0.85f, 220, accentPaint);

    using var titlePaint = new SKPaint
    {
        Color = SKColors.White,
        IsAntialias = true,
    };

    using var titleFont = new SKFont
    {
        Size = defaultTitleSize,
        Typeface = SKTypeface.Default,
        Embolden = true,
    };

    using var subtitlePaint = new SKPaint
    {
        Color = new SKColor(255, 255, 255, 220),
        IsAntialias = true,
    };

    using var subtitleFont = new SKFont
    {
        Size = 30,
        Typeface = SKTypeface.Default,
    };

    var lines = name
        .Split(' ', StringSplitOptions.RemoveEmptyEntries)
        .ToList();

    if (lines.Count == 0)
    {
        lines.Add(string.IsNullOrWhiteSpace(name) ? "Unknown Game" : name);
    }

    while (titleFont.Size > minTitleSize)
    {
        var widestLine = lines.Max(line => titleFont.MeasureText(line));
        if (widestLine <= safeContentWidth)
            break;

        titleFont.Size -= 2f;
    }

    var lineHeight = titleFont.Size * 1.15f;
    var totalHeight = (lines.Count * lineHeight) + subtitleSpacing + subtitleFont.Size;
    var y = (height - totalHeight) / 2f + titleFont.Size;

    foreach (var line in lines)
    {
        var lineWidth = titleFont.MeasureText(line);
        var x = (width - lineWidth) / 2f;
        canvas.DrawText(line, x, y, titleFont, titlePaint);
        y += lineHeight;
    }

    var subtitle = $"Fake BGG #{bggId}";
    var subtitleWidth = subtitleFont.MeasureText(subtitle);
    var subtitleX = (width - subtitleWidth) / 2f;
    canvas.DrawText(subtitle, subtitleX, y + subtitleSpacing, subtitleFont, subtitlePaint);

    using var image = surface.Snapshot();
    using var data = image.Encode(SKEncodedImageFormat.Jpeg, 88);
    return data.ToArray();
}

static SKColor GetBackgroundColor(int bggId, string name)
{
    var hash = SHA256.HashData(Encoding.UTF8.GetBytes($"bg:{bggId}:{name}"));
    return new SKColor((byte)(40 + (hash[0] % 120)), (byte)(35 + (hash[1] % 120)), (byte)(60 + (hash[2] % 120)));
}

static SKColor GetAccentColor(int bggId, string name)
{
    var hash = SHA256.HashData(Encoding.UTF8.GetBytes($"accent:{bggId}:{name}"));
    return new SKColor((byte)(120 + (hash[0] % 100)), (byte)(100 + (hash[1] % 120)), (byte)(80 + (hash[2] % 120)), 110);
}
