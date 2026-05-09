using System.Security.Claims;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Authorization;
using Thuddle.Api.Data;
using Thuddle.Api.Realtime;

namespace Thuddle.Api.Endpoints;

public static class ActivityEndpoints
{
    public static void MapActivityEndpoints(this WebApplication app)
    {
        app.MapGet("/api/events/{eventId:guid}/activities", ListActivities);
        app.MapGet("/api/events/{eventId:guid}/activities/{activityId:guid}", GetActivity);
        app.MapPost("/api/events/{eventId:guid}/activities", CreateActivity).RequireAuthorization();
        app.MapPut("/api/events/{eventId:guid}/activities/{activityId:guid}", UpdateActivity).RequireAuthorization();
        app.MapDelete("/api/events/{eventId:guid}/activities/{activityId:guid}", DeleteActivity).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/activities/{activityId:guid}/signup", SignUp).RequireAuthorization();
        app.MapDelete("/api/events/{eventId:guid}/activities/{activityId:guid}/signup", WithdrawSignup).RequireAuthorization();
        app.MapDelete("/api/events/{eventId:guid}/activities/{activityId:guid}/participants/{userId:guid}", RemoveParticipant).RequireAuthorization();
    }

    private static string? GetKeycloakId(ClaimsPrincipal user) => EventAuthorization.GetKeycloakId(user);
    private static Task<bool> IsEventAdmin(ThuddleDbContext db, Guid eventId, Guid userId, CancellationToken ct) => EventAuthorization.IsEventAdmin(db, eventId, userId, ct);
    private static Task<bool> IsEventParticipant(ThuddleDbContext db, Guid eventId, Guid userId, CancellationToken ct) => EventAuthorization.IsEventParticipant(db, eventId, userId, ct);

    private static IResult? ValidationError(FluentValidation.Results.ValidationResult result)
    {
        if (result.IsValid) return null;
        return Results.BadRequest(new { error = result.Errors[0].ErrorMessage });
    }

    // ─── GET /api/events/{eventId}/activities ─────────────────────────────────

    private static async Task<IResult> ListActivities(
        Guid eventId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        // Guid.Empty is a safe sentinel: no participant row will ever have that userId.
        var lookupUserId = Guid.Empty;
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is not null)
        {
            var userId = await db.Users.AsNoTracking()
                .Where(u => u.KeycloakId == keycloakId)
                .Select(u => (Guid?)u.Id)
                .FirstOrDefaultAsync(ct);
            if (userId.HasValue) lookupUserId = userId.Value;
        }

        var activities = await db.EventActivities
            .AsNoTracking()
            .Where(a => a.EventId == eventId)
            .OrderBy(a => a.StartsAt)
            .ThenBy(a => a.CreatedAt)
            .Select(a => new
            {
                a.Id,
                a.EventId,
                a.Title,
                a.Description,
                a.StartsAt,
                a.EndsAt,
                a.MaxParticipants,
                participantCount = a.Participants.Count,
                isFull = a.MaxParticipants.HasValue && a.Participants.Count >= a.MaxParticipants.Value,
                mySignupAt = a.Participants
                    .Where(p => p.UserId == lookupUserId)
                    .Select(p => (DateTime?)p.SignedUpAt)
                    .FirstOrDefault(),
                a.CreatedAt,
                a.UpdatedAt
            })
            .ToListAsync(ct);

        return Results.Ok(activities);
    }

    // ─── GET /api/events/{eventId}/activities/{activityId} ───────────────────

    private static async Task<IResult> GetActivity(
        Guid eventId,
        Guid activityId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var lookupUserId = Guid.Empty;
        var isAdmin = false;
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is not null)
        {
            var dbUser = await db.Users.AsNoTracking()
                .Where(u => u.KeycloakId == keycloakId)
                .Select(u => new { u.Id })
                .FirstOrDefaultAsync(ct);
            if (dbUser is not null)
            {
                lookupUserId = dbUser.Id;
                isAdmin = await IsEventAdmin(db, eventId, dbUser.Id, ct);
            }
        }

        var activity = await db.EventActivities
            .AsNoTracking()
            .Where(a => a.Id == activityId && a.EventId == eventId)
            .Select(a => new
            {
                a.Id,
                a.EventId,
                a.Title,
                a.Description,
                a.StartsAt,
                a.EndsAt,
                a.MaxParticipants,
                participantCount = a.Participants.Count,
                isFull = a.MaxParticipants.HasValue && a.Participants.Count >= a.MaxParticipants.Value,
                mySignupAt = a.Participants
                    .Where(p => p.UserId == lookupUserId)
                    .Select(p => (DateTime?)p.SignedUpAt)
                    .FirstOrDefault(),
                a.CreatedAt,
                a.UpdatedAt
            })
            .FirstOrDefaultAsync(ct);

        if (activity is null) return Results.NotFound(new { error = "Activity not found." });

        if (!isAdmin)
        {
            return Results.Ok(new
            {
                activity.Id,
                activity.EventId,
                activity.Title,
                activity.Description,
                activity.StartsAt,
                activity.EndsAt,
                activity.MaxParticipants,
                activity.participantCount,
                activity.isFull,
                activity.mySignupAt,
                activity.CreatedAt,
                activity.UpdatedAt,
                participants = (object?)null
            });
        }

        var participants = await db.EventActivityParticipants
            .AsNoTracking()
            .Where(p => p.EventActivityId == activityId)
            .OrderBy(p => p.SignedUpAt)
            .Select(p => new
            {
                p.UserId,
                displayName = p.User.DisplayName ?? p.User.Email,
                profilePictureUrl = p.User.ScaledPicturePath != null
                    ? $"/api/profile/picture/{p.User.KeycloakId}"
                    : null,
                p.SignedUpAt
            })
            .ToListAsync(ct);

        return Results.Ok(new
        {
            activity.Id,
            activity.EventId,
            activity.Title,
            activity.Description,
            activity.StartsAt,
            activity.EndsAt,
            activity.MaxParticipants,
            activity.participantCount,
            activity.isFull,
            activity.mySignupAt,
            activity.CreatedAt,
            activity.UpdatedAt,
            participants
        });
    }

    // ─── POST /api/events/{eventId}/activities ────────────────────────────────

    private static async Task<IResult> CreateActivity(
        Guid eventId,
        CreateActivityRequest request,
        IValidator<CreateActivityRequest> validator,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventAdmin(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        if (ValidationError(await validator.ValidateAsync(request, ct)) is { } err)
            return err;

        var now = DateTime.UtcNow;
        var activity = new EventActivity
        {
            Id = Guid.NewGuid(),
            EventId = eventId,
            Title = request.Title.Trim(),
            Description = request.Description?.Trim(),
            StartsAt = request.StartsAt,
            EndsAt = request.EndsAt,
            MaxParticipants = request.MaxParticipants,
            CreatedAt = now,
            UpdatedAt = now,
            CreatedByUserId = dbUser.Id
        };

        var featureAlreadyEnabled = await db.EventFeatures
            .AnyAsync(f => f.EventId == eventId && f.FeatureKey == FeatureKeys.Activities, ct);

        EventFeature? newFeature = null;
        if (!featureAlreadyEnabled)
        {
            newFeature = new EventFeature
            {
                Id = Guid.NewGuid(),
                EventId = eventId,
                FeatureKey = FeatureKeys.Activities,
                EnabledAt = now,
                EnabledByUserId = dbUser.Id
            };
            db.EventFeatures.Add(newFeature);
        }

        db.EventActivities.Add(activity);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException) when (newFeature is not null)
        {
            // Unique-index race on EventFeatures — the feature was enabled concurrently.
            // The activity itself cannot cause a unique violation (new GUID), so any
            // DbUpdateException here must be the feature row. Detach it and retry.
            db.Entry(newFeature).State = EntityState.Detached;
            newFeature = null;
            await db.SaveChangesAsync(ct);
        }

        await realtime.ActivityCreatedAsync(eventId, activity.Id, ct);
        if (newFeature is not null)
            await realtime.EventFeatureEnabledAsync(eventId, FeatureKeys.Activities, ct);

        return Results.Created(
            $"/api/events/{eventId}/activities/{activity.Id}",
            new
            {
                activity.Id,
                activity.EventId,
                activity.Title,
                activity.Description,
                activity.StartsAt,
                activity.EndsAt,
                activity.MaxParticipants,
                participantCount = 0,
                isFull = false,
                mySignupAt = (DateTime?)null,
                activity.CreatedAt,
                activity.UpdatedAt
            });
    }

    // ─── PUT /api/events/{eventId}/activities/{activityId} ───────────────────

    private static async Task<IResult> UpdateActivity(
        Guid eventId,
        Guid activityId,
        UpdateActivityRequest request,
        IValidator<UpdateActivityRequest> validator,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventAdmin(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        if (ValidationError(await validator.ValidateAsync(request, ct)) is { } err)
            return err;

        var activity = await db.EventActivities.AsTracking()
            .FirstOrDefaultAsync(a => a.Id == activityId && a.EventId == eventId, ct);
        if (activity is null) return Results.NotFound(new { error = "Activity not found." });

        var participantCount = await db.EventActivityParticipants
            .CountAsync(p => p.EventActivityId == activityId, ct);

        if (request.MaxParticipants.HasValue && request.MaxParticipants.Value < participantCount)
            return Results.Conflict(new { error = "Cannot reduce max participants below current sign-up count." });

        if (request.Title is not null) activity.Title = request.Title.Trim();
        if (request.Description is not null) activity.Description = request.Description.Trim();
        if (request.StartsAt.HasValue) activity.StartsAt = request.StartsAt.Value;
        if (request.EndsAt.HasValue) activity.EndsAt = request.EndsAt.Value;
        if (request.MaxParticipants.HasValue) activity.MaxParticipants = request.MaxParticipants.Value;
        activity.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        await realtime.ActivityUpdatedAsync(eventId, activityId, ct);

        return Results.Ok(new
        {
            activity.Id,
            activity.EventId,
            activity.Title,
            activity.Description,
            activity.StartsAt,
            activity.EndsAt,
            activity.MaxParticipants,
            participantCount,
            isFull = activity.MaxParticipants.HasValue && participantCount >= activity.MaxParticipants.Value,
            mySignupAt = (DateTime?)null,
            activity.CreatedAt,
            activity.UpdatedAt
        });
    }

    // ─── DELETE /api/events/{eventId}/activities/{activityId} ─────────────────

    private static async Task<IResult> DeleteActivity(
        Guid eventId,
        Guid activityId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventAdmin(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        var activity = await db.EventActivities.AsTracking()
            .FirstOrDefaultAsync(a => a.Id == activityId && a.EventId == eventId, ct);
        if (activity is null) return Results.NotFound(new { error = "Activity not found." });

        db.EventActivities.Remove(activity);
        await db.SaveChangesAsync(ct);
        await realtime.ActivityDeletedAsync(eventId, activityId, ct);

        return Results.NoContent();
    }

    // ─── POST /api/events/{eventId}/activities/{activityId}/signup ───────────

    private static async Task<IResult> SignUp(
        Guid eventId,
        Guid activityId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        ILoggerFactory loggerFactory,
        CancellationToken ct)
    {
        var logger = loggerFactory.CreateLogger("ActivityEndpoints");
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventParticipant(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        var activity = await db.EventActivities.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == activityId && a.EventId == eventId, ct);
        if (activity is null) return Results.NotFound(new { error = "Activity not found." });

        var alreadySignedUp = await db.EventActivityParticipants
            .AnyAsync(p => p.EventActivityId == activityId && p.UserId == dbUser.Id, ct);
        if (alreadySignedUp)
            return Results.Conflict(new { error = "Already signed up." });

        var currentCount = await db.EventActivityParticipants
            .CountAsync(p => p.EventActivityId == activityId, ct);
        if (activity.MaxParticipants.HasValue && currentCount >= activity.MaxParticipants.Value)
            return Results.Conflict(new { error = "This activity is full." });

        var now = DateTime.UtcNow;
        var participant = new EventActivityParticipant
        {
            Id = Guid.NewGuid(),
            EventActivityId = activityId,
            UserId = dbUser.Id,
            SignedUpAt = now
        };

        db.EventActivityParticipants.Add(participant);

        // TODO: tighten capacity race with explicit transaction once load justifies it
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Unique index fired — concurrent double-signup race lost.
            return Results.Conflict(new { error = "Already signed up." });
        }

        var participantCount = await db.EventActivityParticipants
            .CountAsync(p => p.EventActivityId == activityId, ct);

        if (activity.MaxParticipants.HasValue && participantCount > activity.MaxParticipants.Value)
        {
            logger.LogWarning(
                "Activity {ActivityId} in event {EventId} exceeded MaxParticipants ({Max}) after concurrent sign-up. Current count: {Count}.",
                activityId, eventId, activity.MaxParticipants.Value, participantCount);
        }

        await realtime.ActivityParticipantChangedAsync(eventId, activityId, dbUser.Id, joined: true, participantCount, ct);

        return Results.Ok(new { userId = dbUser.Id, signedUpAt = now, participantCount });
    }

    // ─── DELETE /api/events/{eventId}/activities/{activityId}/signup ─────────

    private static async Task<IResult> WithdrawSignup(
        Guid eventId,
        Guid activityId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var participant = await db.EventActivityParticipants.AsTracking()
            .FirstOrDefaultAsync(p => p.EventActivityId == activityId && p.UserId == dbUser.Id, ct);
        if (participant is null) return Results.NotFound(new { error = "Not signed up for this activity." });

        db.EventActivityParticipants.Remove(participant);
        await db.SaveChangesAsync(ct);

        var participantCount = await db.EventActivityParticipants
            .CountAsync(p => p.EventActivityId == activityId, ct);

        await realtime.ActivityParticipantChangedAsync(eventId, activityId, dbUser.Id, joined: false, participantCount, ct);

        return Results.NoContent();
    }

    // ─── DELETE /api/events/{eventId}/activities/{activityId}/participants/{userId} ─

    private static async Task<IResult> RemoveParticipant(
        Guid eventId,
        Guid activityId,
        Guid userId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventAdmin(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        var participant = await db.EventActivityParticipants.AsTracking()
            .FirstOrDefaultAsync(p => p.EventActivityId == activityId && p.UserId == userId, ct);
        if (participant is null) return Results.NotFound(new { error = "Participant not found." });

        db.EventActivityParticipants.Remove(participant);
        await db.SaveChangesAsync(ct);

        var participantCount = await db.EventActivityParticipants
            .CountAsync(p => p.EventActivityId == activityId, ct);

        await realtime.ActivityParticipantChangedAsync(eventId, activityId, userId, joined: false, participantCount, ct);

        return Results.NoContent();
    }
}

// ─── Request records ──────────────────────────────────────────────────────────

public record CreateActivityRequest(
    string Title,
    string? Description,
    DateTime StartsAt,
    DateTime? EndsAt,
    int? MaxParticipants);

public record UpdateActivityRequest(
    string? Title,
    string? Description,
    DateTime? StartsAt,
    DateTime? EndsAt,
    int? MaxParticipants);
