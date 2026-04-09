using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;

namespace Thuddle.Api.Endpoints;

public static class EventEndpoints
{
    public static void MapEventEndpoints(this WebApplication app)
    {
        app.MapGet("/api/events", GetEvents);
        app.MapPost("/api/events", CreateEvent).RequireAuthorization("events:write");
        app.MapPost("/api/events/{eventId:guid}/invitations", InviteUsers).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/join", JoinEvent).RequireAuthorization();
    }

    private static string? GetKeycloakId(ClaimsPrincipal user)
    {
        return user.FindFirstValue("sub")
            ?? user.FindFirstValue("sid")
            ?? user.FindFirstValue("email");
    }

    private static async Task<IResult> GetEvents(
        int? page,
        int? pageSize,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var p = Math.Max(page ?? 1, 1);
        var size = Math.Clamp(pageSize ?? 20, 1, 100);

        var totalCount = await db.Events.CountAsync(ct);

        var events = await db.Events
            .OrderBy(e => e.Start)
            .Skip((p - 1) * size)
            .Take(size)
            .Select(e => new
            {
                e.Id,
                e.Title,
                e.Description,
                e.PicturePath,
                e.Start,
                e.End,
                e.OwnerId,
                e.Visibility,
                e.JoinMode,
                e.Capacity,
                e.Cost
            })
            .ToListAsync(ct);

        return Results.Ok(new
        {
            items = events,
            page = p,
            pageSize = size,
            totalCount,
            totalPages = (int)Math.Ceiling((double)totalCount / size)
        });
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

        if (request.Capacity is < 1)
            return Results.BadRequest(new { error = "Capacity must be at least 1." });

        var evt = new Event
        {
            Id = Guid.NewGuid(),
            OwnerId = dbUser.Id,
            Title = request.Title.Trim(),
            Description = request.Description?.Trim() ?? "",
            Start = request.Start,
            End = request.End,
            Visibility = request.Visibility,
            JoinMode = request.JoinMode,
            Capacity = request.Capacity,
            Cost = request.Cost,
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
            evt.End,
            evt.Visibility,
            evt.JoinMode,
            evt.Capacity,
            evt.Cost
        });
    }

    private static async Task<IResult> InviteUsers(
        Guid eventId,
        InviteUsersRequest request,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var evt = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return Results.NotFound(new { error = "Event not found." });

        if (evt.OwnerId != dbUser.Id)
            return Results.Forbid();

        if (request.Emails is not { Count: > 0 })
            return Results.BadRequest(new { error = "At least one email is required." });

        var existingEmails = await db.EventInvitations
            .Where(i => i.EventId == eventId)
            .Select(i => i.Email)
            .ToListAsync(ct);

        var existingSet = existingEmails.ToHashSet(StringComparer.OrdinalIgnoreCase);

        var newInvitations = request.Emails
            .Where(e => !string.IsNullOrWhiteSpace(e) && !existingSet.Contains(e))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(email => new EventInvitation
            {
                Id = Guid.NewGuid(),
                EventId = eventId,
                Email = email.Trim(),
                CreatedAt = DateTime.UtcNow
            })
            .ToList();

        if (newInvitations.Count > 0)
        {
            db.EventInvitations.AddRange(newInvitations);
            await db.SaveChangesAsync(ct);
        }

        return Results.Ok(new { invited = newInvitations.Count });
    }

    private static async Task<IResult> JoinEvent(
        Guid eventId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var evt = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return Results.NotFound(new { error = "Event not found." });

        var alreadyJoined = await db.EventParticipants
            .AnyAsync(p => p.EventId == eventId && p.UserId == dbUser.Id, ct);

        if (alreadyJoined)
            return Results.Conflict(new { error = "You have already joined this event." });

        if (evt.JoinMode == JoinMode.InviteOnly)
        {
            var hasInvitation = await db.EventInvitations
                .AnyAsync(i => i.EventId == eventId && i.Email == dbUser.Email, ct);

            if (!hasInvitation)
                return Results.Forbid();
        }

        if (evt.Capacity.HasValue)
        {
            var currentCount = await db.EventParticipants
                .CountAsync(p => p.EventId == eventId, ct);

            if (currentCount >= evt.Capacity.Value)
                return Results.Conflict(new { error = "Event is at full capacity." });
        }

        var participant = new EventParticipant
        {
            Id = Guid.NewGuid(),
            EventId = eventId,
            UserId = dbUser.Id,
            JoinedAt = DateTime.UtcNow
        };

        db.EventParticipants.Add(participant);
        await db.SaveChangesAsync(ct);

        return Results.Ok(new { joined = true, eventId });
    }
}

public record CreateEventRequest(
    string Title,
    string? Description,
    DateTime Start,
    DateTime End,
    EventVisibility Visibility,
    JoinMode JoinMode,
    int? Capacity,
    decimal? Cost);

public record InviteUsersRequest(List<string> Emails);
