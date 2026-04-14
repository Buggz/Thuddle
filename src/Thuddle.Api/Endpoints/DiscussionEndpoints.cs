using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;
using Thuddle.Api.Services;

namespace Thuddle.Api.Endpoints;

public static class DiscussionEndpoints
{
    public static void MapDiscussionEndpoints(this WebApplication app)
    {
        app.MapGet("/api/events/{eventId:guid}/discussion", GetPosts).AllowAnonymous();
        app.MapPost("/api/events/{eventId:guid}/discussion", CreatePost).RequireAuthorization();
        app.MapPut("/api/events/{eventId:guid}/discussion/{postId:guid}/approve", ApprovePost).RequireAuthorization();
        app.MapDelete("/api/events/{eventId:guid}/discussion/{postId:guid}", DeletePost).RequireAuthorization();
        app.MapGet("/api/events/{eventId:guid}/discussion/{postId:guid}/comments", GetComments).AllowAnonymous();
        app.MapPost("/api/events/{eventId:guid}/discussion/{postId:guid}/comments", CreateComment).RequireAuthorization();
        app.MapDelete("/api/events/{eventId:guid}/discussion/{postId:guid}/comments/{commentId:guid}", DeleteComment).RequireAuthorization();
        app.MapPut("/api/events/{eventId:guid}/discussion-settings", UpdateDiscussionSettings).RequireAuthorization();
        app.MapGet("/api/events/{eventId:guid}/discussion-settings", GetDiscussionSettings).RequireAuthorization();
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

    private static async Task<bool> IsMember(ThuddleDbContext db, Guid eventId, Guid userId, CancellationToken ct)
    {
        return await IsEventAdmin(db, eventId, userId, ct)
            || await db.EventParticipants.AnyAsync(p => p.EventId == eventId && p.UserId == userId, ct);
    }

    // GET /api/events/{eventId}/discussion
    private static async Task<IResult> GetPosts(
        Guid eventId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var evt = await db.Events.AsNoTracking().FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return Results.NotFound(new { error = "Event not found." });

        var keycloakId = GetKeycloakId(user);
        var dbUser = keycloakId is not null
            ? await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct)
            : null;

        var isAdmin = dbUser is not null && await IsEventAdmin(db, eventId, dbUser.Id, ct);

        var query = db.DiscussionPosts
            .AsNoTracking()
            .Where(p => p.EventId == eventId);

        // Non-admins only see approved posts (plus their own)
        if (!isAdmin)
        {
            var userId = dbUser?.Id ?? Guid.Empty;
            query = query.Where(p => p.IsApproved || p.AuthorId == userId);
        }

        var posts = await query
            .OrderByDescending(p => p.CreatedAt)
            .Select(p => new
            {
                p.Id,
                p.Content,
                p.IsApproved,
                p.CreatedAt,
                p.UpdatedAt,
                AuthorId = p.AuthorId,
                AuthorName = p.Author.DisplayName ?? p.Author.Email,
                AuthorKeycloakId = p.Author.KeycloakId,
                HasProfilePicture = p.Author.ScaledPicturePath != null,
                CommentCount = db.DiscussionComments.Count(c => c.PostId == p.Id),
                IsOwnPost = dbUser != null && p.AuthorId == dbUser.Id
            })
            .ToListAsync(ct);

        return Results.Ok(new
        {
            posts,
            isAdmin,
            settings = new
            {
                memberPostPolicy = (int)evt.MemberPostPolicy,
                nonMemberPostPolicy = (int)evt.NonMemberPostPolicy,
                allowNonMemberPosts = evt.AllowNonMemberPosts,
                allowNonMemberComments = evt.AllowNonMemberComments
            }
        });
    }

    // POST /api/events/{eventId}/discussion
    private static async Task<IResult> CreatePost(
        Guid eventId,
        CreatePostRequest request,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        SmtpEmailSender emailSender,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var evt = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return Results.NotFound(new { error = "Event not found." });

        var isAdmin = await IsEventAdmin(db, eventId, dbUser.Id, ct);
        var isMember = isAdmin || await db.EventParticipants.AnyAsync(p => p.EventId == eventId && p.UserId == dbUser.Id, ct);

        if (!isAdmin && !isMember && !evt.AllowNonMemberPosts)
            return Results.Forbid();

        if (string.IsNullOrWhiteSpace(request.Content))
            return Results.BadRequest(new { error = "Content is required." });

        // Determine approval status
        bool isApproved;
        if (isAdmin)
        {
            isApproved = true;
        }
        else if (isMember)
        {
            isApproved = evt.MemberPostPolicy == ModerationPolicy.AutoApprove;
        }
        else
        {
            isApproved = evt.NonMemberPostPolicy == ModerationPolicy.AutoApprove;
        }

        var post = new DiscussionPost
        {
            Id = Guid.NewGuid(),
            EventId = eventId,
            AuthorId = dbUser.Id,
            Content = request.Content,
            IsApproved = isApproved,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        db.DiscussionPosts.Add(post);
        await db.SaveChangesAsync(ct);

        // Send email if requested and user is admin
        if (request.SendEmail && isAdmin)
        {
            _ = Task.Run(async () => await SendPostEmailAsync(evt, post, dbUser, db, emailSender), CancellationToken.None);
        }

        return Results.Created($"/api/events/{eventId}/discussion/{post.Id}", new
        {
            post.Id,
            post.Content,
            post.IsApproved,
            post.CreatedAt,
            AuthorName = dbUser.DisplayName ?? dbUser.Email,
            AuthorKeycloakId = dbUser.KeycloakId,
            HasProfilePicture = dbUser.ScaledPicturePath != null,
            CommentCount = 0,
            IsOwnPost = true
        });
    }

    private static async Task SendPostEmailAsync(
        Event evt, DiscussionPost post, User author,
        ThuddleDbContext db, SmtpEmailSender emailSender)
    {
        try
        {
            // Get attendee emails
            var emails = await db.EventParticipants
                .AsNoTracking()
                .Where(p => p.EventId == evt.Id)
                .Select(p => p.User.Email)
                .ToListAsync();

            // Include invitees for invite-only events
            if (evt.JoinMode == JoinMode.InviteOnly)
            {
                var inviteeEmails = await db.EventInvitations
                    .AsNoTracking()
                    .Where(i => i.EventId == evt.Id)
                    .Select(i => i.Email)
                    .ToListAsync();
                emails.AddRange(inviteeEmails);
            }

            emails = emails.Distinct(StringComparer.OrdinalIgnoreCase).ToList();

            var authorName = author.DisplayName ?? author.Email;
            var subject = $"[{evt.Title}] New update from {authorName}";
            var htmlBody = $"""
                <div style="font-family: sans-serif; max-width: 600px;">
                    <h2 style="color: #4f46e5;">New update in {System.Net.WebUtility.HtmlEncode(evt.Title)}</h2>
                    <p style="color: #6b7280;">Posted by {System.Net.WebUtility.HtmlEncode(authorName)}</p>
                    <div style="padding: 16px; background: #f9fafb; border-radius: 8px; margin: 16px 0;">
                        {post.Content}
                    </div>
                </div>
                """;

            foreach (var email in emails)
            {
                try { await emailSender.SendEmailAsync(email, subject, htmlBody); }
                catch { /* ignore individual failures */ }
            }
        }
        catch { /* ignore */ }
    }

    // PUT /api/events/{eventId}/discussion/{postId}/approve
    private static async Task<IResult> ApprovePost(
        Guid eventId,
        Guid postId,
        ApprovePostRequest request,
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

        var post = await db.DiscussionPosts.FirstOrDefaultAsync(p => p.Id == postId && p.EventId == eventId, ct);
        if (post is null) return Results.NotFound(new { error = "Post not found." });

        post.IsApproved = request.Approved;
        post.UpdatedAt = DateTime.UtcNow;
        db.DiscussionPosts.Update(post);
        await db.SaveChangesAsync(ct);

        return Results.Ok(new { post.Id, post.IsApproved });
    }

    // DELETE /api/events/{eventId}/discussion/{postId}
    private static async Task<IResult> DeletePost(
        Guid eventId,
        Guid postId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var post = await db.DiscussionPosts.FirstOrDefaultAsync(p => p.Id == postId && p.EventId == eventId, ct);
        if (post is null) return Results.NotFound(new { error = "Post not found." });

        var isAdmin = await IsEventAdmin(db, eventId, dbUser.Id, ct);
        if (!isAdmin && post.AuthorId != dbUser.Id)
            return Results.Forbid();

        db.DiscussionPosts.Remove(post);
        await db.SaveChangesAsync(ct);

        return Results.Ok(new { deleted = true });
    }

    // GET /api/events/{eventId}/discussion/{postId}/comments
    private static async Task<IResult> GetComments(
        Guid eventId,
        Guid postId,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var postExists = await db.DiscussionPosts.AsNoTracking()
            .AnyAsync(p => p.Id == postId && p.EventId == eventId, ct);
        if (!postExists) return Results.NotFound(new { error = "Post not found." });

        var comments = await db.DiscussionComments
            .AsNoTracking()
            .Where(c => c.PostId == postId)
            .OrderBy(c => c.CreatedAt)
            .Select(c => new
            {
                c.Id,
                c.Content,
                c.CreatedAt,
                AuthorName = c.Author.DisplayName ?? c.Author.Email,
                AuthorKeycloakId = c.Author.KeycloakId,
                HasProfilePicture = c.Author.ScaledPicturePath != null
            })
            .ToListAsync(ct);

        return Results.Ok(comments);
    }

    // POST /api/events/{eventId}/discussion/{postId}/comments
    private static async Task<IResult> CreateComment(
        Guid eventId,
        Guid postId,
        CreateCommentRequest request,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var evt = await db.Events.AsNoTracking().FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return Results.NotFound(new { error = "Event not found." });

        var post = await db.DiscussionPosts.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == postId && p.EventId == eventId, ct);
        if (post is null) return Results.NotFound(new { error = "Post not found." });

        var isAdmin = await IsEventAdmin(db, eventId, dbUser.Id, ct);
        var isMember = isAdmin || await db.EventParticipants.AnyAsync(p => p.EventId == eventId && p.UserId == dbUser.Id, ct);

        if (!isAdmin && !isMember && !evt.AllowNonMemberComments)
            return Results.Forbid();

        if (string.IsNullOrWhiteSpace(request.Content))
            return Results.BadRequest(new { error = "Content is required." });

        var comment = new DiscussionComment
        {
            Id = Guid.NewGuid(),
            PostId = postId,
            AuthorId = dbUser.Id,
            Content = request.Content,
            CreatedAt = DateTime.UtcNow
        };

        db.DiscussionComments.Add(comment);
        await db.SaveChangesAsync(ct);

        return Results.Created($"/api/events/{eventId}/discussion/{postId}/comments/{comment.Id}", new
        {
            comment.Id,
            comment.Content,
            comment.CreatedAt,
            AuthorName = dbUser.DisplayName ?? dbUser.Email,
            AuthorKeycloakId = dbUser.KeycloakId,
            HasProfilePicture = dbUser.ScaledPicturePath != null
        });
    }

    // DELETE /api/events/{eventId}/discussion/{postId}/comments/{commentId}
    private static async Task<IResult> DeleteComment(
        Guid eventId,
        Guid postId,
        Guid commentId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var comment = await db.DiscussionComments
            .FirstOrDefaultAsync(c => c.Id == commentId && c.PostId == postId, ct);
        if (comment is null) return Results.NotFound(new { error = "Comment not found." });

        var isAdmin = await IsEventAdmin(db, eventId, dbUser.Id, ct);
        if (!isAdmin && comment.AuthorId != dbUser.Id)
            return Results.Forbid();

        db.DiscussionComments.Remove(comment);
        await db.SaveChangesAsync(ct);

        return Results.Ok(new { deleted = true });
    }

    // GET /api/events/{eventId}/discussion-settings
    private static async Task<IResult> GetDiscussionSettings(
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

        var evt = await db.Events.AsNoTracking().FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return Results.NotFound(new { error = "Event not found." });

        return Results.Ok(new
        {
            memberPostPolicy = (int)evt.MemberPostPolicy,
            nonMemberPostPolicy = (int)evt.NonMemberPostPolicy,
            allowNonMemberPosts = evt.AllowNonMemberPosts,
            allowNonMemberComments = evt.AllowNonMemberComments
        });
    }

    // PUT /api/events/{eventId}/discussion-settings
    private static async Task<IResult> UpdateDiscussionSettings(
        Guid eventId,
        UpdateDiscussionSettingsRequest request,
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

        evt.MemberPostPolicy = (ModerationPolicy)request.MemberPostPolicy;
        evt.NonMemberPostPolicy = (ModerationPolicy)request.NonMemberPostPolicy;
        evt.AllowNonMemberPosts = request.AllowNonMemberPosts;
        evt.AllowNonMemberComments = request.AllowNonMemberComments;
        evt.UpdatedAt = DateTime.UtcNow;

        db.Events.Update(evt);
        await db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            memberPostPolicy = (int)evt.MemberPostPolicy,
            nonMemberPostPolicy = (int)evt.NonMemberPostPolicy,
            allowNonMemberPosts = evt.AllowNonMemberPosts,
            allowNonMemberComments = evt.AllowNonMemberComments
        });
    }
}

public record CreatePostRequest(string Content, bool SendEmail);
public record ApprovePostRequest(bool Approved);
public record CreateCommentRequest(string Content);
public record UpdateDiscussionSettingsRequest(
    int MemberPostPolicy,
    int NonMemberPostPolicy,
    bool AllowNonMemberPosts,
    bool AllowNonMemberComments);
