using System.Security.Claims;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Authorization;
using Thuddle.Api.Data;
using Thuddle.Api.Realtime;
using Thuddle.Api.Services;

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
        app.MapPost("/api/events/{eventId:guid}/activities/description-images", UploadDescriptionImage).RequireAuthorization().DisableAntiforgery();
        app.MapPost("/api/events/{eventId:guid}/activities/{activityId:guid}/signup", SignUp).RequireAuthorization();
        app.MapDelete("/api/events/{eventId:guid}/activities/{activityId:guid}/signup", WithdrawSignup).RequireAuthorization();
        app.MapDelete("/api/events/{eventId:guid}/activities/{activityId:guid}/participants/{userId:guid}", RemoveParticipant).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/activities/{activityId:guid}/waitlist", JoinWaitlist).RequireAuthorization();
        app.MapDelete("/api/events/{eventId:guid}/activities/{activityId:guid}/waitlist", LeaveWaitlist).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/activities/{activityId:guid}/waitlist/promote", PromoteWaitlist).RequireAuthorization();
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
        var isParticipant = false;
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is not null)
        {
            var userId = await db.Users.AsNoTracking()
                .Where(u => u.KeycloakId == keycloakId)
                .Select(u => (Guid?)u.Id)
                .FirstOrDefaultAsync(ct);
            if (userId.HasValue)
            {
                lookupUserId = userId.Value;
                isParticipant = await IsEventParticipant(db, eventId, lookupUserId, ct);
            }
        }

        var query = db.EventActivities
            .AsNoTracking()
            .Where(a => a.EventId == eventId);

        if (!isParticipant)
            query = query.Where(a => !a.HiddenFromNonParticipants);

        var activities = await query
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
                a.HiddenFromNonParticipants,
                participantCount = a.Participants.Count,
                isFull = a.MaxParticipants.HasValue && a.Participants.Count >= a.MaxParticipants.Value,
                mySignupAt = a.Participants
                    .Where(p => p.UserId == lookupUserId)
                    .Select(p => (DateTime?)p.SignedUpAt)
                    .FirstOrDefault(),
                waitlistCount = a.WaitlistEntries.Count,
                myWaitlistAt = a.WaitlistEntries
                    .Where(w => w.UserId == lookupUserId)
                    .Select(w => (DateTime?)w.JoinedWaitlistAt)
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
        var isParticipant = false;
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
                isParticipant = isAdmin || await db.EventParticipants
                    .AnyAsync(p => p.EventId == eventId && p.UserId == dbUser.Id, ct);
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
                a.HiddenFromNonParticipants,
                participantCount = a.Participants.Count,
                isFull = a.MaxParticipants.HasValue && a.Participants.Count >= a.MaxParticipants.Value,
                mySignupAt = a.Participants
                    .Where(p => p.UserId == lookupUserId)
                    .Select(p => (DateTime?)p.SignedUpAt)
                    .FirstOrDefault(),
                waitlistCount = a.WaitlistEntries.Count,
                myWaitlistAt = a.WaitlistEntries
                    .Where(w => w.UserId == lookupUserId)
                    .Select(w => (DateTime?)w.JoinedWaitlistAt)
                    .FirstOrDefault(),
                a.CreatedAt,
                a.UpdatedAt
            })
            .FirstOrDefaultAsync(ct);

        if (activity is null) return Results.NotFound(new { error = "Activity not found." });

        // Hidden activities are invisible to non-participants — return 404 to avoid leaking existence.
        if (activity.HiddenFromNonParticipants && !isParticipant)
            return Results.NotFound(new { error = "Activity not found." });

        if (!isParticipant)
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
                activity.HiddenFromNonParticipants,
                activity.participantCount,
                activity.isFull,
                activity.mySignupAt,
                activity.waitlistCount,
                activity.myWaitlistAt,
                activity.CreatedAt,
                activity.UpdatedAt,
                participants = (object?)null,
                waitlist = (object?)null
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
                activity.HiddenFromNonParticipants,
                activity.participantCount,
                activity.isFull,
                activity.mySignupAt,
                activity.waitlistCount,
                activity.myWaitlistAt,
                activity.CreatedAt,
                activity.UpdatedAt,
                participants,
                waitlist = (object?)null
            });
        }

        var waitlist = await db.EventActivityWaitlistEntries
            .AsNoTracking()
            .Where(w => w.EventActivityId == activityId)
            .OrderBy(w => w.JoinedWaitlistAt)
            .Select(w => new
            {
                w.UserId,
                displayName = w.User.DisplayName ?? w.User.Email,
                profilePictureUrl = w.User.ScaledPicturePath != null
                    ? $"/api/profile/picture/{w.User.KeycloakId}"
                    : null,
                w.JoinedWaitlistAt
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
            activity.HiddenFromNonParticipants,
            activity.participantCount,
            activity.isFull,
            activity.mySignupAt,
            activity.waitlistCount,
            activity.myWaitlistAt,
            activity.CreatedAt,
            activity.UpdatedAt,
            participants,
            waitlist
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
            HiddenFromNonParticipants = request.HiddenFromNonParticipants,
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
                activity.HiddenFromNonParticipants,
                participantCount = 0,
                isFull = false,
                mySignupAt = (DateTime?)null,
                waitlistCount = 0,
                myWaitlistAt = (DateTime?)null,
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
        if (request.HiddenFromNonParticipants.HasValue) activity.HiddenFromNonParticipants = request.HiddenFromNonParticipants.Value;
        activity.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        await realtime.ActivityUpdatedAsync(eventId, activityId, ct);

        var waitlistCount = await db.EventActivityWaitlistEntries
            .CountAsync(w => w.EventActivityId == activityId, ct);

        return Results.Ok(new
        {
            activity.Id,
            activity.EventId,
            activity.Title,
            activity.Description,
            activity.StartsAt,
            activity.EndsAt,
            activity.MaxParticipants,
            activity.HiddenFromNonParticipants,
            participantCount,
            isFull = activity.MaxParticipants.HasValue && participantCount >= activity.MaxParticipants.Value,
            mySignupAt = (DateTime?)null,
            waitlistCount,
            myWaitlistAt = (DateTime?)null,
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
        NotificationService notifications,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventAdmin(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        var activityTitle = await db.EventActivities
            .Where(a => a.Id == activityId && a.EventId == eventId)
            .Select(a => a.Title)
            .FirstOrDefaultAsync(ct);
        if (activityTitle is null) return Results.NotFound(new { error = "Activity not found." });

        var participant = await db.EventActivityParticipants.AsTracking()
            .FirstOrDefaultAsync(p => p.EventActivityId == activityId && p.UserId == userId, ct);
        if (participant is null) return Results.NotFound(new { error = "Participant not found." });

        db.EventActivityParticipants.Remove(participant);
        await db.SaveChangesAsync(ct);

        var participantCount = await db.EventActivityParticipants
            .CountAsync(p => p.EventActivityId == activityId, ct);

        if (dbUser.Id != userId)
            await notifications.NotifyRemovedFromActivity(userId, eventId, activityId, activityTitle, ct);

        await realtime.ActivityParticipantChangedAsync(eventId, activityId, userId, joined: false, participantCount, ct);

        return Results.NoContent();
    }

    // ─── POST /api/events/{eventId}/activities/description-images ─────────────

    private static async Task<IResult> UploadDescriptionImage(
        Guid eventId,
        HttpRequest request,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        ActivityDescriptionImageStorage imageStorage,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventAdmin(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        var form = await request.ReadFormAsync(ct);
        var file = form.Files.GetFile("image");
        if (file is null || file.Length == 0)
            return Results.BadRequest(new { error = "No image uploaded." });

        // TODO: orphan blobs from deleted activity descriptions are accepted for now.
        try
        {
            await using var stream = file.OpenReadStream();
            var url = await imageStorage.UploadAsync(eventId, stream, file.ContentType, ct);
            return Results.Ok(new { url });
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(new { error = ex.Message });
        }
    }

    // ─── POST /api/events/{eventId}/activities/{activityId}/waitlist ──────────

    private static async Task<IResult> JoinWaitlist(
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

        if (!await IsEventParticipant(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        var activity = await db.EventActivities.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == activityId && a.EventId == eventId, ct);
        if (activity is null) return Results.NotFound(new { error = "Activity not found." });

        var alreadySignedUp = await db.EventActivityParticipants
            .AnyAsync(p => p.EventActivityId == activityId && p.UserId == dbUser.Id, ct);
        if (alreadySignedUp)
            return Results.Conflict(new { error = "Already signed up for this activity." });

        var alreadyOnWaitlist = await db.EventActivityWaitlistEntries
            .AnyAsync(w => w.EventActivityId == activityId && w.UserId == dbUser.Id, ct);
        if (alreadyOnWaitlist)
            return Results.Conflict(new { error = "Already on the waitlist." });

        var currentCount = await db.EventActivityParticipants
            .CountAsync(p => p.EventActivityId == activityId, ct);
        if (!activity.MaxParticipants.HasValue || currentCount < activity.MaxParticipants.Value)
            return Results.Conflict(new { error = "Activity is not full. Sign up directly." });

        var now = DateTime.UtcNow;
        var entry = new EventActivityWaitlistEntry
        {
            Id = Guid.NewGuid(),
            EventActivityId = activityId,
            UserId = dbUser.Id,
            JoinedWaitlistAt = now
        };

        db.EventActivityWaitlistEntries.Add(entry);

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Unique index fired — concurrent double-join race lost.
            return Results.Conflict(new { error = "Already on the waitlist." });
        }

        var waitlistCount = await db.EventActivityWaitlistEntries
            .CountAsync(w => w.EventActivityId == activityId, ct);

        // Position is 1-based; since we just joined we are at the back.
        var position = waitlistCount;

        await realtime.ActivityWaitlistChangedAsync(eventId, activityId, dbUser.Id, joined: true, waitlistCount, ct);

        return Results.Ok(new { userId = dbUser.Id, joinedWaitlistAt = now, waitlistCount, position });
    }

    // ─── DELETE /api/events/{eventId}/activities/{activityId}/waitlist ────────

    private static async Task<IResult> LeaveWaitlist(
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

        var activityExists = await db.EventActivities
            .AnyAsync(a => a.Id == activityId && a.EventId == eventId, ct);
        if (!activityExists) return Results.NotFound(new { error = "Activity not found." });

        var entry = await db.EventActivityWaitlistEntries.AsTracking()
            .FirstOrDefaultAsync(w => w.EventActivityId == activityId && w.UserId == dbUser.Id, ct);
        if (entry is null) return Results.NotFound(new { error = "Not on the waitlist for this activity." });

        db.EventActivityWaitlistEntries.Remove(entry);
        await db.SaveChangesAsync(ct);

        var waitlistCount = await db.EventActivityWaitlistEntries
            .CountAsync(w => w.EventActivityId == activityId, ct);

        await realtime.ActivityWaitlistChangedAsync(eventId, activityId, dbUser.Id, joined: false, waitlistCount, ct);

        return Results.NoContent();
    }

    // ─── POST /api/events/{eventId}/activities/{activityId}/waitlist/promote ──

    private static async Task<IResult> PromoteWaitlist(
        Guid eventId,
        Guid activityId,
        PromoteWaitlistRequest request,
        IValidator<PromoteWaitlistRequest> validator,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        NotificationService notifications,
        ILoggerFactory loggerFactory,
        CancellationToken ct)
    {
        var logger = loggerFactory.CreateLogger("ActivityEndpoints");
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

        var waitlistEntry = await db.EventActivityWaitlistEntries.AsTracking()
            .FirstOrDefaultAsync(w => w.EventActivityId == activityId && w.UserId == request.UserId, ct);
        if (waitlistEntry is null) return Results.NotFound(new { error = "User is not on the waitlist." });

        var currentCount = await db.EventActivityParticipants
            .CountAsync(p => p.EventActivityId == activityId, ct);
        var isFull = activity.MaxParticipants.HasValue && currentCount >= activity.MaxParticipants.Value;

        if (isFull && !request.AllowOverflow)
            return Results.Conflict(new { error = "This activity is full.", code = "activity_full" });

        if (isFull && request.AllowOverflow && activity.MaxParticipants.HasValue)
        {
            activity.MaxParticipants += 1;
            logger.LogWarning(
                "Activity {ActivityId} in event {EventId} had MaxParticipants bumped to {NewMax} due to waitlist overflow promotion of user {UserId}.",
                activityId, eventId, activity.MaxParticipants.Value, request.UserId);
        }

        var now = DateTime.UtcNow;
        var participant = new EventActivityParticipant
        {
            Id = Guid.NewGuid(),
            EventActivityId = activityId,
            UserId = request.UserId,
            SignedUpAt = now
        };

        db.EventActivityWaitlistEntries.Remove(waitlistEntry);
        db.EventActivityParticipants.Add(participant);

        await db.SaveChangesAsync(ct);

        var participantCount = await db.EventActivityParticipants
            .CountAsync(p => p.EventActivityId == activityId, ct);
        var waitlistCount = await db.EventActivityWaitlistEntries
            .CountAsync(w => w.EventActivityId == activityId, ct);

        await notifications.NotifyPromotedFromWaitlist(request.UserId, eventId, activityId, activity.Title, ct);
        await realtime.ActivityWaitlistChangedAsync(eventId, activityId, request.UserId, joined: false, waitlistCount, ct);
        await realtime.ActivityParticipantChangedAsync(eventId, activityId, request.UserId, joined: true, participantCount, ct);
        await realtime.ActivityUpdatedAsync(eventId, activityId, ct);

        return Results.Ok(new { userId = request.UserId, signedUpAt = now, participantCount, waitlistCount });
    }
}

// ─── Request records ──────────────────────────────────────────────────────────

public record CreateActivityRequest(
    string Title,
    string? Description,
    DateTime StartsAt,
    DateTime? EndsAt,
    int? MaxParticipants,
    bool HiddenFromNonParticipants = false);

public record UpdateActivityRequest(
    string? Title,
    string? Description,
    DateTime? StartsAt,
    DateTime? EndsAt,
    int? MaxParticipants,
    bool? HiddenFromNonParticipants);

public record PromoteWaitlistRequest(Guid UserId, bool AllowOverflow);
