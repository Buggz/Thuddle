using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;
using Thuddle.Api.Realtime;
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
        var isMember = dbUser is not null && await IsMember(db, eventId, dbUser.Id, ct);

        // Get the user's last read timestamp before updating it
        DateTime? lastReadAt = null;
        if (dbUser is not null)
        {
            var receipt = await db.DiscussionReadReceipts
                .FirstOrDefaultAsync(r => r.UserId == dbUser.Id && r.EventId == eventId, ct);

            lastReadAt = receipt?.LastReadAt;

            // Upsert the read receipt
            if (receipt is not null)
            {
                receipt.LastReadAt = DateTime.UtcNow;
                db.DiscussionReadReceipts.Update(receipt);
            }
            else
            {
                db.DiscussionReadReceipts.Add(new DiscussionReadReceipt
                {
                    Id = Guid.NewGuid(),
                    UserId = dbUser.Id,
                    EventId = eventId,
                    LastReadAt = DateTime.UtcNow
                });
            }
            await db.SaveChangesAsync(ct);
        }

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
                ProfilePictureUrl = p.Author.ScaledPicturePath != null ? $"/api/profile/picture/{p.Author.KeycloakId}" : null,
                CommentCount = db.DiscussionComments.Count(c => c.PostId == p.Id),
                LatestCommentAt = db.DiscussionComments
                    .Where(c => c.PostId == p.Id)
                    .Max(c => (DateTime?)c.CreatedAt),
                IsOwnPost = dbUser != null && p.AuthorId == dbUser.Id
            })
            .ToListAsync(ct);

        return Results.Ok(new
        {
            posts,
            lastReadAt,
            isAdmin,
            isMember,
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
        IServiceProvider serviceProvider,
        IRealtimeNotifier realtime,
        ILoggerFactory loggerFactory,
        CancellationToken ct)
    {
        var logger = loggerFactory.CreateLogger(nameof(DiscussionEndpoints));
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

        // Mark the author as having read up to this point so their own post doesn't show as unread
        var receipt = await db.DiscussionReadReceipts
            .FirstOrDefaultAsync(r => r.EventId == eventId && r.UserId == dbUser.Id, ct);
        if (receipt is not null)
        {
            receipt.LastReadAt = post.CreatedAt;
            db.DiscussionReadReceipts.Update(receipt);
        }
        else
        {
            db.DiscussionReadReceipts.Add(new DiscussionReadReceipt
            {
                EventId = eventId,
                UserId = dbUser.Id,
                LastReadAt = post.CreatedAt
            });
        }

        await db.SaveChangesAsync(ct);

        if (isApproved)
            await realtime.DiscussionActivityAsync(eventId, ct);

        if (isAdmin)
        {
            _ = Task.Run(async () =>
            {
                using var scope = serviceProvider.CreateScope();
                var scopedDb = scope.ServiceProvider.GetRequiredService<ThuddleDbContext>();
                var scopedEmailSender = scope.ServiceProvider.GetRequiredService<SmtpEmailSender>();
                var scopedConfig = scope.ServiceProvider.GetRequiredService<IConfiguration>();
                await SendPostEmailToAttendeesAsync(evt, post, dbUser, scopedDb, scopedEmailSender, scopedConfig, logger);
            }, CancellationToken.None);
        }
        else
        {
            _ = Task.Run(async () =>
            {
                using var scope = serviceProvider.CreateScope();
                var scopedDb = scope.ServiceProvider.GetRequiredService<ThuddleDbContext>();
                var scopedEmailSender = scope.ServiceProvider.GetRequiredService<SmtpEmailSender>();
                var scopedConfig = scope.ServiceProvider.GetRequiredService<IConfiguration>();
                await SendPostEmailToHostsAsync(evt, post, dbUser, scopedDb, scopedEmailSender, scopedConfig, logger);
            }, CancellationToken.None);
        }

        return Results.Created($"/api/events/{eventId}/discussion/{post.Id}", new
        {
            post.Id,
            post.Content,
            post.IsApproved,
            post.CreatedAt,
            AuthorName = dbUser.DisplayName ?? dbUser.Email,
            AuthorKeycloakId = dbUser.KeycloakId,
            ProfilePictureUrl = dbUser.ScaledPicturePath != null ? $"/api/profile/picture/{dbUser.KeycloakId}" : null,
            CommentCount = 0,
            IsOwnPost = true
        });
    }

    private static string BuildPostEmailHtml(Event evt, DiscussionPost post, User author, string baseUrl)
    {
        var eventUrl = $"{baseUrl}/events/{evt.Id}";
        var authorName = author.DisplayName ?? author.Email;
        var emailContent = post.Content;
        var hasImages = Regex.IsMatch(emailContent, @"<img\b", RegexOptions.IgnoreCase);
        if (hasImages)
            emailContent = Regex.Replace(emailContent, @"<img\b[^>]*>", "<p style=\"color:#6b7280; font-style:italic;\">[image]</p>", RegexOptions.IgnoreCase);
        var imageHint = hasImages
            ? $"""<p style="margin-top:12px;"><a href="{eventUrl}" style="color:#4f46e5; text-decoration:underline;">View the full post with images</a></p>"""
            : "";
        return $"""
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7; padding:40px 0; font-family: sans-serif;">
                <tr>
                    <td align="center">
                        <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);">
                            <tr>
                                <td style="background-color:#4f46e5; padding:28px 40px; text-align:center;">
                                    <a href="{baseUrl}" style="text-decoration:none;"><h1 style="margin:0; font-size:26px; font-weight:700; color:#ffffff; letter-spacing:-0.5px;">Thuddle</h1></a>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:36px 40px 40px;">
                                    <h2 style="margin-top:0; color: #4f46e5;"><a href="{eventUrl}" style="color:#4f46e5; text-decoration:none;">New update in {System.Net.WebUtility.HtmlEncode(evt.Title)}</a></h2>
                                    <p style="color: #6b7280;">Posted by {System.Net.WebUtility.HtmlEncode(authorName)}</p>
                                    <div style="padding: 16px; background: #f9fafb; border-radius: 8px; margin: 16px 0;">
                                        {emailContent}
                                    </div>
                                    {imageHint}
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:20px 40px 28px; border-top:1px solid #e5e7eb; text-align:center;">
                                    <p style="margin:0; font-size:13px; color:#9ca3af; line-height:1.5;">
                                        This email was sent by <a href="{baseUrl}" style="color:#4f46e5; text-decoration:none;">Thuddle</a>.<br>
                                        If you didn't request this, you can safely ignore it.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
            """;
    }

    private static async Task SendPostEmailToAttendeesAsync(
        Event evt, DiscussionPost post, User author,
        ThuddleDbContext db, SmtpEmailSender emailSender, IConfiguration config,
        ILogger logger)
    {
        try
        {
            var emails = await db.EventParticipants
                .AsNoTracking()
                .Where(p => p.EventId == evt.Id)
                .Select(p => p.User.Email)
                .ToListAsync();

            if (evt.JoinMode == JoinMode.InviteOnly)
            {
                var inviteeEmails = await db.EventInvitations
                    .AsNoTracking()
                    .Where(i => i.EventId == evt.Id)
                    .Select(i => i.Email)
                    .ToListAsync();
                emails.AddRange(inviteeEmails);
            }

            var hostEmails = await db.Users
                .AsNoTracking()
                .Where(u => u.Id == evt.OwnerId || db.EventCoAdmins.Any(c => c.EventId == evt.Id && c.UserId == u.Id))
                .Select(u => u.Email)
                .ToListAsync();
            emails.AddRange(hostEmails);

            emails = emails.Distinct(StringComparer.OrdinalIgnoreCase).ToList();

            var baseUrl = config["App:BaseUrl"] ?? "https://thuddle.app";
            var authorName = author.DisplayName ?? author.Email;
            var subject = $"[{evt.Title}] New update from {authorName}";
            var htmlBody = BuildPostEmailHtml(evt, post, author, baseUrl);

            logger.LogInformation("Dispatching discussion post email for post {PostId} in event {EventId} to {RecipientCount} recipients ({Audience})", post.Id, evt.Id, emails.Count, "attendees");

            foreach (var email in emails)
            {
                try { await emailSender.SendEmailAsync(email, subject, htmlBody); }
                catch (Exception ex) { logger.LogWarning(ex, "Failed to send discussion email to {Email} for post {PostId} in event {EventId}", email, post.Id, evt.Id); }
            }
        }
        catch (Exception ex) { logger.LogError(ex, "Failed to send discussion post emails for post {PostId} in event {EventId}", post.Id, evt.Id); }
    }

    private static async Task SendPostEmailToHostsAsync(
        Event evt, DiscussionPost post, User author,
        ThuddleDbContext db, SmtpEmailSender emailSender, IConfiguration config,
        ILogger logger)
    {
        try
        {
            var emails = await db.Users
                .AsNoTracking()
                .Where(u => u.Id == evt.OwnerId || db.EventCoAdmins.Any(c => c.EventId == evt.Id && c.UserId == u.Id))
                .Select(u => u.Email)
                .ToListAsync();

            emails = emails.Distinct(StringComparer.OrdinalIgnoreCase).ToList();

            var baseUrl = config["App:BaseUrl"] ?? "https://thuddle.app";
            var authorName = author.DisplayName ?? author.Email;
            var subject = $"[{evt.Title}] New update from {authorName}";
            var htmlBody = BuildPostEmailHtml(evt, post, author, baseUrl);

            logger.LogInformation("Dispatching discussion post email for post {PostId} in event {EventId} to {RecipientCount} recipients ({Audience})", post.Id, evt.Id, emails.Count, "hosts-only");

            foreach (var email in emails)
            {
                try { await emailSender.SendEmailAsync(email, subject, htmlBody); }
                catch (Exception ex) { logger.LogWarning(ex, "Failed to send discussion email to {Email} for post {PostId} in event {EventId}", email, post.Id, evt.Id); }
            }
        }
        catch (Exception ex) { logger.LogError(ex, "Failed to send discussion post emails for post {PostId} in event {EventId}", post.Id, evt.Id); }
    }

    // PUT /api/events/{eventId}/discussion/{postId}/approve
    private static async Task<IResult> ApprovePost(
        Guid eventId,
        Guid postId,
        ApprovePostRequest request,
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

        var post = await db.DiscussionPosts.FirstOrDefaultAsync(p => p.Id == postId && p.EventId == eventId, ct);
        if (post is null) return Results.NotFound(new { error = "Post not found." });

        var wasApproved = post.IsApproved;
        post.IsApproved = request.Approved;
        post.UpdatedAt = DateTime.UtcNow;
        db.DiscussionPosts.Update(post);
        await db.SaveChangesAsync(ct);

        if (!wasApproved && post.IsApproved)
            await realtime.DiscussionActivityAsync(eventId, ct);

        return Results.Ok(new { post.Id, post.IsApproved });
    }

    // DELETE /api/events/{eventId}/discussion/{postId}
    private static async Task<IResult> DeletePost(
        Guid eventId,
        Guid postId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
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

        await realtime.DiscussionActivityAsync(eventId, ct);

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
                ProfilePictureUrl = c.Author.ScaledPicturePath != null ? $"/api/profile/picture/{c.Author.KeycloakId}" : null
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
        IRealtimeNotifier realtime,
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

        // Mark the author as having read up to this point so their own comment doesn't show as unread
        var receipt = await db.DiscussionReadReceipts
            .FirstOrDefaultAsync(r => r.EventId == eventId && r.UserId == dbUser.Id, ct);
        if (receipt is not null)
        {
            receipt.LastReadAt = comment.CreatedAt;
            db.DiscussionReadReceipts.Update(receipt);
        }
        else
        {
            db.DiscussionReadReceipts.Add(new DiscussionReadReceipt
            {
                EventId = eventId,
                UserId = dbUser.Id,
                LastReadAt = comment.CreatedAt
            });
        }

        await db.SaveChangesAsync(ct);

        // Broadcast authoritative comment count + latest timestamp so clients
        // can replace state without refetching or doing additive arithmetic.
        var commentCount = await db.DiscussionComments.CountAsync(c => c.PostId == postId, ct);
        var latestCommentAt = await db.DiscussionComments
            .Where(c => c.PostId == postId)
            .MaxAsync(c => (DateTime?)c.CreatedAt, ct);
        await realtime.CommentCountChangedAsync(eventId, postId, commentCount, latestCommentAt, ct);
        // Also fire DiscussionActivity so dashboard/event header refreshes
        // unread markers and totals for other viewers.
        await realtime.DiscussionActivityAsync(eventId, ct);

        return Results.Created($"/api/events/{eventId}/discussion/{postId}/comments/{comment.Id}", new
        {
            comment.Id,
            comment.Content,
            comment.CreatedAt,
            AuthorName = dbUser.DisplayName ?? dbUser.Email,
            AuthorKeycloakId = dbUser.KeycloakId,
            ProfilePictureUrl = dbUser.ScaledPicturePath != null ? $"/api/profile/picture/{dbUser.KeycloakId}" : null
        });
    }

    // DELETE /api/events/{eventId}/discussion/{postId}/comments/{commentId}
    private static async Task<IResult> DeleteComment(
        Guid eventId,
        Guid postId,
        Guid commentId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
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

        var commentCount = await db.DiscussionComments.CountAsync(c => c.PostId == postId, ct);
        var latestCommentAt = await db.DiscussionComments
            .Where(c => c.PostId == postId)
            .MaxAsync(c => (DateTime?)c.CreatedAt, ct);
        await realtime.CommentCountChangedAsync(eventId, postId, commentCount, latestCommentAt, ct);
        await realtime.DiscussionActivityAsync(eventId, ct);

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

public record CreatePostRequest(string Content);
public record ApprovePostRequest(bool Approved);
public record CreateCommentRequest(string Content);
public record UpdateDiscussionSettingsRequest(
    int MemberPostPolicy,
    int NonMemberPostPolicy,
    bool AllowNonMemberPosts,
    bool AllowNonMemberComments);
