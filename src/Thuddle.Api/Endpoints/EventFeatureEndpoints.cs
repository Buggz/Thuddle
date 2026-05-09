using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Authorization;
using Thuddle.Api.Data;
using Thuddle.Api.Realtime;

namespace Thuddle.Api.Endpoints;

public static class EventFeatureEndpoints
{
    public static void MapEventFeatureEndpoints(this WebApplication app)
    {
        app.MapGet("/api/events/{eventId:guid}/features", ListFeatures);
        app.MapPost("/api/events/{eventId:guid}/features", EnableFeature).RequireAuthorization();
        app.MapDelete("/api/events/{eventId:guid}/features/{key}", DisableFeature).RequireAuthorization();
    }

    private static string? GetKeycloakId(ClaimsPrincipal user) => EventAuthorization.GetKeycloakId(user);
    private static Task<bool> IsEventAdmin(ThuddleDbContext db, Guid eventId, Guid userId, CancellationToken ct) => EventAuthorization.IsEventAdmin(db, eventId, userId, ct);

    // ─── GET /api/events/{eventId}/features ──────────────────────────────────

    private static async Task<IResult> ListFeatures(
        Guid eventId,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var features = await db.EventFeatures
            .AsNoTracking()
            .Where(f => f.EventId == eventId)
            .OrderBy(f => f.FeatureKey)
            .Select(f => new { key = f.FeatureKey, f.EnabledAt, f.EnabledByUserId })
            .ToListAsync(ct);

        return Results.Ok(features);
    }

    // ─── POST /api/events/{eventId}/features ─────────────────────────────────

    private static async Task<IResult> EnableFeature(
        Guid eventId,
        EnableFeatureRequest body,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        CancellationToken ct)
    {
        if (!FeatureKeys.All.Contains(body.Key))
            return Results.BadRequest(new { error = "Unknown feature key." });

        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var evt = await db.Events.AsNoTracking().FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return Results.NotFound();

        var isAdmin = evt.OwnerId == dbUser.Id
            || await db.EventCoAdmins.AnyAsync(c => c.EventId == eventId && c.UserId == dbUser.Id, ct);
        if (!isAdmin)
            return Results.Forbid();

        var alreadyEnabled = await db.EventFeatures
            .AnyAsync(f => f.EventId == eventId && f.FeatureKey == body.Key, ct);

        if (alreadyEnabled)
            return Results.Conflict(new { error = "Feature already enabled." });

        var now = DateTime.UtcNow;
        var feature = new EventFeature
        {
            Id = Guid.NewGuid(),
            EventId = eventId,
            FeatureKey = body.Key,
            EnabledAt = now,
            EnabledByUserId = dbUser.Id,
        };

        db.EventFeatures.Add(feature);
        await db.SaveChangesAsync(ct);
        await realtime.EventFeatureEnabledAsync(eventId, body.Key, ct);

        return Results.Ok(new { key = body.Key, enabledAt = now, enabledByUserId = dbUser.Id });
    }

    // ─── DELETE /api/events/{eventId}/features/{key} ─────────────────────────

    private static async Task<IResult> DisableFeature(
        Guid eventId,
        string key,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        CancellationToken ct)
    {
        if (!FeatureKeys.All.Contains(key))
            return Results.BadRequest(new { error = "Unknown feature key." });

        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventAdmin(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        var feature = await db.EventFeatures
            .FirstOrDefaultAsync(f => f.EventId == eventId && f.FeatureKey == key, ct);

        if (feature is null)
            return Results.NotFound();

        // Content guards: prevent disabling a feature that would orphan live data.
        if (key == FeatureKeys.Raffles)
        {
            var hasRaffles = await db.Raffles.AnyAsync(r => r.EventId == eventId && r.DeletedAt == null, ct);
            if (hasRaffles)
                return Results.Conflict(new { error = "Cannot disable Raffles while raffles exist. Delete them first." });
        }
        else if (key == FeatureKeys.Auction)
        {
            var hasAuction = await db.EventAuctionSettings.AnyAsync(s => s.EventId == eventId, ct);
            if (hasAuction)
                return Results.Conflict(new { error = "Cannot disable Auction while auction settings exist. Reset the auction first." });
        }
        // Activities: no content yet — always allowed.

        db.EventFeatures.Remove(feature);
        await db.SaveChangesAsync(ct);
        await realtime.EventFeatureDisabledAsync(eventId, key, ct);

        return Results.NoContent();
    }

    private sealed record EnableFeatureRequest(string Key);
}
