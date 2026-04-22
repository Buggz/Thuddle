using System.Security.Claims;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;
using Thuddle.Api.Realtime;
using Thuddle.Api.Services;

namespace Thuddle.Api.Endpoints;

public static class EventEndpoints
{
    public static void MapEventEndpoints(this WebApplication app)
    {
        app.MapGet("/api/events", GetEvents).AllowAnonymous();
        app.MapGet("/api/events/{eventId:guid}", GetEvent).AllowAnonymous();
        app.MapPost("/api/events", CreateEvent).RequireAuthorization("events:write");
        app.MapPut("/api/events/{eventId:guid}", UpdateEvent).RequireAuthorization();
        app.MapDelete("/api/events/{eventId:guid}", DeleteEvent).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/invitations", InviteUsers).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/join", JoinEvent).RequireAuthorization();
        app.MapDelete("/api/events/{eventId:guid}/participants/me", LeaveEvent).RequireAuthorization();
        app.MapDelete("/api/events/{eventId:guid}/attendees/{userId:guid}", KickAttendee).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/co-admins", AddCoAdmin).RequireAuthorization();
        app.MapDelete("/api/events/{eventId:guid}/co-admins/{userId:guid}", RemoveCoAdmin).RequireAuthorization();
        app.MapGet("/api/events/{eventId:guid}/attendees", GetAttendees).RequireAuthorization();
        app.MapGet("/api/events/{eventId:guid}/participants", GetParticipants).AllowAnonymous();
        app.MapPut("/api/events/{eventId:guid}/attendees/{userId:guid}/payment", UpdatePayment).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/images", UploadEventImage).RequireAuthorization().DisableAntiforgery();
        app.MapPost("/api/events/{eventId:guid}/picture", UploadEventPicture).RequireAuthorization().DisableAntiforgery();

        app.MapGet("/api/users/exists", UserExistsByEmail).RequireAuthorization();
        app.MapGet("/api/users/search", SearchUsers).RequireAuthorization();
    }

    // GET /api/users/exists?email=...
    private static async Task<IResult> UserExistsByEmail(string email, ThuddleDbContext db, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(email))
            return Results.BadRequest(new { error = "Email is required." });

        var exists = await db.Users.AsNoTracking().AnyAsync(u => u.Email.ToLower() == email.ToLower(), ct);
        return Results.Ok(new { exists });
    }

    // GET /api/users/search?q=...
    private static async Task<IResult> SearchUsers(
        string q,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
            return Results.Ok(Array.Empty<object>());

        var keycloakId = GetKeycloakId(user);
        var pattern = $"%{q}%";

        var results = await db.Users
            .AsNoTracking()
            .Where(u => u.KeycloakId != keycloakId
                && (EF.Functions.ILike(u.Email, pattern)
                    || (u.DisplayName != null && EF.Functions.ILike(u.DisplayName, pattern))
                    || (u.FullName != null && EF.Functions.ILike(u.FullName, pattern))))
            .OrderByDescending(u => EF.Functions.TrigramsSimilarity(u.Email, q))
            .Take(10)
            .Select(u => new
            {
                u.Id,
                u.Email,
                u.DisplayName,
                u.FullName,
                ProfilePictureUrl = u.ScaledPicturePath != null ? $"/api/profile/picture/{u.KeycloakId}" : null
            })
            .ToListAsync(ct);

        return Results.Ok(results);
    }

    private static string? GetKeycloakId(ClaimsPrincipal user)
    {
        return user.FindFirstValue("sub")
            ?? user.FindFirstValue("sid")
            ?? user.FindFirstValue("email");
    }

    private static IResult? ValidationError(FluentValidation.Results.ValidationResult result)
    {
        if (result.IsValid) return null;
        var error = result.Errors[0].ErrorMessage;
        return Results.BadRequest(new { error });
    }

    private static async Task<IResult> DeleteEvent(
        Guid eventId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var evt = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return Results.NotFound();
        if (evt.OwnerId != dbUser.Id) return Results.Forbid();

        db.Events.Remove(evt);
        await db.SaveChangesAsync(ct);

        await realtime.EventDeletedAsync(eventId, ct);

        return Results.NoContent();
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
            ? await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct)
            : null;

        var isAnonymous = dbUser is null;
        var userId = dbUser?.Id ?? Guid.Empty;
        var userEmail = dbUser?.Email?.ToLower() ?? "";

        var query = db.Events.AsNoTracking();
        if (isAnonymous)
            query = query.Where(e => e.Visibility == EventVisibility.Public);
        else
            query = query.Where(e =>
                e.Visibility == EventVisibility.Public
                || e.OwnerId == userId
                || db.EventParticipants.Any(ep => ep.EventId == e.Id && ep.UserId == userId)
                || db.EventCoAdmins.Any(ca => ca.EventId == e.Id && ca.UserId == userId)
                || db.EventInvitations.Any(i => i.EventId == e.Id && i.Email.ToLower() == userEmail));

        var totalCount = await query.CountAsync(ct);

        var events = await query
            .OrderBy(e => e.Start)
            .Skip((p - 1) * size)
            .Take(size)
            .Select(e => new
            {
                e.Id,
                e.Title,
                e.Location,
                e.Description,
                e.PicturePath,
                e.Start,
                e.End,
                e.OwnerId,
                e.Visibility,
                e.JoinMode,
                e.Capacity,
                e.Cost,
                e.Currency,
                ParticipantCount = db.EventParticipants.Count(ep => ep.EventId == e.Id),
                PostCount = db.DiscussionPosts.Count(dp => dp.EventId == e.Id && dp.IsApproved),
                LatestPostAt = db.DiscussionPosts
                    .Where(dp => dp.EventId == e.Id && dp.IsApproved)
                    .Max(dp => (DateTime?)dp.CreatedAt),
                LatestCommentAt = db.DiscussionComments
                    .Where(dc => dc.Post.EventId == e.Id && dc.Post.IsApproved)
                    .Max(dc => (DateTime?)dc.CreatedAt),
                LastReadAt = !isAnonymous
                    ? db.DiscussionReadReceipts
                        .Where(r => r.UserId == userId && r.EventId == e.Id)
                        .Select(r => (DateTime?)r.LastReadAt)
                        .FirstOrDefault()
                    : null,
                HasJoined = !isAnonymous && db.EventParticipants.Any(ep => ep.EventId == e.Id && ep.UserId == userId),
                HasInvitation = !isAnonymous && db.EventInvitations.Any(i => i.EventId == e.Id && i.Email.ToLower() == userEmail),
                IsAdmin = !isAnonymous && (e.OwnerId == userId || db.EventCoAdmins.Any(ca => ca.EventId == e.Id && ca.UserId == userId)),
                PendingPostCount = !isAnonymous && (e.OwnerId == userId || db.EventCoAdmins.Any(ca => ca.EventId == e.Id && ca.UserId == userId))
                    ? db.DiscussionPosts.Count(dp => dp.EventId == e.Id && !dp.IsApproved)
                    : 0
            })
            .ToListAsync(ct);

        var result = events.Select(e =>
        {
            var latestActivity = new[] { e.LatestPostAt, e.LatestCommentAt }
                .Where(d => d.HasValue).Max();

            return new
            {
                e.Id,
                e.Title,
                e.Location,
                e.Description,
                e.PicturePath,
                e.Start,
                e.End,
                e.OwnerId,
                e.Visibility,
                e.JoinMode,
                e.Capacity,
                e.Cost,
                e.Currency,
                e.ParticipantCount,
                e.PostCount,
                HasUnreadDiscussion = !isAnonymous && e.PostCount > 0
                    && (e.LastReadAt is null || latestActivity > e.LastReadAt),
                e.HasJoined,
                e.HasInvitation,
                CanJoin = !e.HasJoined && !isAnonymous
                    && (e.JoinMode == JoinMode.Open || e.HasInvitation),
                e.IsAdmin,
                e.PendingPostCount
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
                e.Description,
                e.PicturePath,
                e.Start,
                e.End,
                e.OwnerId,
                e.Visibility,
                e.JoinMode,
                e.Capacity,
                e.Cost,
                e.Currency,
                OwnerName = e.Owner.DisplayName ?? e.Owner.Email
            })
            .FirstOrDefaultAsync(ct);

        if (evt is null) return Results.NotFound(new { error = "Event not found." });

        var keycloakId = GetKeycloakId(user);
        var dbUser = keycloakId is not null
            ? await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct)
            : null;

        if (dbUser is null && evt.Visibility != EventVisibility.Public)
            return Results.NotFound(new { error = "Event not found." });

        if (dbUser is not null && evt.Visibility == EventVisibility.Unlisted
            && evt.OwnerId != dbUser.Id
            && !await db.EventParticipants.AnyAsync(p => p.EventId == eventId && p.UserId == dbUser.Id, ct)
            && !await db.EventCoAdmins.AnyAsync(ca => ca.EventId == eventId && ca.UserId == dbUser.Id, ct)
            && !await db.EventInvitations.AnyAsync(i => i.EventId == eventId && i.Email.ToLower() == dbUser.Email.ToLower(), ct))
            return Results.NotFound(new { error = "Event not found." });

        var hasJoined = dbUser is not null && await db.EventParticipants
            .AnyAsync(p => p.EventId == eventId && p.UserId == dbUser.Id, ct);

        var hasPaid = false;
        if (dbUser is not null && hasJoined)
        {
            hasPaid = await db.EventParticipants
                .Where(p => p.EventId == eventId && p.UserId == dbUser.Id)
                .Select(p => p.HasPaid)
                .FirstOrDefaultAsync(ct);
        }

        var hasInvitation = dbUser is not null && await db.EventInvitations
            .AnyAsync(i => i.EventId == eventId && i.Email.ToLower() == dbUser.Email.ToLower(), ct);

        var canJoin = !hasJoined && dbUser is not null
            && (evt.JoinMode == JoinMode.Open || hasInvitation);

        var participantCount = await db.EventParticipants.CountAsync(p => p.EventId == eventId, ct);
        var postCount = await db.DiscussionPosts.CountAsync(p => p.EventId == eventId && p.IsApproved, ct);

        var hasUnreadDiscussion = false;
        if (dbUser is not null && postCount > 0)
        {
            var lastRead = await db.DiscussionReadReceipts
                .Where(r => r.UserId == dbUser.Id && r.EventId == eventId)
                .Select(r => (DateTime?)r.LastReadAt)
                .FirstOrDefaultAsync(ct);

            var latestPost = await db.DiscussionPosts
                .Where(p => p.EventId == eventId && p.IsApproved)
                .MaxAsync(p => (DateTime?)p.CreatedAt, ct);
            var latestComment = await db.DiscussionComments
                .Where(c => c.Post.EventId == eventId && c.Post.IsApproved)
                .MaxAsync(c => (DateTime?)c.CreatedAt, ct);

            var latestActivity = new[] { latestPost, latestComment }.Where(d => d.HasValue).Max();
            hasUnreadDiscussion = lastRead is null || latestActivity > lastRead;
        }

        var isAdmin = dbUser is not null
            && await IsEventAdmin(db, eventId, dbUser.Id, ct);

        var pendingPostCount = isAdmin
            ? await db.DiscussionPosts.CountAsync(p => p.EventId == eventId && !p.IsApproved, ct)
            : 0;

        return Results.Ok(new
        {
            evt.Id,
            evt.Title,
            evt.Location,
            evt.Description,
            evt.PicturePath,
            evt.Start,
            evt.End,
            evt.OwnerId,
            evt.OwnerName,
            evt.Visibility,
            evt.JoinMode,
            evt.Capacity,
            evt.Cost,
            evt.Currency,
            ParticipantCount = participantCount,
            PostCount = postCount,
            PendingPostCount = pendingPostCount,
            HasUnreadDiscussion = hasUnreadDiscussion,
            HasJoined = hasJoined,
            HasPaid = hasPaid,
            CanJoin = canJoin,
            IsAdmin = isAdmin
        });
    }

    private static async Task<IResult> CreateEvent(
        ClaimsPrincipal user,
        CreateEventRequest request,
        IValidator<CreateEventRequest> validator,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (ValidationError(await validator.ValidateAsync(request, ct)) is { } validationError)
            return validationError;

        // Unlisted events must be invite-only
        var joinMode = request.Visibility == EventVisibility.Unlisted
            ? JoinMode.InviteOnly
            : request.JoinMode;

        var evt = new Event
        {
            Id = Guid.NewGuid(),
            OwnerId = dbUser.Id,
            Title = request.Title.Trim(),
            Location = request.Location.Trim(),
            Description = request.Description,
            Start = request.Start,
            End = request.End,
            Visibility = request.Visibility,
            JoinMode = joinMode,
            Capacity = request.Capacity,
            Cost = request.Cost,
            Currency = request.Currency,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        db.Events.Add(evt);
        await db.SaveChangesAsync(ct);

        await realtime.EventCreatedAsync(evt.Id, evt.Visibility, ct);

        return Results.Created($"/api/events/{evt.Id}", new
        {
            evt.Id,
            evt.Title,
            evt.Location,
            evt.Description,
            evt.Start,
            evt.End,
            evt.Visibility,
            evt.JoinMode,
            evt.Capacity,
            evt.Cost,
            evt.Currency
        });
    }

    private static async Task<IResult> InviteUsers(
        Guid eventId,
        InviteUsersRequest request,
        IValidator<InviteUsersRequest> validator,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        SmtpEmailSender emailSender,
        RazorTemplateService templateService,
        IConfiguration config,
        IRealtimeNotifier realtime,
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

        if (ValidationError(await validator.ValidateAsync(request, ct)) is { } validationError)
            return validationError;

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
                Email = email.Trim().ToLower(),
                CreatedAt = DateTime.UtcNow
            })
            .ToList();

        if (newInvitations.Count > 0)
        {
            db.EventInvitations.AddRange(newInvitations);
            await db.SaveChangesAsync(ct);

            // Notify any invited users who already have an account (keycloak id lookup)
            var invitedEmails = newInvitations.Select(i => i.Email).ToList();
            var invitedUsers = await db.Users
                .AsNoTracking()
                .Where(u => invitedEmails.Contains(u.Email.ToLower()))
                .Select(u => u.KeycloakId)
                .ToListAsync(ct);
            foreach (var kcId in invitedUsers)
            {
                if (!string.IsNullOrEmpty(kcId))
                    await realtime.InvitationSentAsync(kcId, eventId, ct);
            }

            // Send email invitations
            var baseUrl = config["App:BaseUrl"] ?? "https://thuddle.app";
            foreach (var inv in newInvitations)
            {
                var joinUrl = $"{baseUrl}/events/{eventId}";
                var subject = $"You're invited to the event: {evt.Title}";
                var model = new Thuddle.Api.EmailTemplates.InviteEmailModel {
                    EventTitle = evt.Title,
                    Start = evt.Start.ToString("f"),
                    End = evt.End.ToString("f"),
                    Location = evt.Location,
                    JoinUrl = joinUrl
                };
                string htmlBody;
                try {
                    htmlBody = await templateService.RenderAsync("InviteEmail.cshtml", model);
                } catch {
                    htmlBody = $"You have been invited to the event {System.Net.WebUtility.HtmlEncode(evt.Title)}. Join: {System.Net.WebUtility.HtmlEncode(joinUrl)}";
                }
                try { await emailSender.SendEmailAsync(inv.Email, subject, htmlBody); } catch { /* ignore errors for now */ }
            }
        }

        return Results.Ok(new { invited = newInvitations.Count });
    }

    private static async Task<IResult> JoinEvent(
        Guid eventId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
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
                .AnyAsync(i => i.EventId == eventId && i.Email.ToLower() == dbUser.Email.ToLower(), ct);

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

        var newCount = await db.EventParticipants.CountAsync(p => p.EventId == eventId, ct);
        await realtime.ParticipantChangedAsync(eventId, newCount, ct);

        return Results.Ok(new { joined = true, eventId });
    }

    private static async Task<IResult> LeaveEvent(
        Guid eventId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var evt = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return Results.NotFound(new { error = "Event not found." });

        if (evt.OwnerId == dbUser.Id)
            return Results.BadRequest(new { error = "Owners cannot leave their own event. Delete it or transfer ownership." });

        var participant = await db.EventParticipants
            .FirstOrDefaultAsync(p => p.EventId == eventId && p.UserId == dbUser.Id, ct);

        if (participant is null)
            return Results.NotFound(new { error = "You are not a participant of this event." });

        db.EventParticipants.Remove(participant);
        await db.SaveChangesAsync(ct);

        var newCount = await db.EventParticipants.CountAsync(p => p.EventId == eventId, ct);
        await realtime.ParticipantChangedAsync(eventId, newCount, ct);

        return Results.NoContent();
    }

    private static async Task<IResult> KickAttendee(
        Guid eventId,
        Guid userId,
        bool revokeInvitation,
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

        var evt = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return Results.NotFound(new { error = "Event not found." });

        if (evt.OwnerId == userId)
            return Results.BadRequest(new { error = "Cannot remove the event owner." });

        var participant = await db.EventParticipants
            .Include(p => p.User)
            .FirstOrDefaultAsync(p => p.EventId == eventId && p.UserId == userId, ct);

        if (participant is null)
            return Results.NotFound(new { error = "Attendee not found." });

        var kickedEmail = participant.User.Email;

        db.EventParticipants.Remove(participant);

        var invitationRevoked = false;
        if (revokeInvitation)
        {
            var invitations = await db.EventInvitations
                .Where(i => i.EventId == eventId && i.Email.ToLower() == kickedEmail.ToLower())
                .ToListAsync(ct);
            if (invitations.Count > 0)
            {
                db.EventInvitations.RemoveRange(invitations);
                invitationRevoked = true;
            }
        }

        await db.SaveChangesAsync(ct);

        var newCount = await db.EventParticipants.CountAsync(p => p.EventId == eventId, ct);
        await realtime.ParticipantChangedAsync(eventId, newCount, ct);

        return Results.Ok(new { removed = true, invitationRevoked });
    }

    private static async Task<IResult> UpdateEvent(
        Guid eventId,
        UpdateEventRequest request,
        IValidator<UpdateEventRequest> validator,
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

        var evt = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return Results.NotFound(new { error = "Event not found." });

        if (ValidationError(await validator.ValidateAsync(request, ct)) is { } validationError)
            return validationError;

        // Unlisted events must be invite-only
        var joinMode = request.Visibility == EventVisibility.Unlisted
            ? JoinMode.InviteOnly
            : request.JoinMode;

        evt.Title = request.Title.Trim();
        evt.Location = request.Location.Trim();
        evt.Description = request.Description;
        evt.Start = request.Start;
        evt.End = request.End;
        evt.Visibility = request.Visibility;
        evt.JoinMode = joinMode;
        evt.Capacity = request.Capacity;
        evt.Cost = request.Cost;
        evt.Currency = request.Currency;
        evt.UpdatedAt = DateTime.UtcNow;

        db.Events.Update(evt);
        await db.SaveChangesAsync(ct);

        await realtime.EventUpdatedAsync(eventId, ct);

        return Results.Ok(new
        {
            evt.Id,
            evt.Title,
            evt.Location,
            evt.Description,
            evt.Start,
            evt.End,
            evt.Visibility,
            evt.JoinMode,
            evt.Capacity,
            evt.Cost,
            evt.Currency
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

        var targetUser = await db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == request.Email.ToLower(), ct);
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
                FullName = p.User.FullName,
                DisplayName = p.User.DisplayName ?? p.User.FullName ?? p.User.Email,
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
                FullName = c.User.FullName,
                DisplayName = c.User.DisplayName ?? c.User.FullName ?? c.User.Email
            })
            .ToListAsync(ct);

        var joinedEmails = attendees.Select(a => a.Email).ToHashSet(StringComparer.OrdinalIgnoreCase);

        var pendingInvitations = await db.EventInvitations
            .Where(i => i.EventId == eventId && !joinedEmails.Contains(i.Email))
            .Select(i => new
            {
                i.Email,
                InvitedAt = i.CreatedAt
            })
            .OrderBy(i => i.InvitedAt)
            .ToListAsync(ct);

        return Results.Ok(new { attendees, coAdmins, pendingInvitations });
    }

    private static async Task<IResult> GetParticipants(
        Guid eventId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var evt = await db.Events.AsNoTracking().FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return Results.NotFound(new { error = "Event not found." });

        if (evt.Visibility != EventVisibility.Public)
        {
            var keycloakId = GetKeycloakId(user);
            var dbUser = keycloakId is not null
                ? await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct)
                : null;

            if (dbUser is null
                || (evt.OwnerId != dbUser.Id
                    && !await db.EventParticipants.AnyAsync(p => p.EventId == eventId && p.UserId == dbUser.Id, ct)
                    && !await db.EventCoAdmins.AnyAsync(ca => ca.EventId == eventId && ca.UserId == dbUser.Id, ct)
                    && !await db.EventInvitations.AnyAsync(i => i.EventId == eventId && i.Email.ToLower() == dbUser.Email.ToLower(), ct)))
                return Results.NotFound(new { error = "Event not found." });
        }

        var coAdminUserIds = (await db.EventCoAdmins
            .Where(ca => ca.EventId == eventId)
            .Select(ca => ca.UserId)
            .ToListAsync(ct))
            .ToHashSet();

        var participantsRaw = await db.EventParticipants
            .Where(p => p.EventId == eventId)
            .OrderBy(p => p.JoinedAt)
            .Select(p => new
            {
                p.UserId,
                p.User.KeycloakId,
                p.User.DisplayName,
                p.User.FullName,
                p.User.Email,
                ProfilePictureUrl = p.User.ScaledPicturePath != null ? $"/api/profile/picture/{p.User.KeycloakId}" : null
            })
            .ToListAsync(ct);

        var participants = participantsRaw.Select(p => new
        {
            p.KeycloakId,
            DisplayName = p.DisplayName ?? p.FullName ?? (p.Email != null ? MaskEmail(p.Email) : "Anonymous Attendee"),
            p.ProfilePictureUrl,
            Role = p.UserId == evt.OwnerId ? "owner"
                 : coAdminUserIds.Contains(p.UserId) ? "co-host"
                 : "attendee"
        });

        return Results.Ok(participants);

        // Local function to mask email addresses (e.g. t***@gmail.com)
        static string MaskEmail(string email)
        {
            var at = email.IndexOf('@');
            if (at <= 1) return "***@" + email.Split('@').Last();
            return email[0] + new string('*', Math.Max(1, at - 1)) + email.Substring(at);
        }
    }

    private static async Task<IResult> UpdatePayment(
        Guid eventId,
        Guid userId,
        UpdatePaymentRequest request,
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

        var participant = await db.EventParticipants
            .FirstOrDefaultAsync(p => p.EventId == eventId && p.UserId == userId, ct);

        if (participant is null)
            return Results.NotFound(new { error = "Attendee not found." });

        participant.HasPaid = request.HasPaid;
        db.EventParticipants.Update(participant);
        await db.SaveChangesAsync(ct);

        var participantCount = await db.EventParticipants.CountAsync(p => p.EventId == eventId, ct);
        await realtime.ParticipantChangedAsync(eventId, participantCount, ct);

        return Results.Ok(new { userId, hasPaid = request.HasPaid });
    }

    private static async Task<IResult> UploadEventPicture(
        Guid eventId,
        HttpRequest request,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        EventImageStorage imageStorage,
        IRealtimeNotifier realtime,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventAdmin(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        var form = await request.ReadFormAsync(ct);
        var file = form.Files.GetFile("picture");
        if (file is null || file.Length == 0)
            return Results.BadRequest(new { error = "No picture uploaded." });

        if (file.Length > 10 * 1024 * 1024)
            return Results.BadRequest(new { error = "File too large. Maximum 10MB." });

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms, ct);
        var imageData = ms.ToArray();

        try
        {
            var url = await imageStorage.UploadEventPictureAsync(eventId, imageData, ct);

            var evt = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
            if (evt is not null)
            {
                evt.PicturePath = url;
                evt.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
                await realtime.EventUpdatedAsync(eventId, ct);
            }

            return Results.Ok(new { url });
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(new { error = ex.Message });
        }
    }

    private static async Task<IResult> UploadEventImage(
        Guid eventId,
        IFormFile file,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        EventImageStorage imageStorage,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventAdmin(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        if (file.Length == 0)
            return Results.BadRequest(new { error = "File is empty." });

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
}

public record CreateEventRequest(
    string Title,
    string Location,
    string? Description,
    DateTime Start,
    DateTime End,
    EventVisibility Visibility,
    JoinMode JoinMode,
    int? Capacity,
    decimal? Cost,
    string Currency = "EUR");

public record InviteUsersRequest(List<string> Emails);

public record UpdateEventRequest(
    string Title,
    string Location,
    string? Description,
    DateTime Start,
    DateTime End,
    EventVisibility Visibility,
    JoinMode JoinMode,
    int? Capacity,
    decimal? Cost,
    string Currency = "EUR");

public record AddCoAdminRequest(string Email);

public record UpdatePaymentRequest(bool HasPaid);
