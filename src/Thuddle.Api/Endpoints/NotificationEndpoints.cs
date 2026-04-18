using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;

namespace Thuddle.Api.Endpoints;

public static class NotificationEndpoints
{
    public static void MapNotificationEndpoints(this WebApplication app)
    {
        app.MapGet("/api/notifications", GetNotifications).RequireAuthorization();
        app.MapPost("/api/notifications/{id:guid}/read", MarkRead).RequireAuthorization();
        app.MapPost("/api/notifications/read-all", MarkAllRead).RequireAuthorization();
    }

    private static string? GetKeycloakId(ClaimsPrincipal user) =>
        user.FindFirstValue("sub") ?? user.FindFirstValue("sid") ?? user.FindFirstValue("email");

    private static async Task<IResult> GetNotifications(
        bool? unreadOnly,
        int? page,
        int? pageSize,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var p = Math.Max(page ?? 1, 1);
        var size = Math.Clamp(pageSize ?? 20, 1, 100);

        var query = db.Notifications.AsNoTracking()
            .Where(n => n.RecipientUserId == dbUser.Id);

        if (unreadOnly == true)
            query = query.Where(n => n.ReadAt == null);

        var totalCount = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(n => n.CreatedAt)
            .Skip((p - 1) * size)
            .Take(size)
            .Select(n => new
            {
                n.Id,
                kind = n.Kind.ToString(),
                n.EventId,
                n.EntityId,
                n.Message,
                n.CreatedAt,
                n.ReadAt
            })
            .ToListAsync(ct);

        return Results.Ok(new
        {
            items,
            page = p,
            pageSize = size,
            totalCount,
            totalPages = (int)Math.Ceiling((double)totalCount / size)
        });
    }

    private static async Task<IResult> MarkRead(
        Guid id,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var notification = await db.Notifications.AsTracking()
            .FirstOrDefaultAsync(n => n.Id == id && n.RecipientUserId == dbUser.Id, ct);

        if (notification is null) return Results.NotFound(new { error = "Notification not found." });

        notification.ReadAt ??= DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return Results.Ok(new { read = true });
    }

    private static async Task<IResult> MarkAllRead(
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var now = DateTime.UtcNow;
        await db.Notifications
            .Where(n => n.RecipientUserId == dbUser.Id && n.ReadAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.ReadAt, now), ct);

        return Results.Ok(new { readAll = true });
    }
}
