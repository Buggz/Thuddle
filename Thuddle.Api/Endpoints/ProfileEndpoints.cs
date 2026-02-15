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
        app.MapGet("/api/profile", GetProfile).RequireAuthorization();
        app.MapPut("/api/profile/displayname", UpdateDisplayName).RequireAuthorization();
        app.MapPost("/api/profile/picture", UploadPicture).RequireAuthorization().DisableAntiforgery();
        app.MapGet("/api/profile/picture/{keycloakId}", GetProfilePicture);
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

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);

        if (dbUser is null)
        {
            var email = user.FindFirstValue("email") ?? "";

            dbUser = new User
            {
                Id = Guid.NewGuid(),
                KeycloakId = keycloakId,
                Email = email,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            db.Users.Add(dbUser);
            await db.SaveChangesAsync(ct);
        }

        return Results.Ok(new
        {
            dbUser.DisplayName,
            dbUser.Email,
            HasProfilePicture = dbUser.ScaledPicturePath is not null
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
        if (dbUser is null) return Results.NotFound();

        dbUser.DisplayName = request.DisplayName;
        dbUser.UpdatedAt = DateTime.UtcNow;
        db.Users.Update(dbUser);
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

        if (file.Length > 5 * 1024 * 1024)
            return Results.BadRequest(new { error = "File too large. Maximum 5MB." });

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms, ct);
        var originalBytes = ms.ToArray();

        var scaledBytes = scaler.Scale(originalBytes);

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.NotFound();

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
