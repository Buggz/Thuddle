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
        TextSize = 74,
        Typeface = SKTypeface.Default,
        FakeBoldText = true
    };

    using var subtitlePaint = new SKPaint
    {
        Color = new SKColor(255, 255, 255, 220),
        IsAntialias = true,
        TextSize = 30,
        Typeface = SKTypeface.Default
    };

    var lines = WrapLines(name, titlePaint, width - 180, 3);
    var lineHeight = titlePaint.TextSize * 1.15f;
    var totalHeight = (lines.Count * lineHeight) + subtitlePaint.TextSize + 18;
    var y = (height - totalHeight) / 2f + titlePaint.TextSize;

    foreach (var line in lines)
    {
        canvas.DrawText(line, 90, y, titlePaint);
        y += lineHeight;
    }

    canvas.DrawText($"Fake BGG #{bggId}", 94, y + 24, subtitlePaint);

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

static List<string> WrapLines(string text, SKPaint paint, int maxWidth, int maxLines)
{
    var words = text.Split(' ', StringSplitOptions.RemoveEmptyEntries);
    if (words.Length == 0)
        return [string.Empty];

    var lines = new List<string>();
    var currentLine = new StringBuilder();

    foreach (var word in words)
    {
        var candidate = currentLine.Length == 0
            ? word
            : $"{currentLine} {word}";

        if (paint.MeasureText(candidate) <= maxWidth)
        {
            currentLine.Clear();
            currentLine.Append(candidate);
            continue;
        }

        if (currentLine.Length > 0)
            lines.Add(currentLine.ToString());

        currentLine.Clear();
        currentLine.Append(word);

        if (lines.Count == maxLines - 1)
            break;
    }

    if (lines.Count < maxLines && currentLine.Length > 0)
        lines.Add(currentLine.ToString());

    if (lines.Count == 0)
        lines.Add(text);

    if (lines.Count > maxLines)
        lines = lines.Take(maxLines).ToList();

    if (lines.Count == maxLines && lines[^1] != text)
    {
        while (paint.MeasureText($"{lines[^1]}...") > maxWidth && lines[^1].Length > 1)
            lines[^1] = lines[^1][..^1];

        lines[^1] = $"{lines[^1]}...";
    }

    return lines;
}
