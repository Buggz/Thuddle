using System.Xml.Linq;
using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;

namespace Thuddle.Api.Endpoints;

public static class BoardGameEndpoints
{
    public static void MapBoardGameEndpoints(this WebApplication app)
    {
        app.MapPost("/api/admin/boardgames/import", ImportCsv)
            .RequireAuthorization("admin:access")
            .DisableAntiforgery();

        app.MapGet("/api/boardgames/search", Search).AllowAnonymous();

        app.MapGet("/api/boardgames/{bggId:int}", GetDetail).RequireAuthorization();

        app.MapGet("/api/admin/boardgames/stats", GetStats)
            .RequireAuthorization("admin:access");
    }

    // ─── CSV Import ──────────────────────────────────────────────

    private static async Task<IResult> ImportCsv(
        IFormFile file,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return Results.BadRequest(new { error = "No file uploaded." });

        var rows = new List<BoardGame>();
        using var reader = new StreamReader(file.OpenReadStream());

        // Skip header
        var header = await reader.ReadLineAsync(ct);
        if (header is null)
            return Results.BadRequest(new { error = "Empty CSV file." });

        while (await reader.ReadLineAsync(ct) is { } line)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;

            var fields = ParseCsvLine(line);
            if (fields.Count < 7) continue;

            if (!int.TryParse(fields[0], out var bggId)) continue;

            var name = fields[1].Trim();
            if (string.IsNullOrWhiteSpace(name)) continue;

            int.TryParse(fields[2], out var yearPublished);
            int? rank = int.TryParse(fields[3], out var r) && r > 0 ? r : null;
            decimal.TryParse(fields[4], System.Globalization.CultureInfo.InvariantCulture, out var bayesAvg);
            decimal.TryParse(fields[5], System.Globalization.CultureInfo.InvariantCulture, out var avg);
            int.TryParse(fields[6], out var usersRated);
            bool isExpansion = fields.Count > 7 && fields[7] == "1";

            rows.Add(new BoardGame
            {
                BggId = bggId,
                Name = name,
                YearPublished = yearPublished > 0 ? yearPublished : null,
                BggRank = rank,
                AverageRating = avg > 0 ? avg : bayesAvg > 0 ? bayesAvg : null,
                UsersRated = usersRated,
                IsExpansion = isExpansion,
                AbstractsRank = ParseOptionalRank(fields, 8),
                CgsRank = ParseOptionalRank(fields, 9),
                ChildrensGamesRank = ParseOptionalRank(fields, 10),
                FamilyGamesRank = ParseOptionalRank(fields, 11),
                PartyGamesRank = ParseOptionalRank(fields, 12),
                StrategyGamesRank = ParseOptionalRank(fields, 13),
                ThematicRank = ParseOptionalRank(fields, 14),
                WarGamesRank = ParseOptionalRank(fields, 15),
                ImportedAt = DateTime.UtcNow
            });
        }

        if (rows.Count == 0)
            return Results.BadRequest(new { error = "No valid rows found in CSV." });

        // Load existing IDs for upsert logic
        var existingIds = (await db.BoardGames
            .Select(b => b.BggId)
            .ToListAsync(ct))
            .ToHashSet();

        int imported = 0, updated = 0, skipped = 0;
        var batch = 0;

        foreach (var row in rows)
        {
            if (existingIds.Contains(row.BggId))
            {
                db.BoardGames.Update(row);
                updated++;
            }
            else
            {
                db.BoardGames.Add(row);
                imported++;
            }

            batch++;
            if (batch >= 500)
            {
                await db.SaveChangesAsync(ct);
                batch = 0;
            }
        }

        if (batch > 0)
            await db.SaveChangesAsync(ct);

        return Results.Ok(new { imported, updated, skipped });
    }

    private static int? ParseOptionalRank(List<string> fields, int index) =>
        fields.Count > index && int.TryParse(fields[index], out var v) && v > 0 ? v : null;

    private static List<string> ParseCsvLine(string line)
    {
        var fields = new List<string>();
        var i = 0;
        while (i < line.Length)
        {
            if (line[i] == '"')
            {
                // Quoted field
                i++; // skip opening quote
                var start = i;
                while (i < line.Length)
                {
                    if (line[i] == '"')
                    {
                        if (i + 1 < line.Length && line[i + 1] == '"')
                        {
                            i += 2; // escaped quote
                        }
                        else
                        {
                            break;
                        }
                    }
                    else
                    {
                        i++;
                    }
                }
                fields.Add(line[start..i].Replace("\"\"", "\""));
                if (i < line.Length) i++; // skip closing quote
                if (i < line.Length && line[i] == ',') i++; // skip comma
            }
            else
            {
                var start = i;
                while (i < line.Length && line[i] != ',') i++;
                fields.Add(line[start..i]);
                if (i < line.Length) i++; // skip comma
            }
        }
        return fields;
    }

    // ─── Trigram Search ──────────────────────────────────────────

    private static async Task<IResult> Search(
        string? q,
        int? limit,
        bool? includeExpansions,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
            return Results.Ok(Array.Empty<object>());

        var take = Math.Clamp(limit ?? 10, 1, 50);
        var includeExp = includeExpansions ?? false;

        var expansionFilter = includeExp ? "" : """AND "IsExpansion" = false""";

        var sql = $$"""
            SELECT "BggId", "Name", "YearPublished", "BggRank", "AverageRating",
                   "UsersRated", "ThumbnailUrl", "IsExpansion",
                   "AbstractsRank", "CgsRank", "ChildrensGamesRank", "FamilyGamesRank",
                   "PartyGamesRank", "StrategyGamesRank", "ThematicRank", "WarGamesRank"
            FROM "BoardGames"
            WHERE "Name" % {0} {{expansionFilter}}
            ORDER BY similarity("Name", {0}) DESC, "BggRank" ASC NULLS LAST
            LIMIT {{take}}
            """;

        var results = await db.Database
            .SqlQueryRaw<BoardGameSearchResult>(sql, q)
            .ToListAsync(ct);

        return Results.Ok(results);
    }

    // ─── Detail with BGG XML API Caching ─────────────────────────

    private static async Task<IResult> GetDetail(
        int bggId,
        ThuddleDbContext db,
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        CancellationToken ct)
    {
        var game = await db.BoardGames.AsTracking()
            .FirstOrDefaultAsync(b => b.BggId == bggId, ct);

        if (game is null)
            return Results.NotFound(new { error = "Board game not found." });

        if (!HasHydratedDetails(game))
        {
            try
            {
                var client = httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(5);

                var response = await client.GetAsync(GetThingUri(configuration, bggId), ct);
                response.EnsureSuccessStatusCode();

                var xml = await response.Content.ReadAsStringAsync(ct);

                var doc = XDocument.Parse(xml);
                var item = doc.Root?.Element("item");

                if (item is not null)
                {
                    game.Description = item.Element("description")?.Value;
                    game.ThumbnailUrl = item.Element("thumbnail")?.Value;
                    game.ImageUrl = item.Element("image")?.Value;

                    game.MinPlayers = ParseOptionalInt(item.Element("minplayers")?.Attribute("value")?.Value);
                    game.MaxPlayers = ParseOptionalInt(item.Element("maxplayers")?.Attribute("value")?.Value);
                    game.MinPlayTime = ParseOptionalInt(item.Element("minplaytime")?.Attribute("value")?.Value);
                    game.MaxPlayTime = ParseOptionalInt(item.Element("maxplaytime")?.Attribute("value")?.Value);

                    game.LastDetailFetch = DateTime.UtcNow;
                    await db.SaveChangesAsync(ct);
                }
            }
            catch
            {
                // BGG API failed — return cached data anyway. Treatment is symptomatic.
            }
        }

        return Results.Ok(new
        {
            game.BggId,
            game.Name,
            game.YearPublished,
            description = game.Description,
            thumbnailUrl = game.ThumbnailUrl,
            imageUrl = game.ImageUrl,
            minPlayers = game.MinPlayers,
            maxPlayers = game.MaxPlayers,
            minPlayTime = game.MinPlayTime,
            maxPlayTime = game.MaxPlayTime,
            averageRating = game.AverageRating,
            bggRank = game.BggRank,
            usersRated = game.UsersRated,
            abstractsRank = game.AbstractsRank,
            cgsRank = game.CgsRank,
            childrensGamesRank = game.ChildrensGamesRank,
            familyGamesRank = game.FamilyGamesRank,
            partyGamesRank = game.PartyGamesRank,
            strategyGamesRank = game.StrategyGamesRank,
            thematicRank = game.ThematicRank,
            warGamesRank = game.WarGamesRank
        });
    }

    private static bool HasHydratedDetails(BoardGame game) =>
        game.LastDetailFetch is not null
        && !string.IsNullOrWhiteSpace(game.Description)
        && game.MinPlayers.HasValue
        && game.MaxPlayers.HasValue
        && game.MinPlayTime.HasValue
        && game.MaxPlayTime.HasValue
        && !string.IsNullOrWhiteSpace(game.ThumbnailUrl)
        && !string.IsNullOrWhiteSpace(game.ImageUrl);

    private static string GetThingUri(IConfiguration configuration, int bggId)
    {
        var baseUrl = configuration["Bgg:BaseUrl"]?.TrimEnd('/') ?? "https://boardgamegeek.com";
        return $"{baseUrl}/xmlapi2/thing?id={bggId}&stats=1";
    }

    private static int? ParseOptionalInt(string? value) =>
        int.TryParse(value, out var parsed) ? parsed : null;

    // ─── Stats ───────────────────────────────────────────────────

    private static async Task<IResult> GetStats(
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var totalGames = await db.BoardGames.CountAsync(b => !b.IsExpansion, ct);
        var totalExpansions = await db.BoardGames.CountAsync(b => b.IsExpansion, ct);
        var lastImportedAt = await db.BoardGames
            .OrderByDescending(b => b.ImportedAt)
            .Select(b => (DateTime?)b.ImportedAt)
            .FirstOrDefaultAsync(ct);

        return Results.Ok(new { totalGames, totalExpansions, lastImportedAt });
    }
}

// Projection type for trigram search raw SQL
internal sealed class BoardGameSearchResult
{
    public int BggId { get; set; }
    public string Name { get; set; } = "";
    public int? YearPublished { get; set; }
    public int? BggRank { get; set; }
    public decimal? AverageRating { get; set; }
    public int UsersRated { get; set; }
    public string? ThumbnailUrl { get; set; }
    public bool IsExpansion { get; set; }
    public int? AbstractsRank { get; set; }
    public int? CgsRank { get; set; }
    public int? ChildrensGamesRank { get; set; }
    public int? FamilyGamesRank { get; set; }
    public int? PartyGamesRank { get; set; }
    public int? StrategyGamesRank { get; set; }
    public int? ThematicRank { get; set; }
    public int? WarGamesRank { get; set; }
}
