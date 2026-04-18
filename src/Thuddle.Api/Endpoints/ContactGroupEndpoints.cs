using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;

namespace Thuddle.Api.Endpoints;

public static class ContactGroupEndpoints
{
    public static void MapContactGroupEndpoints(this WebApplication app)
    {
        app.MapGet("/api/groups", GetGroups).RequireAuthorization("groups:manage");
        app.MapGet("/api/groups/{groupId:guid}", GetGroup).RequireAuthorization("groups:manage");
        app.MapPost("/api/groups", CreateGroup).RequireAuthorization("groups:manage");
        app.MapPut("/api/groups/{groupId:guid}", RenameGroup).RequireAuthorization("groups:manage");
        app.MapDelete("/api/groups/{groupId:guid}", DeleteGroup).RequireAuthorization("groups:manage");
        app.MapPost("/api/groups/{groupId:guid}/members", AddMembers).RequireAuthorization("groups:manage");
        app.MapDelete("/api/groups/{groupId:guid}/members/{userId:guid}", RemoveMember).RequireAuthorization("groups:manage");
        app.MapPost("/api/groups/{groupId:guid}/import-attendees/{eventId:guid}", ImportAttendees).RequireAuthorization("groups:manage");
    }

    private static string? GetKeycloakId(ClaimsPrincipal user)
    {
        return user.FindFirstValue("sub")
            ?? user.FindFirstValue("sid")
            ?? user.FindFirstValue("email");
    }

    private static async Task<User?> GetCurrentUser(ClaimsPrincipal user, ThuddleDbContext db, CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return null;
        return await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
    }

    private static async Task<IResult> GetGroups(
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var dbUser = await GetCurrentUser(user, db, ct);
        if (dbUser is null) return Results.Unauthorized();

        var groups = await db.ContactGroups
            .AsNoTracking()
            .Where(g => g.OwnerId == dbUser.Id)
            .OrderBy(g => g.Name)
            .Select(g => new
            {
                g.Id,
                g.Name,
                MemberCount = db.ContactGroupMembers.Count(m => m.GroupId == g.Id),
                Members = db.ContactGroupMembers
                    .Where(m => m.GroupId == g.Id)
                    .OrderBy(m => m.User.DisplayName ?? m.User.Email)
                    .Select(m => new
                    {
                        m.UserId,
                        m.User.Email,
                        DisplayName = m.User.DisplayName ?? m.User.FullName ?? m.User.Email,
                        ProfilePictureUrl = m.User.ScaledPicturePath != null ? $"/api/profile/picture/{m.User.KeycloakId}" : null
                    })
                    .ToList()
            })
            .ToListAsync(ct);

        return Results.Ok(groups);
    }

    private static async Task<IResult> GetGroup(
        Guid groupId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var dbUser = await GetCurrentUser(user, db, ct);
        if (dbUser is null) return Results.Unauthorized();

        var group = await db.ContactGroups
            .AsNoTracking()
            .Where(g => g.Id == groupId && g.OwnerId == dbUser.Id)
            .Select(g => new
            {
                g.Id,
                g.Name,
                Members = db.ContactGroupMembers
                    .Where(m => m.GroupId == g.Id)
                    .OrderBy(m => m.User.DisplayName ?? m.User.Email)
                    .Select(m => new
                    {
                        m.UserId,
                        m.User.Email,
                        FullName = m.User.FullName,
                        DisplayName = m.User.DisplayName ?? m.User.FullName ?? m.User.Email,
                        ProfilePictureUrl = m.User.ScaledPicturePath != null ? $"/api/profile/picture/{m.User.KeycloakId}" : null
                    })
                    .ToList()
            })
            .FirstOrDefaultAsync(ct);

        if (group is null) return Results.NotFound(new { error = "Group not found." });
        return Results.Ok(group);
    }

    public record CreateGroupRequest(string Name, Guid[]? UserIds);

    private static async Task<IResult> CreateGroup(
        CreateGroupRequest request,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var dbUser = await GetCurrentUser(user, db, ct);
        if (dbUser is null) return Results.Unauthorized();

        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
            return Results.BadRequest(new { error = "Group name is required." });
        if (name.Length > 80)
            return Results.BadRequest(new { error = "Group name is too long (max 80)." });

        var group = new ContactGroup
        {
            Id = Guid.NewGuid(),
            OwnerId = dbUser.Id,
            Name = name,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        db.ContactGroups.Add(group);

        var added = 0;
        if (request.UserIds is { Length: > 0 })
        {
            var ids = request.UserIds.Distinct().ToArray();
            var validIds = await db.Users
                .Where(u => ids.Contains(u.Id))
                .Select(u => u.Id)
                .ToListAsync(ct);

            foreach (var uid in validIds)
            {
                db.ContactGroupMembers.Add(new ContactGroupMember
                {
                    Id = Guid.NewGuid(),
                    GroupId = group.Id,
                    UserId = uid,
                    AddedAt = DateTime.UtcNow
                });
                added++;
            }
        }

        await db.SaveChangesAsync(ct);

        return Results.Created($"/api/groups/{group.Id}", new
        {
            group.Id,
            group.Name,
            MemberCount = added,
            Added = added,
            Skipped = 0
        });
    }

    public record RenameGroupRequest(string Name);

    private static async Task<IResult> RenameGroup(
        Guid groupId,
        RenameGroupRequest request,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var dbUser = await GetCurrentUser(user, db, ct);
        if (dbUser is null) return Results.Unauthorized();

        var group = await db.ContactGroups
            .FirstOrDefaultAsync(g => g.Id == groupId && g.OwnerId == dbUser.Id, ct);
        if (group is null) return Results.NotFound(new { error = "Group not found." });

        var name = request.Name?.Trim();
        if (string.IsNullOrWhiteSpace(name))
            return Results.BadRequest(new { error = "Group name is required." });
        if (name.Length > 80)
            return Results.BadRequest(new { error = "Group name is too long (max 80)." });

        group.Name = name;
        group.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return Results.Ok(new { group.Id, group.Name });
    }

    private static async Task<IResult> DeleteGroup(
        Guid groupId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var dbUser = await GetCurrentUser(user, db, ct);
        if (dbUser is null) return Results.Unauthorized();

        var group = await db.ContactGroups
            .FirstOrDefaultAsync(g => g.Id == groupId && g.OwnerId == dbUser.Id, ct);
        if (group is null) return Results.NotFound();

        db.ContactGroups.Remove(group);
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    public record AddMembersRequest(Guid[] UserIds);

    private static async Task<IResult> AddMembers(
        Guid groupId,
        AddMembersRequest request,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var dbUser = await GetCurrentUser(user, db, ct);
        if (dbUser is null) return Results.Unauthorized();

        var group = await db.ContactGroups
            .FirstOrDefaultAsync(g => g.Id == groupId && g.OwnerId == dbUser.Id, ct);
        if (group is null) return Results.NotFound(new { error = "Group not found." });

        if (request.UserIds is null || request.UserIds.Length == 0)
            return Results.Ok(new { added = 0, skipped = 0 });

        var ids = request.UserIds.Distinct().ToArray();

        var validUserIds = await db.Users
            .Where(u => ids.Contains(u.Id))
            .Select(u => u.Id)
            .ToListAsync(ct);

        var existing = await db.ContactGroupMembers
            .Where(m => m.GroupId == groupId && validUserIds.Contains(m.UserId))
            .Select(m => m.UserId)
            .ToListAsync(ct);
        var existingSet = existing.ToHashSet();

        var toAdd = validUserIds.Where(id => !existingSet.Contains(id)).ToList();
        foreach (var uid in toAdd)
        {
            db.ContactGroupMembers.Add(new ContactGroupMember
            {
                Id = Guid.NewGuid(),
                GroupId = groupId,
                UserId = uid,
                AddedAt = DateTime.UtcNow
            });
        }

        if (toAdd.Count > 0)
        {
            group.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
        }

        var skipped = ids.Length - toAdd.Count;
        return Results.Ok(new { added = toAdd.Count, skipped });
    }

    private static async Task<IResult> RemoveMember(
        Guid groupId,
        Guid userId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var dbUser = await GetCurrentUser(user, db, ct);
        if (dbUser is null) return Results.Unauthorized();

        var group = await db.ContactGroups
            .FirstOrDefaultAsync(g => g.Id == groupId && g.OwnerId == dbUser.Id, ct);
        if (group is null) return Results.NotFound();

        var member = await db.ContactGroupMembers
            .FirstOrDefaultAsync(m => m.GroupId == groupId && m.UserId == userId, ct);
        if (member is null) return Results.NotFound();

        db.ContactGroupMembers.Remove(member);
        group.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return Results.NoContent();
    }

    private static async Task<IResult> ImportAttendees(
        Guid groupId,
        Guid eventId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var dbUser = await GetCurrentUser(user, db, ct);
        if (dbUser is null) return Results.Unauthorized();

        var group = await db.ContactGroups
            .FirstOrDefaultAsync(g => g.Id == groupId && g.OwnerId == dbUser.Id, ct);
        if (group is null) return Results.NotFound(new { error = "Group not found." });

        // Caller must be an admin of the source event
        var evt = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return Results.NotFound(new { error = "Event not found." });
        var isAdmin = evt.OwnerId == dbUser.Id
            || await db.EventCoAdmins.AnyAsync(c => c.EventId == eventId && c.UserId == dbUser.Id, ct);
        if (!isAdmin) return Results.Forbid();

        var attendeeIds = await db.EventParticipants
            .Where(p => p.EventId == eventId)
            .Select(p => p.UserId)
            .ToListAsync(ct);

        if (attendeeIds.Count == 0)
            return Results.Ok(new { added = 0, skipped = 0 });

        var existing = await db.ContactGroupMembers
            .Where(m => m.GroupId == groupId && attendeeIds.Contains(m.UserId))
            .Select(m => m.UserId)
            .ToListAsync(ct);
        var existingSet = existing.ToHashSet();

        var toAdd = attendeeIds.Where(id => !existingSet.Contains(id)).ToList();
        foreach (var uid in toAdd)
        {
            db.ContactGroupMembers.Add(new ContactGroupMember
            {
                Id = Guid.NewGuid(),
                GroupId = groupId,
                UserId = uid,
                AddedAt = DateTime.UtcNow
            });
        }

        if (toAdd.Count > 0)
        {
            group.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
        }

        return Results.Ok(new { added = toAdd.Count, skipped = attendeeIds.Count - toAdd.Count });
    }
}
