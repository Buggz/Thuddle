using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Thuddle.Api.Data;
using Thuddle.Api.Services;

namespace Thuddle.Api.Endpoints;

public static class ProfileEndpoints
{
    public static void MapProfileEndpoints(this WebApplication app)
    {
        app.MapGet("/api/profile", GetProfile);
        app.MapPut("/api/profile/displayname", UpdateDisplayName);
        app.MapPost("/api/profile/picture", UploadPicture).DisableAntiforgery();
        app.MapGet("/api/profile/picture/{keycloakId}", GetProfilePicture).AllowAnonymous();
        app.MapPost("/api/profile/init", InitProfile);
    }

    // POST /api/profile/init - creates user if missing, idempotent
    private static async Task<IResult> InitProfile(
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var email = user.FindFirstValue("email") ?? "";
        var givenName = user.FindFirstValue("given_name");
        var familyName = user.FindFirstValue("family_name");
        var fullName = (givenName, familyName) switch
        {
            (not null, not null) => $"{givenName} {familyName}",
            (not null, null) => givenName,
            (null, not null) => familyName,
            _ => null
        };

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct)
            ?? await db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == email.ToLower(), ct);

        if (dbUser is null)
        {
            dbUser = new User
            {
                Id = Guid.NewGuid(),
                KeycloakId = keycloakId,
                Email = email,
                FullName = fullName,
                DisplayName = fullName,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            db.Users.Add(dbUser);
            await db.SaveChangesAsync(ct);
        }
        else if (dbUser.KeycloakId != keycloakId)
        {
            // Keycloak was recreated — update stale KeycloakId
            dbUser.KeycloakId = keycloakId;
            dbUser.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
        }

        return Results.Ok(new { dbUser.Id });
    }

    private static string? GetKeycloakId(ClaimsPrincipal user)
    {
        return user.FindFirstValue("sub")
            ?? user.FindFirstValue("sid")
            ?? user.FindFirstValue("email");
    }

    private static async Task<IResult> GetProfile(
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var email = user.FindFirstValue("email") ?? "";
        var givenName = user.FindFirstValue("given_name");
        var familyName = user.FindFirstValue("family_name");
        var fullName = (givenName, familyName) switch
        {
            (not null, not null) => $"{givenName} {familyName}",
            (not null, null) => givenName,
            (null, not null) => familyName,
            _ => null
        };


        // Only read user, do not write on GET
        var dbUser = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct)
            ?? await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Email.ToLower() == email.ToLower(), ct);

        // If user does not exist, return minimal info
        if (dbUser is null)
        {
            return Results.Ok(new
            {
                DisplayName = fullName,
                Email = email,
                HasProfilePicture = false,
                Permissions = new List<string>()
            });
        }

        return Results.Ok(new
        {
            dbUser.DisplayName,
            dbUser.Email,
            HasProfilePicture = dbUser.ScaledPicturePath is not null,
            Permissions = await db.UserPermissions
                .AsNoTracking()
                .Where(p => p.UserId == dbUser.Id)
                .Select(p => p.Permission)
                .ToListAsync(ct)
        });
    }

    private static async Task<IResult> UpdateDisplayName(
        ClaimsPrincipal user,
        DisplayNameRequest request,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null)
        {
            // Create user if not found
            var email = user.FindFirstValue("email") ?? "";
            var givenName = user.FindFirstValue("given_name");
            var familyName = user.FindFirstValue("family_name");
            var fullName = (givenName, familyName) switch
            {
                (not null, not null) => $"{givenName} {familyName}",
                (not null, null) => givenName,
                (null, not null) => familyName,
                _ => null
            };
            dbUser = new User
            {
                Id = Guid.NewGuid(),
                KeycloakId = keycloakId,
                Email = email,
                FullName = fullName,
                DisplayName = request.DisplayName,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            db.Users.Add(dbUser);
        }
        else
        {
            dbUser.DisplayName = request.DisplayName;
            dbUser.UpdatedAt = DateTime.UtcNow;
            db.Users.Update(dbUser);
        }
        await db.SaveChangesAsync(ct);

        return Results.Ok(new { dbUser.DisplayName });
    }

    private static async Task<IResult> UploadPicture(
        HttpRequest request,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        ImageScaler scaler,
        ProfilePictureStorage storage,
        IMemoryCache cache,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var form = await request.ReadFormAsync(ct);
        var file = form.Files.GetFile("picture");
        if (file is null || file.Length == 0)
            return Results.BadRequest(new { error = "No picture uploaded." });

        if (file.Length > 10 * 1024 * 1024)
            return Results.BadRequest(new { error = "File too large. Maximum 10MB." });

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms, ct);
        var originalBytes = ms.ToArray();

        var scaledBytes = scaler.Scale(originalBytes);


        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null)
        {
            // Create user if not found
            var email = user.FindFirstValue("email") ?? "";
            var givenName = user.FindFirstValue("given_name");
            var familyName = user.FindFirstValue("family_name");
            var fullName = (givenName, familyName) switch
            {
                (not null, not null) => $"{givenName} {familyName}",
                (not null, null) => givenName,
                (null, not null) => familyName,
                _ => null
            };
            dbUser = new User
            {
                Id = Guid.NewGuid(),
                KeycloakId = keycloakId,
                Email = email,
                FullName = fullName,
                DisplayName = fullName,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            db.Users.Add(dbUser);
            await db.SaveChangesAsync(ct);
        }

        var (originalPath, scaledPath) = await storage.UploadAsync(
            dbUser.Id.ToString(), originalBytes, scaledBytes, ct);

        dbUser.OriginalPicturePath = originalPath;
        dbUser.ScaledPicturePath = scaledPath;
        dbUser.UpdatedAt = DateTime.UtcNow;
        db.Users.Update(dbUser);
        await db.SaveChangesAsync(ct);

        cache.Remove($"profile-picture:{keycloakId}");

        return Results.Ok(new { message = "Profile picture uploaded." });
    }

    private static async Task<IResult> GetProfilePicture(
        string keycloakId,
        ThuddleDbContext db,
        ProfilePictureStorage storage,
        IMemoryCache cache,
        CancellationToken ct)
    {
        var cacheKey = $"profile-picture:{keycloakId}";

        if (cache.TryGetValue(cacheKey, out byte[]? cached) && cached is not null)
            return Results.File(cached, "image/png");

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser?.ScaledPicturePath is null) return Results.NotFound();

        var imageBytes = await storage.DownloadScaledAsync(dbUser.ScaledPicturePath, ct);
        if (imageBytes is null) return Results.NotFound();

        cache.Set(cacheKey, imageBytes, TimeSpan.FromMinutes(10));

        return Results.File(imageBytes, "image/png");
    }

    public record DisplayNameRequest(string DisplayName);
}
