using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;

namespace Thuddle.Api.Endpoints;

public static class AdminEndpoints
{
    private static readonly string[] KnownPermissions = ["events:write", "groups:manage", "admin:access"];

    public static void MapAdminEndpoints(this WebApplication app)
    {
        app.MapGet("/api/admin/permissions", GetAllPermissions).RequireAuthorization("admin:access");
        app.MapGet("/api/admin/permissions/known", GetKnownPermissions).RequireAuthorization("admin:access");
        app.MapPost("/api/admin/permissions", GrantPermission).RequireAuthorization("admin:access");
        app.MapDelete("/api/admin/permissions/{userId:guid}/{permission}", RevokePermission).RequireAuthorization("admin:access");
    }

    private static async Task<IResult> GetAllPermissions(
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var rows = await db.UserPermissions
            .AsNoTracking()
            .Include(p => p.User)
            .OrderBy(p => p.User.Email)
            .ThenBy(p => p.Permission)
            .Select(p => new
            {
                p.UserId,
                p.User.Email,
                p.User.DisplayName,
                p.Permission,
                p.GrantedAt
            })
            .ToListAsync(ct);

        return Results.Ok(rows);
    }

    private static IResult GetKnownPermissions()
    {
        return Results.Ok(KnownPermissions);
    }

    private static async Task<IResult> GrantPermission(
        GrantPermissionRequest request,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Permission))
            return Results.BadRequest(new { error = "Email and permission are required." });

        if (!KnownPermissions.Contains(request.Permission))
            return Results.BadRequest(new { error = $"Unknown permission '{request.Permission}'." });

        var user = await db.Users
            .FirstOrDefaultAsync(u => u.Email.ToLower() == request.Email.ToLower(), ct);

        if (user is null)
            return Results.NotFound(new { error = $"No user found with email '{request.Email}'." });

        var exists = await db.UserPermissions
            .AnyAsync(p => p.UserId == user.Id && p.Permission == request.Permission, ct);

        if (exists)
            return Results.Conflict(new { error = $"User already has '{request.Permission}'." });

        db.UserPermissions.Add(new UserPermission
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Permission = request.Permission,
            GrantedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync(ct);

        return Results.Created($"/api/admin/permissions/{user.Id}/{request.Permission}", new
        {
            user.Id,
            user.Email,
            user.DisplayName,
            request.Permission
        });
    }

    private static async Task<IResult> RevokePermission(
        Guid userId,
        string permission,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var entry = await db.UserPermissions
            .FirstOrDefaultAsync(p => p.UserId == userId && p.Permission == permission, ct);

        if (entry is null)
            return Results.NotFound(new { error = "Permission not found." });

        db.UserPermissions.Remove(entry);
        await db.SaveChangesAsync(ct);

        return Results.Ok(new { removed = true });
    }

    private record GrantPermissionRequest(string Email, string Permission);
}
