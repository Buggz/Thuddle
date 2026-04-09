using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;

namespace Thuddle.Api.Endpoints;

public static class EventEndpoints
{
    public static void MapEventEndpoints(this WebApplication app)
    {
        app.MapGet("/api/events", GetEvents);
        app.MapGet("/api/events/{eventId:guid}", GetEvent);
        app.MapPost("/api/events", CreateEvent).RequireAuthorization("events:write");
        app.MapPut("/api/events/{eventId:guid}", UpdateEvent).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/invitations", InviteUsers).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/join", JoinEvent).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/co-admins", AddCoAdmin).RequireAuthorization();
        app.MapDelete("/api/events/{eventId:guid}/co-admins/{userId:guid}", RemoveCoAdmin).RequireAuthorization();
        app.MapGet("/api/events/{eventId:guid}/attendees", GetAttendees).RequireAuthorization();
        app.MapPut("/api/events/{eventId:guid}/attendees/{userId:guid}/payment", UpdatePayment).RequireAuthorization();
    }

    private static string? GetKeycloakId(ClaimsPrincipal user)
    {
        return user.FindFirstValue("sub")
            ?? user.FindFirstValue("sid")
            ?? user.FindFirstValue("email");
    }

    private static async Task<bool> IsEventAdmin(ThuddleDbContext db, Guid eventId, Guid userId, CancellationToken ct)
    {
        var evt = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return false;
        if (evt.OwnerId == userId) return true;
        return await db.EventCoAdmins.AnyAsync(c => c.EventId == eventId && c.UserId == userId, ct);
    }

    private static async Task<IResult> GetEvents(
        int? page,
        int? pageSize,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var p = Math.Max(page ?? 1, 1);
        var size = Math.Clamp(pageSize ?? 20, 1, 100);

        var keycloakId = GetKeycloakId(user);
        var dbUser = keycloakId is not null
            ? await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct)
            : null;

        var totalCount = await db.Events.CountAsync(ct);

        var events = await db.Events
            .OrderBy(e => e.Start)
            .Skip((p - 1) * size)
            .Take(size)
            .Select(e => new
            {
                e.Id,
                e.Title,
                e.Location,
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

        var eventIds = events.Select(e => e.Id).ToList();

        var joinedEventIds = dbUser is not null
            ? (await db.EventParticipants
                .Where(p2 => eventIds.Contains(p2.EventId) && p2.UserId == dbUser.Id)
                .Select(p2 => p2.EventId)
                .ToListAsync(ct))
                .ToHashSet()
            : new HashSet<Guid>();

        var invitedEventIds = dbUser is not null
            ? (await db.EventInvitations
                .Where(i => eventIds.Contains(i.EventId) && i.Email == dbUser.Email)
                .Select(i => i.EventId)
                .ToListAsync(ct))
                .ToHashSet()
            : new HashSet<Guid>();

        var result = events.Select(e =>
        {
            var hasJoined = joinedEventIds.Contains(e.Id);
            var canJoin = !hasJoined && dbUser is not null
                && (e.JoinMode == JoinMode.Open || invitedEventIds.Contains(e.Id));

            return new
            {
                e.Id,
                e.Title,
                e.Location,
                e.PicturePath,
                e.Start,
                e.End,
                e.OwnerId,
                e.Visibility,
                e.JoinMode,
                e.Capacity,
                e.Cost,
                HasJoined = hasJoined,
                CanJoin = canJoin
            };
        });

        return Results.Ok(new
        {
            items = result,
            page = p,
            pageSize = size,
            totalCount,
            totalPages = (int)Math.Ceiling((double)totalCount / size)
        });
    }

    private static async Task<IResult> GetEvent(
        Guid eventId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var evt = await db.Events
            .Where(e => e.Id == eventId)
            .Select(e => new
            {
                e.Id,
                e.Title,
                e.Location,
                e.PicturePath,
                e.Start,
                e.End,
                e.OwnerId,
                e.Visibility,
                e.JoinMode,
                e.Capacity,
                e.Cost,
                OwnerName = e.Owner.DisplayName ?? e.Owner.Email
            })
            .FirstOrDefaultAsync(ct);

        if (evt is null) return Results.NotFound(new { error = "Event not found." });

        var keycloakId = GetKeycloakId(user);
        var dbUser = keycloakId is not null
            ? await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct)
            : null;

        var hasJoined = dbUser is not null && await db.EventParticipants
            .AnyAsync(p => p.EventId == eventId && p.UserId == dbUser.Id, ct);

        var hasInvitation = dbUser is not null && await db.EventInvitations
            .AnyAsync(i => i.EventId == eventId && i.Email == dbUser.Email, ct);

        var canJoin = !hasJoined && dbUser is not null
            && (evt.JoinMode == JoinMode.Open || hasInvitation);

        var participantCount = await db.EventParticipants.CountAsync(p => p.EventId == eventId, ct);

        var isAdmin = dbUser is not null
            && await IsEventAdmin(db, eventId, dbUser.Id, ct);

        return Results.Ok(new
        {
            evt.Id,
            evt.Title,
            evt.Location,
            evt.PicturePath,
            evt.Start,
            evt.End,
            evt.OwnerId,
            evt.OwnerName,
            evt.Visibility,
            evt.JoinMode,
            evt.Capacity,
            evt.Cost,
            ParticipantCount = participantCount,
            HasJoined = hasJoined,
            CanJoin = canJoin,
            IsAdmin = isAdmin
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
            Location = request.Location?.Trim() ?? "",
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
            evt.Location,
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

        if (!await IsEventAdmin(db, eventId, dbUser.Id, ct))
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

    private static async Task<IResult> UpdateEvent(
        Guid eventId,
        UpdateEventRequest request,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventAdmin(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        var evt = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return Results.NotFound(new { error = "Event not found." });

        if (string.IsNullOrWhiteSpace(request.Title))
            return Results.BadRequest(new { error = "Title is required." });

        if (request.End <= request.Start)
            return Results.BadRequest(new { error = "End must be after Start." });

        if (request.Capacity is < 1)
            return Results.BadRequest(new { error = "Capacity must be at least 1." });

        evt.Title = request.Title.Trim();
        evt.Location = request.Location?.Trim() ?? "";
        evt.Start = request.Start;
        evt.End = request.End;
        evt.Visibility = request.Visibility;
        evt.JoinMode = request.JoinMode;
        evt.Capacity = request.Capacity;
        evt.Cost = request.Cost;
        evt.UpdatedAt = DateTime.UtcNow;

        db.Events.Update(evt);
        await db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            evt.Id,
            evt.Title,
            evt.Location,
            evt.Start,
            evt.End,
            evt.Visibility,
            evt.JoinMode,
            evt.Capacity,
            evt.Cost
        });
    }

    private static async Task<IResult> AddCoAdmin(
        Guid eventId,
        AddCoAdminRequest request,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventAdmin(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        var targetUser = await db.Users.FirstOrDefaultAsync(u => u.Email == request.Email, ct);
        if (targetUser is null)
            return Results.NotFound(new { error = "User not found." });

        var already = await db.EventCoAdmins
            .AnyAsync(c => c.EventId == eventId && c.UserId == targetUser.Id, ct);

        if (already)
            return Results.Conflict(new { error = "User is already a co-admin." });

        var evt = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is not null && evt.OwnerId == targetUser.Id)
            return Results.BadRequest(new { error = "The owner is already an admin." });

        db.EventCoAdmins.Add(new EventCoAdmin
        {
            Id = Guid.NewGuid(),
            EventId = eventId,
            UserId = targetUser.Id,
            CreatedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync(ct);

        return Results.Ok(new { userId = targetUser.Id, email = targetUser.Email, displayName = targetUser.DisplayName });
    }

    private static async Task<IResult> RemoveCoAdmin(
        Guid eventId,
        Guid userId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventAdmin(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        var coAdmin = await db.EventCoAdmins
            .FirstOrDefaultAsync(c => c.EventId == eventId && c.UserId == userId, ct);

        if (coAdmin is null)
            return Results.NotFound(new { error = "Co-admin not found." });

        db.EventCoAdmins.Remove(coAdmin);
        await db.SaveChangesAsync(ct);

        return Results.Ok(new { removed = true });
    }

    private static async Task<IResult> GetAttendees(
        Guid eventId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventAdmin(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        var attendees = await db.EventParticipants
            .Where(p => p.EventId == eventId)
            .Select(p => new
            {
                p.UserId,
                p.User.Email,
                DisplayName = p.User.DisplayName ?? p.User.Email,
                p.JoinedAt,
                p.HasPaid
            })
            .OrderBy(a => a.JoinedAt)
            .ToListAsync(ct);

        var coAdmins = await db.EventCoAdmins
            .Where(c => c.EventId == eventId)
            .Select(c => new
            {
                c.UserId,
                c.User.Email,
                DisplayName = c.User.DisplayName ?? c.User.Email
            })
            .ToListAsync(ct);

        return Results.Ok(new { attendees, coAdmins });
    }

    private static async Task<IResult> UpdatePayment(
        Guid eventId,
        Guid userId,
        UpdatePaymentRequest request,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventAdmin(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        var participant = await db.EventParticipants
            .FirstOrDefaultAsync(p => p.EventId == eventId && p.UserId == userId, ct);

        if (participant is null)
            return Results.NotFound(new { error = "Attendee not found." });

        participant.HasPaid = request.HasPaid;
        db.EventParticipants.Update(participant);
        await db.SaveChangesAsync(ct);

        return Results.Ok(new { userId, hasPaid = request.HasPaid });
    }
}

public record CreateEventRequest(
    string Title,
    string? Location,
    DateTime Start,
    DateTime End,
    EventVisibility Visibility,
    JoinMode JoinMode,
    int? Capacity,
    decimal? Cost);

public record InviteUsersRequest(List<string> Emails);

public record UpdateEventRequest(
    string Title,
    string? Location,
    DateTime Start,
    DateTime End,
    EventVisibility Visibility,
    JoinMode JoinMode,
    int? Capacity,
    decimal? Cost);

public record AddCoAdminRequest(string Email);

public record UpdatePaymentRequest(bool HasPaid);
