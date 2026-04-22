using System.Security.Claims;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Thuddle.Api.Data;
using Thuddle.Api.Realtime;
using Thuddle.Api.Services;

namespace Thuddle.Api.Endpoints;

public static class AuctionEndpoints
{
    public static void MapAuctionEndpoints(this WebApplication app)
    {
        // Settings
        app.MapGet("/api/events/{eventId:guid}/auction", GetAuctionSettings).AllowAnonymous();
        app.MapPut("/api/events/{eventId:guid}/auction", UpsertAuctionSettings).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/auction/start", StartAuction).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/auction/submitters", ManageSubmitters).RequireAuthorization();
        app.MapGet("/api/events/{eventId:guid}/auction/submitters", GetSubmitters).RequireAuthorization();

        // Items
        app.MapGet("/api/events/{eventId:guid}/auction/items", GetItems).RequireAuthorization();
        app.MapGet("/api/events/{eventId:guid}/auction/items/{itemId:guid}", GetItem).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/auction/items", CreateItem).RequireAuthorization();
        app.MapPut("/api/events/{eventId:guid}/auction/items/{itemId:guid}", UpdateItem).RequireAuthorization();
        app.MapDelete("/api/events/{eventId:guid}/auction/items/{itemId:guid}", DeleteItem).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/auction/items/{itemId:guid}/images", UploadItemImage).RequireAuthorization().DisableAntiforgery();
        app.MapDelete("/api/events/{eventId:guid}/auction/items/{itemId:guid}/images/{imageId:guid}", DeleteItemImage).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/auction/items/{itemId:guid}/approve", ApproveItem).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/auction/items/{itemId:guid}/publish", PublishItem).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/auction/items/{itemId:guid}/unpublish", UnpublishItem).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/auction/items/{itemId:guid}/reject", RejectItem).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/auction/items/{itemId:guid}/resubmit", ResubmitItem).RequireAuthorization();
        app.MapGet("/api/events/{eventId:guid}/auction/items/moderation", GetModerationQueue).RequireAuthorization();

        // Bans
        app.MapGet("/api/events/{eventId:guid}/auction/bans", ListBans).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/auction/bans", BanUser).RequireAuthorization();
        app.MapDelete("/api/events/{eventId:guid}/auction/bans/{userId:guid}", LiftBan).RequireAuthorization();

        // Bidding
        app.MapPost("/api/events/{eventId:guid}/auction/items/{itemId:guid}/bids", PlaceBid).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/auction/items/{itemId:guid}/buyout", Buyout).RequireAuthorization();
        app.MapGet("/api/events/{eventId:guid}/auction/items/{itemId:guid}/bids", GetBids).RequireAuthorization();
    }

    private static string? GetKeycloakId(ClaimsPrincipal user) =>
        user.FindFirstValue("sub") ?? user.FindFirstValue("sid") ?? user.FindFirstValue("email");

    private static async Task<bool> IsEventAdmin(ThuddleDbContext db, Guid eventId, Guid userId, CancellationToken ct)
    {
        var evt = await db.Events.FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return false;
        if (evt.OwnerId == userId) return true;
        return await db.EventCoAdmins.AnyAsync(c => c.EventId == eventId && c.UserId == userId, ct);
    }

    private static IResult? ValidationError(FluentValidation.Results.ValidationResult result)
    {
        if (result.IsValid) return null;
        return Results.BadRequest(new { error = result.Errors[0].ErrorMessage });
    }

    // ─── Settings ────────────────────────────────────────────────

    private static async Task<IResult> GetAuctionSettings(
        Guid eventId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var evt = await db.Events.AsNoTracking().FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return Results.NotFound(new { error = "Event not found." });

        // Mirror event visibility check
        var keycloakId = GetKeycloakId(user);
        var dbUser = keycloakId is not null
            ? await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct)
            : null;

        if (dbUser is null && evt.Visibility != EventVisibility.Public)
            return Results.NotFound(new { error = "Event not found." });

        var settings = await db.EventAuctionSettings.AsNoTracking()
            .FirstOrDefaultAsync(s => s.EventId == eventId, ct);

        if (settings is null)
            return Results.Ok(new { configured = false, eventStart = evt.Start, eventEnd = evt.End, serverTime = DateTime.UtcNow });

        var isAdmin = dbUser is not null && await IsEventAdmin(db, eventId, dbUser.Id, ct);

        return Results.Ok(new
        {
            configured = true,
            settings.Enabled,
            status = settings.Status.ToString(),
            settings.StartsAt,
            settings.LatestEndsAt,
            earliestEndsAt = settings.EarliestEndsAt,
            // SealedEndsAt only visible to admins after ended
            sealedEndsAt = isAdmin && settings.Status == AuctionStatus.Ended ? settings.SealedEndsAt : null,
            veiledCloseWindow = settings.VeiledCloseWindow?.TotalSeconds,
            bidTimeExtension = settings.BidTimeExtension?.TotalSeconds,
            submissionMode = settings.SubmissionMode.ToString(),
            itemModerationPolicy = settings.ItemModerationPolicy.ToString(),
            settings.MinBidIncrement,
            settings.AllowBuyout,
            settings.AnonymousBidders,
            settings.AnonymousSubmitters,
            eventStart = evt.Start,
            eventEnd = evt.End,
            currency = evt.Currency,
            serverTime = DateTime.UtcNow
        });
    }

    private static async Task<IResult> UpsertAuctionSettings(
        Guid eventId,
        UpdateAuctionSettingsRequest request,
        IValidator<UpdateAuctionSettingsRequest> validator,
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

        if (ValidationError(await validator.ValidateAsync(request, ct)) is { } validationError)
            return validationError;

        var evt = await db.Events.AsNoTracking().FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return Results.NotFound(new { error = "Event not found." });

        if (request.StartsAt.HasValue && request.StartsAt.Value < evt.Start)
            return Results.BadRequest(new { error = "Auction start cannot be before event start." });
        if (request.LatestEndsAt.HasValue && request.LatestEndsAt.Value > evt.End)
            return Results.BadRequest(new { error = "Auction end cannot be after event end." });

        var existing = await db.EventAuctionSettings.AsTracking()
            .FirstOrDefaultAsync(s => s.EventId == eventId, ct);

        if (existing is not null && existing.Status is AuctionStatus.Live or AuctionStatus.Ended)
        {
            return Results.Conflict(new { error = "Settings are locked while the auction is live or ended. Only the submitter list can be changed." });
        }

        var now = DateTime.UtcNow;

        if (existing is null)
        {
            existing = new EventAuctionSettings
            {
                EventId = eventId,
                CreatedAt = now
            };
            db.EventAuctionSettings.Add(existing);
        }

        var previousStatus = existing.Status;

        existing.Enabled = request.Enabled;
        existing.StartsAt = request.StartsAt;
        existing.LatestEndsAt = request.LatestEndsAt;
        existing.VeiledCloseWindow = request.VeiledCloseWindow;
        existing.BidTimeExtension = request.BidTimeExtension;
        existing.SubmissionMode = request.SubmissionMode;
        existing.ItemModerationPolicy = request.ItemModerationPolicy;
        existing.MinBidIncrement = request.MinBidIncrement;
        existing.AllowBuyout = request.AllowBuyout;
        existing.AnonymousBidders = request.AnonymousBidders;
        existing.AnonymousSubmitters = request.AnonymousSubmitters;
        existing.UpdatedAt = now;

        // Server-controlled status: auto-promote to Scheduled when settings are complete
        existing.Status = existing.Enabled
            && existing.StartsAt.HasValue
            && existing.LatestEndsAt.HasValue
            && existing.MinBidIncrement > 0
            && existing.StartsAt < existing.LatestEndsAt
            ? AuctionStatus.Scheduled
            : AuctionStatus.Draft;

        await db.SaveChangesAsync(ct);
        await realtime.AuctionSettingsChangedAsync(eventId, ct);

        if (existing.Status != previousStatus)
            await realtime.AuctionStatusChangedAsync(eventId, existing.Status.ToString(), ct);

        return Results.Ok(new { updated = true, locked = false, status = existing.Status.ToString() });
    }

    private static async Task<IResult> StartAuction(
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

        if (!await IsEventAdmin(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        var settings = await db.EventAuctionSettings.AsTracking()
            .FirstOrDefaultAsync(s => s.EventId == eventId, ct);

        if (settings is null)
            return Results.NotFound(new { error = "Auction not configured." });

        if (settings.Status != AuctionStatus.Scheduled)
        {
            var message = settings.Status switch
            {
                AuctionStatus.Draft => "Auction settings are incomplete. Ensure it is enabled and has valid start/end times before starting.",
                AuctionStatus.Live => "Auction is already live.",
                AuctionStatus.Ended => "Auction has already ended.",
                _ => $"Cannot start auction in {settings.Status} status."
            };
            return Results.BadRequest(new { error = message });
        }

        if (!settings.StartsAt.HasValue || !settings.LatestEndsAt.HasValue)
            return Results.BadRequest(new { error = "StartsAt and LatestEndsAt must be set." });

        // Compute sealed end time ONCE
        var earliest = settings.EarliestEndsAt!.Value;
        var latest = settings.LatestEndsAt.Value;
        settings.SealedEndsAt = AuctionService.SealRandomEndsAt(earliest, latest);
        settings.Status = AuctionStatus.Live;
        settings.UpdatedAt = DateTime.UtcNow;

        // Transition Scheduled items to Live when auction starts
        var scheduledItems = await db.AuctionItems
            .AsTracking()
            .Where(i => i.EventId == eventId && i.Status == AuctionItemStatus.Scheduled)
            .ToListAsync(ct);

        foreach (var item in scheduledItems)
        {
            item.Status = AuctionItemStatus.Live;
            item.UpdatedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        await realtime.AuctionStatusChangedAsync(eventId, settings.Status.ToString(), ct);
        return Results.Ok(new { status = settings.Status.ToString(), settings.SealedEndsAt });
    }

    private static async Task<IResult> ManageSubmitters(
        Guid eventId,
        ManageSubmittersRequest request,
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

        // Replace the submitter list
        var existing = await db.AuctionItemSubmitters
            .Where(s => s.EventId == eventId)
            .ToListAsync(ct);

        db.AuctionItemSubmitters.RemoveRange(existing);

        var newSubmitters = request.UserIds
            .Distinct()
            .Select(uid => new AuctionItemSubmitter
            {
                Id = Guid.NewGuid(),
                EventId = eventId,
                UserId = uid
            });

        db.AuctionItemSubmitters.AddRange(newSubmitters);
        await db.SaveChangesAsync(ct);

        return Results.Ok(new { count = request.UserIds.Count });
    }

    private static async Task<IResult> GetSubmitters(
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

        var submitters = await db.AuctionItemSubmitters
            .AsNoTracking()
            .Where(s => s.EventId == eventId)
            .Select(s => new
            {
                s.UserId,
                s.User.Email,
                DisplayName = s.User.DisplayName ?? s.User.Email
            })
            .ToListAsync(ct);

        return Results.Ok(submitters);
    }

    private static async Task<IResult> BanUser(
        Guid eventId,
        BanAuctionUserRequest request,
        IValidator<BanAuctionUserRequest> validator,
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

        if (ValidationError(await validator.ValidateAsync(request, ct)) is { } validationError)
            return validationError;

        var targetUser = await db.Users.FindAsync([request.UserId], ct);
        if (targetUser is null)
            return Results.NotFound(new { error = "User not found." });

        if (request.UserId == dbUser.Id)
            return Results.BadRequest(new { error = "Cannot ban yourself." });

        var evt = await db.Events.AsNoTracking().FirstOrDefaultAsync(e => e.Id == eventId, ct);
        if (evt is null) return Results.NotFound(new { error = "Event not found." });

        if (request.UserId == evt.OwnerId)
            return Results.BadRequest(new { error = "Cannot ban the event owner." });

        using var transaction = await db.Database.BeginTransactionAsync(ct);

        // Idempotency check
        var existing = await db.AuctionPublishBans
            .FirstOrDefaultAsync(b => b.EventId == eventId && b.UserId == request.UserId, ct);

        if (existing is not null)
        {
            await transaction.CommitAsync(ct);
            return Results.Ok(new { banId = existing.Id, affectedItemCount = 0, alreadyBanned = true });
        }

        var ban = new AuctionPublishBan
        {
            Id = Guid.NewGuid(),
            EventId = eventId,
            UserId = request.UserId,
            BannedByUserId = dbUser.Id,
            Reason = request.Reason?.Trim(),
            CreatedAt = DateTime.UtcNow
        };
        db.AuctionPublishBans.Add(ban);

        // Find all affected items
        var affectedItems = await db.AuctionItems.AsTracking()
            .Where(i => i.EventId == eventId
                && i.SubmittedByUserId == request.UserId
                && (i.Status == AuctionItemStatus.Draft
                    || i.Status == AuctionItemStatus.PendingApproval
                    || i.Status == AuctionItemStatus.Scheduled
                    || i.Status == AuctionItemStatus.Live))
            .ToListAsync(ct);

        var voidedBidders = new List<Guid>();
        foreach (var item in affectedItems)
        {
            if (item.Status == AuctionItemStatus.Live && item.CurrentBidId.HasValue)
            {
                var highBidderId = await VoidBidsForItemAsync(db, item, ct);
                if (highBidderId.HasValue)
                    voidedBidders.Add(highBidderId.Value);
            }

            item.Status = AuctionItemStatus.Rejected;
            item.RejectionReason = "User banned from publishing in this auction";
            item.ResubmitAllowed = false;
            item.UpdatedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        // SignalR
        await realtime.AuctionUserBannedAsync(eventId, request.UserId, ct);

        foreach (var item in affectedItems)
        {
            await realtime.AuctionItemUpdatedAsync(eventId, item.Id, ct);
            if (item.Status == AuctionItemStatus.Rejected)
                await realtime.AuctionItemRemovedAsync(eventId, item.Id, ct);
        }

        // Notifications
        await notifications.NotifyUserBannedFromAuction(request.UserId, eventId, ban.Reason, ct);

        foreach (var bidderId in voidedBidders.Distinct())
        {
            await notifications.NotifyBidVoided(bidderId, Guid.Empty, ban.Reason, ct);
        }

        return Results.Ok(new { banId = ban.Id, affectedItemCount = affectedItems.Count, alreadyBanned = false });
    }

    private static async Task<IResult> LiftBan(
        Guid eventId,
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

        var ban = await db.AuctionPublishBans
            .FirstOrDefaultAsync(b => b.EventId == eventId && b.UserId == userId, ct);

        if (ban is null)
            return Results.NotFound(new { error = "Ban not found." });

        db.AuctionPublishBans.Remove(ban);
        await db.SaveChangesAsync(ct);

        await realtime.AuctionUserUnbannedAsync(eventId, userId, ct);

        return Results.NoContent();
    }

    private static async Task<IResult> ListBans(
        Guid eventId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventAdmin(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        var bans = await db.AuctionPublishBans
            .AsNoTracking()
            .Where(b => b.EventId == eventId)
            .OrderByDescending(b => b.CreatedAt)
            .Select(b => new
            {
                userId = b.UserId,
                displayName = b.User.DisplayName ?? b.User.FullName ?? "Unknown",
                reason = b.Reason,
                createdAt = b.CreatedAt,
                bannedByDisplayName = b.BannedByUser.DisplayName ?? b.BannedByUser.FullName ?? "Unknown"
            })
            .ToListAsync(ct);

        return Results.Ok(bans);
    }

    // ─── Items ───────────────────────────────────────────────────

    private static async Task<IResult> GetItems(
        Guid eventId,
        int? page,
        int? pageSize,
        bool? mine,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var settings = await db.EventAuctionSettings.AsNoTracking()
            .FirstOrDefaultAsync(s => s.EventId == eventId, ct);

        var isAdmin = await IsEventAdmin(db, eventId, dbUser.Id, ct);

        var p = Math.Max(page ?? 1, 1);
        var size = Math.Clamp(pageSize ?? 20, 1, 100);

        var query = db.AuctionItems.AsNoTracking()
            .AsSplitQuery()
            .Where(i => i.EventId == eventId);

        // Filter by ownership
        if (mine == true)
        {
            // mine=true: return only items submitted by caller (all statuses)
            query = query.Where(i => i.SubmittedByUserId == dbUser.Id);
        }
        else
        {
            // mine=false: public items (Live/Sold/Unsold/Withdrawn) for everyone
            // Admins get moderation via Wave 1b endpoints, not via GetItems
            query = query.Where(i =>
                i.Status == AuctionItemStatus.Live
                || i.Status == AuctionItemStatus.Sold
                || i.Status == AuctionItemStatus.Unsold
                || i.Status == AuctionItemStatus.Withdrawn);
        }

        var totalCount = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(i => i.CreatedAt)
            .Skip((p - 1) * size)
            .Take(size)
            .Select(i => new
            {
                i.Id,
                i.Name,
                i.Description,
                i.StartingBid,
                i.BuyoutPrice,
                status = i.Status.ToString(),
                i.FinalPrice,
                submittedByUserId = i.SubmittedByUserId,
                submittedByName = i.SubmittedByUser.DisplayName ?? i.SubmittedByUser.Email,
                currentBid = i.CurrentBid != null ? (decimal?)i.CurrentBid.Amount : null,
                bidCount = db.AuctionBids.Count(b => b.ItemId == i.Id),
                imageUrls = db.AuctionItemImages
                    .Where(img => img.ItemId == i.Id)
                    .OrderBy(img => img.SortOrder)
                    .Select(img => img.BlobUrl)
                    .ToList(),
                games = db.AuctionItemBoardGames
                    .Where(e => e.ItemId == i.Id)
                    .OrderBy(e => e.SortOrder)
                    .Select(e => new
                    {
                        e.BggId,
                        e.BoardGame.Name,
                        e.BoardGame.YearPublished,
                        thumbnailUrl = e.BoardGame.ThumbnailUrl ?? e.BoardGame.ImageUrl
                    })
                    .ToList(),
                i.DescriptionAutoGenerated,
                i.RejectionReason,
                i.ResubmitAllowed,
                i.CreatedAt,
                i.UpdatedAt
            })
            .ToListAsync(ct);

        // Attach end-time bounds for display (never the sealed time)
        var endsAtBounds = settings is not null
            ? new { earliestEndsAt = settings.EarliestEndsAt, settings.LatestEndsAt }
            : null;

        // Anonymize submitter info for non-admins when enabled
        if (settings?.AnonymousSubmitters == true && !isAdmin)
        {
            var anonymizedItems = items.Select(i => new
            {
                i.Id,
                i.Name,
                i.Description,
                i.StartingBid,
                i.BuyoutPrice,
                i.status,
                i.FinalPrice,
                submittedByUserId = (Guid?)null,
                submittedByName = (string?)null,
                i.currentBid,
                i.bidCount,
                i.imageUrls,
                i.games,
                i.DescriptionAutoGenerated,
                i.RejectionReason,
                i.ResubmitAllowed,
                i.CreatedAt,
                i.UpdatedAt
            }).ToList();

            return Results.Ok(new
            {
                items = anonymizedItems,
                endsAtBoundsForDisplay = endsAtBounds,
                page = p,
                pageSize = size,
                totalCount,
                totalPages = (int)Math.Ceiling((double)totalCount / size)
            });
        }

        return Results.Ok(new
        {
            items,
            endsAtBoundsForDisplay = endsAtBounds,
            page = p,
            pageSize = size,
            totalCount,
            totalPages = (int)Math.Ceiling((double)totalCount / size)
        });
    }

    private static async Task<IResult> GetItem(
        Guid eventId,
        Guid itemId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var isAdmin = await IsEventAdmin(db, eventId, dbUser.Id, ct);

        var item = await db.AuctionItems.AsNoTracking()
            .AsSplitQuery()
            .Where(i => i.Id == itemId && i.EventId == eventId)
            .Select(i => new
            {
                i.Id,
                i.EventId,
                i.Name,
                i.Description,
                i.StartingBid,
                i.BuyoutPrice,
                status = i.Status.ToString(),
                i.FinalPrice,
                i.WinnerUserId,
                i.ClaimedAt,
                submittedByUserId = i.SubmittedByUserId,
                submittedByName = i.SubmittedByUser.DisplayName ?? i.SubmittedByUser.Email,
                currentBid = i.CurrentBid != null ? (decimal?)i.CurrentBid.Amount : null,
                bidCount = db.AuctionBids.Count(b => b.ItemId == i.Id),
                imageUrls = db.AuctionItemImages
                    .Where(img => img.ItemId == i.Id)
                    .OrderBy(img => img.SortOrder)
                    .Select(img => img.BlobUrl)
                    .ToList(),
                games = db.AuctionItemBoardGames
                    .Where(e => e.ItemId == i.Id)
                    .OrderBy(e => e.SortOrder)
                    .Select(e => new
                    {
                        e.BggId,
                        e.BoardGame.Name,
                        e.BoardGame.YearPublished,
                        e.BoardGame.BggRank,
                        thumbnailUrl = e.BoardGame.ThumbnailUrl ?? e.BoardGame.ImageUrl,
                        imageUrl = e.BoardGame.ImageUrl ?? e.BoardGame.ThumbnailUrl,
                        description = e.BoardGame.Description
                    })
                    .ToList(),
                i.DescriptionAutoGenerated,
                i.RejectionReason,
                i.ResubmitAllowed,
                i.CreatedAt,
                i.UpdatedAt
            })
            .FirstOrDefaultAsync(ct);

        if (item is null) return Results.NotFound(new { error = "Item not found." });

        // Access control:
        // - Public statuses (Live/Sold/Unsold/Withdrawn): everyone
        // - Non-public (Draft/PendingApproval/Scheduled): submitter or admin only
        var isPublicStatus = item.status is "Live" or "Sold" or "Unsold" or "Withdrawn";
        if (!isPublicStatus && item.submittedByUserId != dbUser.Id && !isAdmin)
        {
            return Results.NotFound(new { error = "Item not found." });
        }

        var settings = await db.EventAuctionSettings.AsNoTracking()
            .FirstOrDefaultAsync(s => s.EventId == eventId, ct);

        if (settings?.AnonymousSubmitters == true && !isAdmin && item.submittedByUserId != dbUser.Id)
        {
            return Results.Ok(new
            {
                item.Id,
                item.EventId,
                item.Name,
                item.Description,
                item.StartingBid,
                item.BuyoutPrice,
                item.status,
                item.FinalPrice,
                item.WinnerUserId,
                item.ClaimedAt,
                submittedByUserId = (Guid?)null,
                submittedByName = (string?)null,
                item.currentBid,
                item.bidCount,
                item.imageUrls,
                item.games,
                item.DescriptionAutoGenerated,
                item.CreatedAt,
                item.UpdatedAt
            });
        }

        return Results.Ok(item);
    }

    private static async Task<IResult> CreateItem(
        Guid eventId,
        CreateAuctionItemRequest request,
        IValidator<CreateAuctionItemRequest> validator,
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

        var settings = await db.EventAuctionSettings.AsNoTracking()
            .FirstOrDefaultAsync(s => s.EventId == eventId, ct);

        if (settings is null)
            return Results.BadRequest(new { error = "Auction not configured for this event." });

        if (ValidationError(await validator.ValidateAsync(request, ct)) is { } validationError)
            return validationError;

        var isAdmin = await IsEventAdmin(db, eventId, dbUser.Id, ct);

        // Check submission permission
        if (!isAdmin)
        {
            if (settings.SubmissionMode == AuctionSubmissionMode.AdminsOnly)
                return Results.Forbid();

            if (settings.SubmissionMode == AuctionSubmissionMode.SelectedAttendees)
            {
                var isSubmitter = await db.AuctionItemSubmitters
                    .AnyAsync(s => s.EventId == eventId && s.UserId == dbUser.Id, ct);
                if (!isSubmitter) return Results.Forbid();
            }
        }

        // Ban check
        var isBanned = await db.AuctionPublishBans
            .AnyAsync(b => b.EventId == eventId && b.UserId == dbUser.Id, ct);
        if (isBanned)
            return Results.Json(new { error = "You are banned from publishing in this auction." }, statusCode: 403);

        var item = new AuctionItem
        {
            Id = Guid.NewGuid(),
            EventId = eventId,
            SubmittedByUserId = dbUser.Id,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            StartingBid = request.StartingBid,
            BuyoutPrice = request.BuyoutPrice,
            Status = AuctionItemStatus.Draft,
            DescriptionAutoGenerated = request.DescriptionAutoGenerated,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        db.AuctionItems.Add(item);

        if (request.BggIds is { Count: > 0 })
        {
            var distinctIds = request.BggIds.Distinct().Take(20).ToList();

            var rankedGames = await db.BoardGames
                .Where(bg => distinctIds.Contains(bg.BggId))
                .Select(bg => new { bg.BggId, bg.BggRank })
                .ToListAsync(ct);

            var sortedIds = rankedGames
                .OrderBy(bg => bg.BggRank == null)
                .ThenBy(bg => bg.BggRank)
                .Select(bg => bg.BggId)
                .ToList();

            for (var idx = 0; idx < sortedIds.Count; idx++)
            {
                db.AuctionItemBoardGames.Add(new AuctionItemBoardGame
                {
                    Id = Guid.NewGuid(),
                    ItemId = item.Id,
                    BggId = sortedIds[idx],
                    SortOrder = idx,
                    AddedAt = DateTime.UtcNow
                });
            }
        }

        await db.SaveChangesAsync(ct);

        return Results.Created($"/api/events/{eventId}/auction/items/{item.Id}", new
        {
            item.Id,
            item.Name,
            item.Description,
            item.StartingBid,
            item.BuyoutPrice,
            status = item.Status.ToString()
        });
    }

    private static async Task<IResult> UpdateItem(
        Guid eventId,
        Guid itemId,
        UpdateAuctionItemRequest request,
        IValidator<UpdateAuctionItemRequest> validator,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var isAdmin = await IsEventAdmin(db, eventId, dbUser.Id, ct);

        var item = await db.AuctionItems.AsTracking()
            .FirstOrDefaultAsync(i => i.Id == itemId && i.EventId == eventId, ct);

        if (item is null) return Results.NotFound(new { error = "Item not found." });

        // Authorization: submitter (in Draft only) or admin (who is also the submitter)
        if (item.SubmittedByUserId == dbUser.Id)
        {
            // Submitter editing their own item
            if (item.Status != AuctionItemStatus.Draft)
                return Results.Conflict(new { error = "Item must be in Draft to edit. Unpublish first.", currentStatus = item.Status.ToString() });
        }
        else if (isAdmin)
        {
            // Admin trying to edit someone else's item → forbidden
            return Results.Forbid();
        }
        else
        {
            // Non-admin, non-submitter → forbidden
            return Results.Forbid();
        }

        if (ValidationError(await validator.ValidateAsync(request, ct)) is { } validationError)
            return validationError;

        item.Name = request.Name.Trim();
        item.Description = request.Description?.Trim();
        item.StartingBid = request.StartingBid;
        item.BuyoutPrice = request.BuyoutPrice;
        item.DescriptionAutoGenerated = request.DescriptionAutoGenerated;
        item.UpdatedAt = DateTime.UtcNow;

        // Replace board games list
        var existingGames = await db.AuctionItemBoardGames
            .Where(e => e.ItemId == itemId)
            .ToListAsync(ct);
        db.AuctionItemBoardGames.RemoveRange(existingGames);

        if (request.BggIds is { Count: > 0 })
        {
            var distinctIds = request.BggIds.Distinct().Take(20).ToList();

            var rankedGames = await db.BoardGames
                .Where(bg => distinctIds.Contains(bg.BggId))
                .Select(bg => new { bg.BggId, bg.BggRank })
                .ToListAsync(ct);

            var sortedIds = rankedGames
                .OrderBy(bg => bg.BggRank == null)
                .ThenBy(bg => bg.BggRank)
                .Select(bg => bg.BggId)
                .ToList();

            for (var idx = 0; idx < sortedIds.Count; idx++)
            {
                db.AuctionItemBoardGames.Add(new AuctionItemBoardGame
                {
                    Id = Guid.NewGuid(),
                    ItemId = itemId,
                    BggId = sortedIds[idx],
                    SortOrder = idx,
                    AddedAt = DateTime.UtcNow
                });
            }
        }

        await db.SaveChangesAsync(ct);
        await realtime.AuctionItemUpdatedAsync(eventId, itemId, ct);

        return Results.Ok(new
        {
            item.Id,
            item.Name,
            item.Description,
            item.StartingBid,
            item.BuyoutPrice,
            status = item.Status.ToString()
        });
    }

    private static async Task<IResult> DeleteItem(
        Guid eventId,
        Guid itemId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var isAdmin = await IsEventAdmin(db, eventId, dbUser.Id, ct);

        var item = await db.AuctionItems.AsTracking()
            .FirstOrDefaultAsync(i => i.Id == itemId && i.EventId == eventId, ct);

        if (item is null) return Results.NotFound(new { error = "Item not found." });

        // Authorization: submitter (Draft only), or admin (can delete any status if submitter)
        if (item.SubmittedByUserId == dbUser.Id)
        {
            // Submitter deleting their own item — must be Draft
            if (item.Status != AuctionItemStatus.Draft)
                return Results.Conflict(new { error = "Item must be in Draft to delete.", currentStatus = item.Status.ToString() });
        }
        else if (isAdmin)
        {
            // Admin trying to delete someone else's item → forbidden for Wave 1a
            return Results.Forbid();
        }
        else
        {
            return Results.Forbid();
        }

        item.Status = AuctionItemStatus.Withdrawn;
        item.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        await realtime.AuctionItemRemovedAsync(eventId, itemId, ct);
        return Results.Ok(new { withdrawn = true });
    }

    private static async Task<IResult> UploadItemImage(
        Guid eventId,
        Guid itemId,
        HttpRequest request,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        AuctionImageStorage imageStorage,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var item = await db.AuctionItems.AsNoTracking()
            .FirstOrDefaultAsync(i => i.Id == itemId && i.EventId == eventId, ct);
        if (item is null) return Results.NotFound(new { error = "Item not found." });

        var isAdmin = await IsEventAdmin(db, eventId, dbUser.Id, ct);

        // Authorization: submitter (Draft only), or admin (if also submitter, Draft only)
        if (item.SubmittedByUserId == dbUser.Id)
        {
            if (item.Status != AuctionItemStatus.Draft)
                return Results.Conflict(new { error = "Item must be in Draft to edit. Unpublish first.", currentStatus = item.Status.ToString() });
        }
        else if (isAdmin)
        {
            // Admin trying to edit someone else's item → forbidden
            return Results.Forbid();
        }
        else
        {
            return Results.Forbid();
        }

        var form = await request.ReadFormAsync(ct);
        var file = form.Files.GetFile("image");
        if (file is null || file.Length == 0)
            return Results.BadRequest(new { error = "No image uploaded." });

        try
        {
            await using var stream = file.OpenReadStream();
            var url = await imageStorage.UploadAsync(eventId, itemId, stream, file.ContentType, ct);

            var maxSort = await db.AuctionItemImages
                .Where(img => img.ItemId == itemId)
                .MaxAsync(img => (int?)img.SortOrder, ct) ?? -1;

            var image = new AuctionItemImage
            {
                Id = Guid.NewGuid(),
                ItemId = itemId,
                BlobUrl = url,
                SortOrder = maxSort + 1,
                UploadedAt = DateTime.UtcNow
            };

            db.AuctionItemImages.Add(image);
            await db.SaveChangesAsync(ct);

            return Results.Ok(new { image.Id, image.BlobUrl, image.SortOrder });
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(new { error = ex.Message });
        }
    }

    private static async Task<IResult> DeleteItemImage(
        Guid eventId,
        Guid itemId,
        Guid imageId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        AuctionImageStorage imageStorage,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var item = await db.AuctionItems.AsNoTracking()
            .FirstOrDefaultAsync(i => i.Id == itemId && i.EventId == eventId, ct);
        if (item is null) return Results.NotFound(new { error = "Item not found." });

        var isAdmin = await IsEventAdmin(db, eventId, dbUser.Id, ct);

        // Authorization: submitter (Draft only), or admin (if also submitter, Draft only)
        if (item.SubmittedByUserId == dbUser.Id)
        {
            if (item.Status != AuctionItemStatus.Draft)
                return Results.Conflict(new { error = "Item must be in Draft to edit. Unpublish first.", currentStatus = item.Status.ToString() });
        }
        else if (isAdmin)
        {
            // Admin trying to edit someone else's item → forbidden
            return Results.Forbid();
        }
        else
        {
            return Results.Forbid();
        }

        var image = await db.AuctionItemImages.AsTracking()
            .FirstOrDefaultAsync(img => img.Id == imageId && img.ItemId == itemId, ct);
        if (image is null) return Results.NotFound(new { error = "Image not found." });

        await imageStorage.DeleteAsync(image.BlobUrl, ct);
        db.AuctionItemImages.Remove(image);
        await db.SaveChangesAsync(ct);

        return Results.Ok(new { deleted = true });
    }

    private static async Task<IResult> ApproveItem(
        Guid eventId,
        Guid itemId,
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

        var item = await db.AuctionItems.AsTracking()
            .FirstOrDefaultAsync(i => i.Id == itemId && i.EventId == eventId, ct);
        if (item is null) return Results.NotFound(new { error = "Item not found." });

        if (item.Status != AuctionItemStatus.PendingApproval)
            return Results.BadRequest(new { error = "Item is not pending approval." });

        var settings = await db.EventAuctionSettings.AsNoTracking()
            .FirstOrDefaultAsync(s => s.EventId == eventId, ct);

        item.Status = settings?.Status == AuctionStatus.Live
            ? AuctionItemStatus.Live
            : AuctionItemStatus.Scheduled;
        item.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);

        if (item.Status == AuctionItemStatus.Live)
            await realtime.AuctionItemAddedAsync(eventId, itemId, ct);
        else
            await realtime.AuctionItemUpdatedAsync(eventId, itemId, ct);

        return Results.Ok(new { item.Id, status = item.Status.ToString() });
    }

    private static async Task<IResult> PublishItem(
        Guid eventId,
        Guid itemId,
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

        var isAdmin = await IsEventAdmin(db, eventId, dbUser.Id, ct);

        var item = await db.AuctionItems.AsTracking()
            .FirstOrDefaultAsync(i => i.Id == itemId && i.EventId == eventId, ct);

        if (item is null) return Results.NotFound(new { error = "Item not found." });

        if (item.SubmittedByUserId != dbUser.Id && !isAdmin)
            return Results.Forbid();

        // Non-admin submitters must pass submission permission check at publish-time
        if (!isAdmin && item.SubmittedByUserId == dbUser.Id)
        {
            var settings = await db.EventAuctionSettings.AsNoTracking()
                .FirstOrDefaultAsync(s => s.EventId == eventId, ct);
            
            if (settings is not null)
            {
                if (settings.SubmissionMode == AuctionSubmissionMode.AdminsOnly)
                    return Results.Forbid();

                if (settings.SubmissionMode == AuctionSubmissionMode.SelectedAttendees)
                {
                    var isSubmitter = await db.AuctionItemSubmitters
                        .AnyAsync(s => s.EventId == eventId && s.UserId == dbUser.Id, ct);
                    if (!isSubmitter) return Results.Forbid();
                }
            }
        }

        // Ban check (applies to all, including admins)
        var isBanned = await db.AuctionPublishBans
            .AnyAsync(b => b.EventId == eventId && b.UserId == dbUser.Id, ct);
        if (isBanned)
            return Results.Json(new { error = "You are banned from publishing in this auction." }, statusCode: 403);

        if (item.Status != AuctionItemStatus.Draft)
            return Results.Conflict(new { error = "Item must be in Draft to publish.", currentStatus = item.Status.ToString() });

        var auctionSettings = await db.EventAuctionSettings.AsNoTracking()
            .FirstOrDefaultAsync(s => s.EventId == eventId, ct);
        
        if (auctionSettings is null)
            return Results.BadRequest(new { error = "Auction not configured for this event." });

        bool autoApprove = isAdmin || auctionSettings.ItemModerationPolicy == ModerationPolicy.AutoApprove;
        AuctionItemStatus targetStatus;

        if (!autoApprove)
            targetStatus = AuctionItemStatus.PendingApproval;
        else if (auctionSettings.Status == AuctionStatus.Live)
            targetStatus = AuctionItemStatus.Live;
        else
            targetStatus = AuctionItemStatus.Scheduled;

        item.Status = targetStatus;
        item.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);

        // SignalR: broadcast to appropriate audience
        if (targetStatus == AuctionItemStatus.Live)
        {
            await realtime.AuctionItemAddedAsync(eventId, itemId, ct);
        }
        else if (targetStatus == AuctionItemStatus.PendingApproval || targetStatus == AuctionItemStatus.Scheduled)
        {
            // Notify admins + submitter only, no event-group broadcast
            await realtime.AuctionItemUpdatedAsync(eventId, itemId, ct);
        }

        // Notification to admins if pending approval
        if (targetStatus == AuctionItemStatus.PendingApproval)
        {
            var evt = await db.Events.AsNoTracking()
                .FirstOrDefaultAsync(e => e.Id == eventId, ct);
            
            if (evt is not null)
            {
                await notifications.CreateAsync(
                    evt.OwnerId,
                    NotificationKind.AuctionItemPendingApproval,
                    eventId,
                    item.Id,
                    $"New auction item \"{item.Name}\" needs approval.",
                    ct);
            }
        }

        // Return same projection shape as GetItem
        var projection = await db.AuctionItems.AsNoTracking()
            .Where(i => i.Id == itemId)
            .Select(i => new
            {
                i.Id,
                i.Name,
                i.Description,
                i.StartingBid,
                i.BuyoutPrice,
                status = i.Status.ToString(),
                i.FinalPrice,
                submittedByUserId = i.SubmittedByUserId,
                submittedByName = i.SubmittedByUser.DisplayName ?? i.SubmittedByUser.Email,
                currentBid = i.CurrentBid != null ? (decimal?)i.CurrentBid.Amount : null,
                bidCount = db.AuctionBids.Count(b => b.ItemId == i.Id),
                imageUrls = db.AuctionItemImages
                    .Where(img => img.ItemId == i.Id)
                    .OrderBy(img => img.SortOrder)
                    .Select(img => img.BlobUrl)
                    .ToList(),
                i.DescriptionAutoGenerated,
                i.CreatedAt,
                i.UpdatedAt
            })
            .FirstOrDefaultAsync(ct);

        return Results.Ok(projection);
    }

    private static async Task<IResult> UnpublishItem(
        Guid eventId,
        Guid itemId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var item = await db.AuctionItems.AsTracking()
            .FirstOrDefaultAsync(i => i.Id == itemId && i.EventId == eventId, ct);

        if (item is null) return Results.NotFound(new { error = "Item not found." });

        // Submitter only (admins do NOT unpublish, they reject)
        if (item.SubmittedByUserId != dbUser.Id)
            return Results.Forbid();

        if (item.Status != AuctionItemStatus.PendingApproval && item.Status != AuctionItemStatus.Scheduled)
            return Results.Conflict(new { error = "Only pending or scheduled items can be unpublished.", currentStatus = item.Status.ToString() });

        item.Status = AuctionItemStatus.Draft;
        item.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);

        // Notify admins (moderation queue update) and submitter
        await realtime.AuctionItemUpdatedAsync(eventId, itemId, ct);

        var projection = await db.AuctionItems.AsNoTracking()
            .Where(i => i.Id == itemId)
            .Select(i => new
            {
                i.Id,
                i.Name,
                i.Description,
                i.StartingBid,
                i.BuyoutPrice,
                status = i.Status.ToString(),
                i.FinalPrice,
                submittedByUserId = i.SubmittedByUserId,
                submittedByName = i.SubmittedByUser.DisplayName ?? i.SubmittedByUser.Email,
                currentBid = i.CurrentBid != null ? (decimal?)i.CurrentBid.Amount : null,
                bidCount = db.AuctionBids.Count(b => b.ItemId == i.Id),
                imageUrls = db.AuctionItemImages
                    .Where(img => img.ItemId == i.Id)
                    .OrderBy(img => img.SortOrder)
                    .Select(img => img.BlobUrl)
                    .ToList(),
                i.DescriptionAutoGenerated,
                i.CreatedAt,
                i.UpdatedAt
            })
            .FirstOrDefaultAsync(ct);

        return Results.Ok(projection);
    }

    private static async Task<IResult> RejectItem(
        Guid eventId,
        Guid itemId,
        RejectAuctionItemRequest request,
        IValidator<RejectAuctionItemRequest> validator,
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

        if (ValidationError(await validator.ValidateAsync(request, ct)) is { } validationError)
            return validationError;

        var item = await db.AuctionItems.AsTracking()
            .FirstOrDefaultAsync(i => i.Id == itemId && i.EventId == eventId, ct);

        if (item is null) return Results.NotFound(new { error = "Item not found." });

        if (item.Status is not (AuctionItemStatus.PendingApproval or AuctionItemStatus.Scheduled or AuctionItemStatus.Live))
            return Results.Conflict(new { error = "Only pending, scheduled, or live items can be rejected.", currentStatus = item.Status.ToString() });

        Guid? voidedHighBidderId = null;
        if (item.Status == AuctionItemStatus.Live && item.CurrentBidId.HasValue)
        {
            voidedHighBidderId = await VoidBidsForItemAsync(db, item, ct);
        }

        item.Status = AuctionItemStatus.Rejected;
        item.RejectionReason = request.Reason?.Trim();
        item.ResubmitAllowed = request.AllowResubmit!.Value;
        item.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);

        // SignalR: notify submitter
        await realtime.AuctionItemUpdatedAsync(eventId, itemId, ct);

        // If was Live, also broadcast removal to event group
        if (item.Status == AuctionItemStatus.Rejected)
            await realtime.AuctionItemRemovedAsync(eventId, itemId, ct);

        // Notifications
        await notifications.NotifyItemRejected(item.SubmittedByUserId, itemId, item.RejectionReason, item.ResubmitAllowed, ct);

        if (voidedHighBidderId.HasValue)
            await notifications.NotifyBidVoided(voidedHighBidderId.Value, itemId, item.RejectionReason, ct);

        // Return same projection as GetItem
        var projection = await db.AuctionItems.AsNoTracking()
            .Where(i => i.Id == itemId)
            .Select(i => new
            {
                i.Id,
                i.Name,
                i.Description,
                i.StartingBid,
                i.BuyoutPrice,
                status = i.Status.ToString(),
                i.FinalPrice,
                submittedByUserId = i.SubmittedByUserId,
                submittedByName = i.SubmittedByUser.DisplayName ?? i.SubmittedByUser.Email,
                currentBid = i.CurrentBid != null ? (decimal?)i.CurrentBid.Amount : null,
                bidCount = db.AuctionBids.Count(b => b.ItemId == i.Id),
                imageUrls = db.AuctionItemImages
                    .Where(img => img.ItemId == i.Id)
                    .OrderBy(img => img.SortOrder)
                    .Select(img => img.BlobUrl)
                    .ToList(),
                i.DescriptionAutoGenerated,
                i.RejectionReason,
                i.ResubmitAllowed,
                i.CreatedAt,
                i.UpdatedAt
            })
            .FirstOrDefaultAsync(ct);

        return Results.Ok(projection);
    }

    private static async Task<IResult> ResubmitItem(
        Guid eventId,
        Guid itemId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var item = await db.AuctionItems.AsTracking()
            .FirstOrDefaultAsync(i => i.Id == itemId && i.EventId == eventId, ct);

        if (item is null) return Results.NotFound(new { error = "Item not found." });

        // Submitter only
        if (item.SubmittedByUserId != dbUser.Id)
            return Results.Forbid();

        if (item.Status != AuctionItemStatus.Rejected)
            return Results.Conflict(new { error = "Only rejected items can be resubmitted.", currentStatus = item.Status.ToString() });

        if (!item.ResubmitAllowed)
            return Results.Json(new { error = "This item cannot be republished." }, statusCode: 403);

        // Check if user is banned
        var isBanned = await db.AuctionPublishBans
            .AnyAsync(b => b.EventId == eventId && b.UserId == dbUser.Id, ct);
        if (isBanned)
            return Results.Json(new { error = "You are banned from publishing in this auction." }, statusCode: 403);

        item.Status = AuctionItemStatus.Draft;
        item.RejectionReason = null;
        item.ResubmitAllowed = false;
        item.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);

        // SignalR: submitter only (item is back in private workspace)
        await realtime.AuctionItemUpdatedAsync(eventId, itemId, ct);

        var projection = await db.AuctionItems.AsNoTracking()
            .Where(i => i.Id == itemId)
            .Select(i => new
            {
                i.Id,
                i.Name,
                i.Description,
                i.StartingBid,
                i.BuyoutPrice,
                status = i.Status.ToString(),
                i.FinalPrice,
                submittedByUserId = i.SubmittedByUserId,
                submittedByName = i.SubmittedByUser.DisplayName ?? i.SubmittedByUser.Email,
                currentBid = i.CurrentBid != null ? (decimal?)i.CurrentBid.Amount : null,
                bidCount = db.AuctionBids.Count(b => b.ItemId == i.Id),
                imageUrls = db.AuctionItemImages
                    .Where(img => img.ItemId == i.Id)
                    .OrderBy(img => img.SortOrder)
                    .Select(img => img.BlobUrl)
                    .ToList(),
                i.DescriptionAutoGenerated,
                i.RejectionReason,
                i.ResubmitAllowed,
                i.CreatedAt,
                i.UpdatedAt
            })
            .FirstOrDefaultAsync(ct);

        return Results.Ok(projection);
    }

    private static async Task<IResult> GetModerationQueue(
        Guid eventId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventAdmin(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        var items = await db.AuctionItems
            .AsNoTracking()
            .AsSplitQuery()
            .Where(i => i.EventId == eventId
                && (i.Status == AuctionItemStatus.PendingApproval
                    || i.Status == AuctionItemStatus.Live
                    || i.Status == AuctionItemStatus.Scheduled))
            .OrderBy(i => i.Status)
            .ThenByDescending(i => i.CreatedAt)
            .Select(i => new
            {
                i.Id,
                i.Name,
                i.Description,
                i.StartingBid,
                i.BuyoutPrice,
                status = i.Status.ToString(),
                i.FinalPrice,
                submittedByUserId = i.SubmittedByUserId,
                submittedByName = i.SubmittedByUser.DisplayName ?? i.SubmittedByUser.Email,
                currentBid = i.CurrentBid != null ? (decimal?)i.CurrentBid.Amount : null,
                bidCount = db.AuctionBids.Count(b => b.ItemId == i.Id),
                imageUrls = db.AuctionItemImages
                    .Where(img => img.ItemId == i.Id)
                    .OrderBy(img => img.SortOrder)
                    .Select(img => img.BlobUrl)
                    .ToList(),
                games = db.AuctionItemBoardGames
                    .Where(e => e.ItemId == i.Id)
                    .OrderBy(e => e.SortOrder)
                    .Select(e => new
                    {
                        e.BggId,
                        e.BoardGame.Name,
                        e.BoardGame.YearPublished,
                        thumbnailUrl = e.BoardGame.ThumbnailUrl ?? e.BoardGame.ImageUrl
                    })
                    .ToList(),
                i.DescriptionAutoGenerated,
                i.RejectionReason,
                i.ResubmitAllowed,
                i.CreatedAt,
                i.UpdatedAt
            })
            .ToListAsync(ct);

        return Results.Ok(items);
    }

    // ─── Bidding (the dangerous mile) ────────────────────────────

    private static async Task<IResult> PlaceBid(
        Guid eventId,
        Guid itemId,
        PlaceBidRequest request,
        IValidator<PlaceBidRequest> validator,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        NotificationService notifications,
        CancellationToken ct)
    {
        using var activity = AuctionService.Source.StartActivity("PlaceBid");
        activity?.SetTag("eventId", eventId);
        activity?.SetTag("itemId", itemId);

        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (ValidationError(await validator.ValidateAsync(request, ct)) is { } validationError)
        {
            AuctionService.BidsRejected.Add(1, new KeyValuePair<string, object?>("reason", "validation"));
            return validationError;
        }

        // Pre-check: admins cannot bid
        if (await IsEventAdmin(db, eventId, dbUser.Id, ct))
        {
            AuctionService.BidsRejected.Add(1, new KeyValuePair<string, object?>("reason", "admin_bid"));
            return Results.Problem("Event admins cannot place bids.", statusCode: 403);
        }

        return await ExecuteBidAsync(eventId, itemId, request.Amount, request.IdempotencyKey,
            isBuyout: false, dbUser, db, realtime, notifications, ct);
    }

    private static async Task<IResult> Buyout(
        Guid eventId,
        Guid itemId,
        PlaceBidRequest request,
        IValidator<PlaceBidRequest> validator,
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

        if (ValidationError(await validator.ValidateAsync(request, ct)) is { } validationError)
            return validationError;

        // Pre-check: admins cannot bid
        if (await IsEventAdmin(db, eventId, dbUser.Id, ct))
            return Results.Problem("Event admins cannot place bids.", statusCode: 403);

        var settings = await db.EventAuctionSettings.AsNoTracking()
            .FirstOrDefaultAsync(s => s.EventId == eventId, ct);
        if (settings is null || !settings.AllowBuyout)
            return Results.BadRequest(new { error = "Buyout is not allowed." });

        var item = await db.AuctionItems.AsNoTracking()
            .FirstOrDefaultAsync(i => i.Id == itemId && i.EventId == eventId, ct);
        if (item is null) return Results.NotFound(new { error = "Item not found." });
        if (!item.BuyoutPrice.HasValue)
            return Results.BadRequest(new { error = "Item does not have a buyout price." });

        return await ExecuteBidAsync(eventId, itemId, item.BuyoutPrice.Value, request.IdempotencyKey,
            isBuyout: true, dbUser, db, realtime, notifications, ct);
    }

    private static async Task<IResult> ExecuteBidAsync(
        Guid eventId,
        Guid itemId,
        decimal amount,
        string idempotencyKey,
        bool isBuyout,
        User dbUser,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        NotificationService notifications,
        CancellationToken ct)
    {
        const int maxRetries = 1;
        for (var attempt = 0; attempt <= maxRetries; attempt++)
        {
            try
            {
                return await AttemptBidAsync(eventId, itemId, amount, idempotencyKey,
                    isBuyout, dbUser, db, realtime, notifications, ct);
            }
            catch (DbUpdateException ex) when (
                ex.InnerException is PostgresException pgEx
                && pgEx.SqlState == "23505"
                && pgEx.ConstraintName?.Contains("ItemId_Amount") == true)
            {
                // Unique constraint on (ItemId, Amount) — another bid landed at the same amount
                if (attempt == maxRetries)
                {
                    AuctionService.BidsRejected.Add(1, new KeyValuePair<string, object?>("reason", "amount_conflict"));
                    return Results.Conflict(new { error = "A bid with this exact amount already exists. Try a different amount." });
                }
                // Detach tracked entities and retry
                db.ChangeTracker.Clear();
            }
            catch (DbUpdateException ex) when (
                ex.InnerException is PostgresException pgEx
                && pgEx.SqlState == "23505"
                && pgEx.ConstraintName?.Contains("ItemId_IdempotencyKey") == true)
            {
                // Idempotent: return the existing bid
                db.ChangeTracker.Clear();
                var existingBid = await db.AuctionBids.AsNoTracking()
                    .FirstOrDefaultAsync(b => b.ItemId == itemId && b.IdempotencyKey == idempotencyKey, ct);

                if (existingBid is not null)
                {
                    return Results.Ok(new
                    {
                        existingBid.Id,
                        existingBid.Amount,
                        existingBid.IsBuyout,
                        existingBid.CreatedAt,
                        idempotent = true
                    });
                }

                return Results.Conflict(new { error = "Duplicate idempotency key." });
            }
        }

        return Results.Conflict(new { error = "Unable to place bid after retries." });
    }

    private static async Task<IResult> AttemptBidAsync(
        Guid eventId,
        Guid itemId,
        decimal amount,
        string idempotencyKey,
        bool isBuyout,
        User dbUser,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        NotificationService notifications,
        CancellationToken ct)
    {
        var strategy = db.Database.CreateExecutionStrategy();
        IResult result = Results.StatusCode(500);

        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);

            // Re-read with tracking for row version
            var item = await db.AuctionItems.AsTracking()
                .FirstOrDefaultAsync(i => i.Id == itemId && i.EventId == eventId, ct);

            if (item is null)
            {
                result = Results.NotFound(new { error = "Item not found." });
                return;
            }

            // Pre-check: cannot bid on own item
            if (item.SubmittedByUserId == dbUser.Id)
            {
                AuctionService.BidsRejected.Add(1, new KeyValuePair<string, object?>("reason", "own_item"));
                result = Results.Problem("You cannot bid on your own item.", statusCode: 403);
                return;
            }

            if (item.Status != AuctionItemStatus.Live)
            {
                AuctionService.BidsRejected.Add(1, new KeyValuePair<string, object?>("reason", "not_live"));
                result = Results.BadRequest(new { error = "Item is not live." });
                return;
            }

            var settings = await db.EventAuctionSettings.AsNoTracking()
                .FirstOrDefaultAsync(s => s.EventId == eventId, ct);

            if (settings is null || settings.SealedEndsAt is null)
            {
                result = Results.BadRequest(new { error = "Auction is not active." });
                return;
            }

            var now = DateTime.UtcNow;
            if (now > settings.SealedEndsAt.Value)
            {
                AuctionService.BidsRejected.Add(1, new KeyValuePair<string, object?>("reason", "auction_ended"));
                result = Results.BadRequest(new { error = "Auction has ended." });
                return;
            }

            // Read current highest bid
            var currentHigh = await db.AuctionBids
                .Where(b => b.ItemId == itemId)
                .OrderByDescending(b => b.Amount)
                .FirstOrDefaultAsync(ct);

            var minBid = AuctionService.ComputeMinNextBid(item.StartingBid, currentHigh?.Amount, settings.MinBidIncrement);
            if (amount < minBid)
            {
                AuctionService.BidsRejected.Add(1, new KeyValuePair<string, object?>("reason", "too_low"));
                result = Results.BadRequest(new { error = $"Minimum bid is {minBid:N2}." });
                return;
            }

            var bid = new AuctionBid
            {
                Id = Guid.NewGuid(),
                ItemId = itemId,
                BidderUserId = dbUser.Id,
                Amount = amount,
                IsBuyout = isBuyout,
                IdempotencyKey = idempotencyKey,
                CreatedAt = now
            };

            db.AuctionBids.Add(bid);
            item.CurrentBidId = bid.Id;
            item.UpdatedAt = now;

            if (isBuyout)
            {
                item.Status = AuctionItemStatus.Sold;
                item.WinnerUserId = dbUser.Id;
                item.FinalPrice = amount;
            }

            await db.SaveChangesAsync(ct); // bumps RowVersion via xmin
            await tx.CommitAsync(ct);

            AuctionService.BidsPlaced.Add(1);

            var bidCount = await db.AuctionBids.CountAsync(b => b.ItemId == itemId, ct);

            // Post-commit: outbid notification for previous high bidder
            if (currentHigh is not null && currentHigh.BidderUserId != dbUser.Id)
            {
                await notifications.CreateAsync(
                    currentHigh.BidderUserId,
                    NotificationKind.OutbidOnAuctionItem,
                    eventId,
                    itemId,
                    $"You've been outbid on \"{item.Name}\". New high: {amount:N2}.",
                    ct);
            }

            if (isBuyout)
            {
                await realtime.AuctionItemSoldAsync(eventId, itemId, ct);
            }

            await realtime.AuctionBidPlacedAsync(eventId, itemId, amount, bidCount, ct);

            result = Results.Ok(new
            {
                bid.Id,
                bid.Amount,
                bid.IsBuyout,
                bid.CreatedAt
            });
        });

        return result;
    }

    private static async Task<IResult> GetBids(
        Guid eventId,
        Guid itemId,
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

        var item = await db.AuctionItems.AsNoTracking()
            .FirstOrDefaultAsync(i => i.Id == itemId && i.EventId == eventId, ct);
        if (item is null) return Results.NotFound(new { error = "Item not found." });

        var isAdmin = await IsEventAdmin(db, eventId, dbUser.Id, ct);

        var settings = await db.EventAuctionSettings.AsNoTracking()
            .FirstOrDefaultAsync(s => s.EventId == eventId, ct);

        var anonymous = settings?.AnonymousBidders == true && !isAdmin;

        var p = Math.Max(page ?? 1, 1);
        var size = Math.Clamp(pageSize ?? 50, 1, 100);

        var totalCount = await db.AuctionBids.CountAsync(b => b.ItemId == itemId, ct);

        var bids = await db.AuctionBids
            .AsNoTracking()
            .Where(b => b.ItemId == itemId)
            .OrderByDescending(b => b.Amount)
            .Skip((p - 1) * size)
            .Take(size)
            .Select(b => new
            {
                b.Id,
                b.Amount,
                b.IsBuyout,
                b.CreatedAt,
                b.BidderUserId,
                BidderName = b.Bidder.DisplayName ?? b.Bidder.Email
            })
            .ToListAsync(ct);

        if (anonymous)
        {
            // Build stable per-item alias: order by first bid time per bidder
            var bidderOrder = await db.AuctionBids
                .AsNoTracking()
                .Where(b => b.ItemId == itemId)
                .GroupBy(b => b.BidderUserId)
                .Select(g => new { BidderUserId = g.Key, FirstBid = g.Min(b => b.CreatedAt) })
                .OrderBy(x => x.FirstBid)
                .ToListAsync(ct);

            var aliasMap = bidderOrder
                .Select((x, idx) => (x.BidderUserId, Alias: $"Bidder #{idx + 1}"))
                .ToDictionary(x => x.BidderUserId, x => x.Alias);

            var anonymized = bids.Select(b => new
            {
                b.Id,
                b.Amount,
                b.IsBuyout,
                b.CreatedAt,
                BidderName = aliasMap.GetValueOrDefault(b.BidderUserId, "Bidder"),
                BidderUserId = (Guid?)null
            });

            return Results.Ok(new
            {
                items = anonymized,
                page = p,
                pageSize = size,
                totalCount,
                totalPages = (int)Math.Ceiling((double)totalCount / size)
            });
        }

        return Results.Ok(new
        {
            items = bids,
            page = p,
            pageSize = size,
            totalCount,
            totalPages = (int)Math.Ceiling((double)totalCount / size)
        });
    }

    // ─── Helpers ─────────────────────────────────────────────────

    private static async Task<Guid?> VoidBidsForItemAsync(ThuddleDbContext db, AuctionItem item, CancellationToken ct)
    {
        Guid? highBidderId = null;
        if (item.CurrentBidId.HasValue)
        {
            var currentBid = await db.AuctionBids.FindAsync([item.CurrentBidId.Value], ct);
            if (currentBid is not null)
                highBidderId = currentBid.BidderUserId;
        }

        await db.AuctionBids
            .Where(b => b.ItemId == item.Id)
            .ExecuteUpdateAsync(setters => setters.SetProperty(b => b.IsVoided, true), ct);

        item.CurrentBidId = null;
        return highBidderId;
    }
}

// ─── Request DTOs ────────────────────────────────────────────────

public record UpdateAuctionSettingsRequest(
    bool Enabled,
    DateTime? StartsAt,
    DateTime? LatestEndsAt,
    TimeSpan? VeiledCloseWindow,
    TimeSpan? BidTimeExtension,
    AuctionSubmissionMode SubmissionMode,
    ModerationPolicy ItemModerationPolicy,
    decimal MinBidIncrement,
    bool AllowBuyout,
    bool AnonymousBidders,
    bool AnonymousSubmitters);

public record CreateAuctionItemRequest(
    string Name,
    string? Description,
    decimal StartingBid,
    decimal? BuyoutPrice,
    bool DescriptionAutoGenerated = true,
    List<int>? BggIds = null);

public record UpdateAuctionItemRequest(
    string Name,
    string? Description,
    decimal StartingBid,
    decimal? BuyoutPrice,
    bool DescriptionAutoGenerated,
    List<int>? BggIds = null);

public record PlaceBidRequest(
    decimal Amount,
    string IdempotencyKey);

public record ManageSubmittersRequest(
    List<Guid> UserIds);

public record RejectAuctionItemRequest(string? Reason, bool? AllowResubmit);

public record BanAuctionUserRequest(Guid UserId, string? Reason);
