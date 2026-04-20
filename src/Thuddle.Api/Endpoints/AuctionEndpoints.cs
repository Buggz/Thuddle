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

        // Transition all approved items to Live
        var approvedItems = await db.AuctionItems
            .AsTracking()
            .Where(i => i.EventId == eventId && (i.Status == AuctionItemStatus.Draft || i.Status == AuctionItemStatus.PendingApproval))
            .ToListAsync(ct);

        // Only items that were approved (or Draft from admins) go live
        // Items still PendingApproval with RequireApproval policy stay pending
        foreach (var item in approvedItems.Where(i => i.Status == AuctionItemStatus.Draft))
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
            .Where(i => i.EventId == eventId);

        // Non-admins only see Live/Sold/Unsold items (plus their own)
        if (!isAdmin)
        {
            query = query.Where(i =>
                i.Status == AuctionItemStatus.Live
                || i.Status == AuctionItemStatus.Sold
                || i.Status == AuctionItemStatus.Unsold
                || i.SubmittedByUserId == dbUser.Id);
        }

        if (mine == true)
            query = query.Where(i => i.SubmittedByUserId == dbUser.Id);

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
                i.BggId,
                i.BggImageUrl,
                extraGames = db.AuctionItemBoardGames
                    .Where(e => e.ItemId == i.Id)
                    .OrderBy(e => e.SortOrder)
                    .Select(e => new
                    {
                        e.BggId,
                        e.BoardGame.Name,
                        e.BoardGame.YearPublished,
                        e.BoardGame.ThumbnailUrl
                    })
                    .ToList(),
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
                i.BggId,
                i.BggImageUrl,
                i.extraGames,
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
                i.BggId,
                i.BggImageUrl,
                extraGames = db.AuctionItemBoardGames
                    .Where(e => e.ItemId == i.Id)
                    .OrderBy(e => e.SortOrder)
                    .Select(e => new
                    {
                        e.BggId,
                        e.BoardGame.Name,
                        e.BoardGame.YearPublished,
                        e.BoardGame.ThumbnailUrl
                    })
                    .ToList(),
                i.CreatedAt,
                i.UpdatedAt
            })
            .FirstOrDefaultAsync(ct);

        if (item is null) return Results.NotFound(new { error = "Item not found." });

        // Non-admins can't see non-public items unless they submitted them
        if (!isAdmin
            && item.submittedByUserId != dbUser.Id
            && item.status is not ("Live" or "Sold" or "Unsold"))
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
                item.BggId,
                item.BggImageUrl,
                item.extraGames,
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

        // Determine initial status
        AuctionItemStatus initialStatus;
        if (isAdmin)
        {
            initialStatus = settings.Status == AuctionStatus.Live
                ? AuctionItemStatus.Live
                : AuctionItemStatus.Draft;
        }
        else
        {
            initialStatus = settings.ItemModerationPolicy == ModerationPolicy.RequireApproval
                ? AuctionItemStatus.PendingApproval
                : (settings.Status == AuctionStatus.Live ? AuctionItemStatus.Live : AuctionItemStatus.Draft);
        }

        var item = new AuctionItem
        {
            Id = Guid.NewGuid(),
            EventId = eventId,
            SubmittedByUserId = dbUser.Id,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            StartingBid = request.StartingBid,
            BuyoutPrice = request.BuyoutPrice,
            Status = initialStatus,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        if (request.BggId.HasValue)
        {
            var boardGame = await db.BoardGames.AsNoTracking()
                .FirstOrDefaultAsync(bg => bg.BggId == request.BggId.Value, ct);
            if (boardGame is not null)
            {
                item.BggId = boardGame.BggId;
                item.BggImageUrl = boardGame.ImageUrl;
            }
        }

        db.AuctionItems.Add(item);

        if (request.ExtraBggIds is { Count: > 0 })
        {
            var distinctExtras = request.ExtraBggIds
                .Where(id => id != request.BggId) // don't duplicate the primary game
                .Distinct()
                .ToList();

            var validIds = await db.BoardGames
                .Where(bg => distinctExtras.Contains(bg.BggId))
                .Select(bg => bg.BggId)
                .ToListAsync(ct);

            for (var idx = 0; idx < validIds.Count; idx++)
            {
                db.AuctionItemBoardGames.Add(new AuctionItemBoardGame
                {
                    Id = Guid.NewGuid(),
                    ItemId = item.Id,
                    BggId = validIds[idx],
                    SortOrder = idx,
                    AddedAt = DateTime.UtcNow
                });
            }
        }

        await db.SaveChangesAsync(ct);

        await realtime.AuctionItemAddedAsync(eventId, item.Id, ct);

        // Notify admins if pending approval
        if (initialStatus == AuctionItemStatus.PendingApproval)
        {
            var evt = await db.Events.AsNoTracking().FirstOrDefaultAsync(e => e.Id == eventId, ct);
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

        // Submitter can only edit pre-bid; admin can always edit
        var hasBids = await db.AuctionBids.AnyAsync(b => b.ItemId == itemId, ct);
        if (!isAdmin)
        {
            if (item.SubmittedByUserId != dbUser.Id)
                return Results.Forbid();
            if (hasBids)
                return Results.BadRequest(new { error = "Cannot edit an item that has bids." });
        }

        if (ValidationError(await validator.ValidateAsync(request, ct)) is { } validationError)
            return validationError;

        item.Name = request.Name.Trim();
        item.Description = request.Description?.Trim();
        item.StartingBid = request.StartingBid;
        item.BuyoutPrice = request.BuyoutPrice;
        item.UpdatedAt = DateTime.UtcNow;

        if (request.BggId != item.BggId)
        {
            if (request.BggId.HasValue)
            {
                var boardGame = await db.BoardGames.AsNoTracking()
                    .FirstOrDefaultAsync(bg => bg.BggId == request.BggId.Value, ct);
                if (boardGame is not null)
                {
                    item.BggId = boardGame.BggId;
                    item.BggImageUrl = boardGame.ImageUrl;
                }
            }
            else
            {
                item.BggId = null;
                item.BggImageUrl = null;
            }
        }

        // Replace extra games list
        var existingExtras = await db.AuctionItemBoardGames
            .Where(e => e.ItemId == itemId)
            .ToListAsync(ct);
        db.AuctionItemBoardGames.RemoveRange(existingExtras);

        if (request.ExtraBggIds is { Count: > 0 })
        {
            var distinctExtras = request.ExtraBggIds
                .Where(id => id != (request.BggId ?? item.BggId))
                .Distinct()
                .ToList();

            var validIds = await db.BoardGames
                .Where(bg => distinctExtras.Contains(bg.BggId))
                .Select(bg => bg.BggId)
                .ToListAsync(ct);

            for (var idx = 0; idx < validIds.Count; idx++)
            {
                db.AuctionItemBoardGames.Add(new AuctionItemBoardGame
                {
                    Id = Guid.NewGuid(),
                    ItemId = itemId,
                    BggId = validIds[idx],
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

        if (!isAdmin)
        {
            if (item.SubmittedByUserId != dbUser.Id) return Results.Forbid();
            var hasBids = await db.AuctionBids.AnyAsync(b => b.ItemId == itemId, ct);
            if (hasBids)
                return Results.BadRequest(new { error = "Cannot delete an item that has bids." });
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
        if (!isAdmin && item.SubmittedByUserId != dbUser.Id)
            return Results.Forbid();

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
        if (!isAdmin && item.SubmittedByUserId != dbUser.Id)
            return Results.Forbid();

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
            : AuctionItemStatus.Draft;
        item.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        await realtime.AuctionItemUpdatedAsync(eventId, itemId, ct);

        return Results.Ok(new { item.Id, status = item.Status.ToString() });
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
    int? BggId = null,
    List<int>? ExtraBggIds = null);

public record UpdateAuctionItemRequest(
    string Name,
    string? Description,
    decimal StartingBid,
    decimal? BuyoutPrice,
    int? BggId = null,
    List<int>? ExtraBggIds = null);

public record PlaceBidRequest(
    decimal Amount,
    string IdempotencyKey);

public record ManageSubmittersRequest(
    List<Guid> UserIds);
