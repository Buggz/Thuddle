using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;

namespace Thuddle.Api.Endpoints;

public static class EventEndpoints
{
    public static void MapEventEndpoints(this WebApplication app)
    {
        app.MapPost("/api/events", CreateEvent).RequireAuthorization();
    }

    private static string? GetKeycloakId(ClaimsPrincipal user)
    {
        return user.FindFirstValue("sub")
            ?? user.FindFirstValue("sid")
            ?? user.FindFirstValue("email");
    }

    private static async Task<IResult> CreateEvent(
        ClaimsPrincipal user,
        CreateEventRequest request,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (string.IsNullOrWhiteSpace(request.Title))
            return Results.BadRequest(new { error = "Title is required." });

        if (request.End <= request.Start)
            return Results.BadRequest(new { error = "End must be after Start." });

        var evt = new Event
        {
            Id = Guid.NewGuid(),
            OwnerId = dbUser.Id,
            Title = request.Title.Trim(),
            Description = request.Description?.Trim() ?? "",
            Start = request.Start,
            End = request.End,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        db.Events.Add(evt);
        await db.SaveChangesAsync(ct);

        return Results.Created($"/api/events/{evt.Id}", new
        {
            evt.Id,
            evt.Title,
            evt.Description,
            evt.Start,
            evt.End
        });
    }
}

public record CreateEventRequest(string Title, string? Description, DateTime Start, DateTime End);
