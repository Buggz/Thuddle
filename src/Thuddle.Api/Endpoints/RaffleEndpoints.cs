using System.Data;
using System.Security.Claims;
using System.Security.Cryptography;
using FluentValidation;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Thuddle.Api.Data;
using Thuddle.Api.Realtime;
using Thuddle.Api.Services;

namespace Thuddle.Api.Endpoints;

public static class RaffleEndpoints
{
    public static void MapRaffleEndpoints(this WebApplication app)
    {
        app.MapGet("/api/events/{eventId:guid}/raffles", ListRaffles).RequireAuthorization();
        app.MapGet("/api/events/{eventId:guid}/raffles/{raffleId:guid}", GetRaffle).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/raffles", CreateRaffle).RequireAuthorization();
        app.MapMethods("/api/events/{eventId:guid}/raffles/{raffleId:guid}", ["PATCH"], PatchRaffle).RequireAuthorization();
        app.MapDelete("/api/events/{eventId:guid}/raffles/{raffleId:guid}", DeleteRaffle).RequireAuthorization();
        app.MapPut("/api/events/{eventId:guid}/raffles/{raffleId:guid}/entries/{userId:guid}", SetTickets).RequireAuthorization();
        app.MapDelete("/api/events/{eventId:guid}/raffles/{raffleId:guid}/entries/{userId:guid}", DeleteEntry).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/raffles/{raffleId:guid}/start", StartDrawing).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/raffles/{raffleId:guid}/draw", DrawWinner).RequireAuthorization();
        app.MapGet("/api/events/{eventId:guid}/raffles/{raffleId:guid}/draws", GetDraws).RequireAuthorization();
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

    private static async Task<bool> IsEventParticipant(ThuddleDbContext db, Guid eventId, Guid userId, CancellationToken ct)
    {
        if (await IsEventAdmin(db, eventId, userId, ct)) return true;
        return await db.EventParticipants.AnyAsync(p => p.EventId == eventId && p.UserId == userId, ct);
    }

    private static IResult? ValidationError(FluentValidation.Results.ValidationResult result)
    {
        if (result.IsValid) return null;
        return Results.BadRequest(new { error = result.Errors[0].ErrorMessage });
    }

    // ─── GET /api/events/{eventId}/raffles ───────────────────────────────────

    private static async Task<IResult> ListRaffles(
        Guid eventId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventParticipant(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        var isAdmin = await IsEventAdmin(db, eventId, dbUser.Id, ct);

        var raffles = await db.Raffles
            .AsNoTracking()
            .Where(r => r.EventId == eventId && (isAdmin || r.DeletedAt == null))
            .OrderBy(r => r.CreatedAt)
            .Select(r => new
            {
                r.Id,
                r.Name,
                status = r.Status.ToString(),
                entryCount = db.RaffleEntries.Count(e => e.RaffleId == r.Id),
                totalTickets = db.RaffleEntries.Where(e => e.RaffleId == r.Id).Sum(e => (int?)e.Tickets) ?? 0,
                r.PricePerTicket,
                r.SelfReportingEnabled,
                r.DeletedAt,
                myTickets = db.RaffleEntries
                    .Where(e => e.RaffleId == r.Id && e.UserId == dbUser.Id)
                    .Select(e => (int?)e.Tickets)
                    .FirstOrDefault() ?? 0
            })
            .ToListAsync(ct);

        return Results.Ok(raffles);
    }

    // ─── GET /api/events/{eventId}/raffles/{raffleId} ────────────────────────

    private static async Task<IResult> GetRaffle(
        Guid eventId,
        Guid raffleId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventParticipant(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        var isAdmin = await IsEventAdmin(db, eventId, dbUser.Id, ct);

        var raffle = await db.Raffles
            .AsNoTracking()
            .Where(r => r.Id == raffleId && r.EventId == eventId && (isAdmin || r.DeletedAt == null))
            .Select(r => new
            {
                r.Id,
                r.Name,
                r.Description,
                r.PricePerTicket,
                r.SelfReportingEnabled,
                status = r.Status.ToString(),
                r.CreatedAt,
                r.UpdatedAt,
                r.DeletedAt,
                entries = db.RaffleEntries
                    .Where(e => e.RaffleId == r.Id)
                    .Select(e => new
                    {
                        e.UserId,
                        displayName = e.User.DisplayName ?? e.User.Email,
                        e.Tickets
                    })
                    .ToList(),
                drawCount = db.RaffleDraws.Count(d => d.RaffleId == r.Id)
            })
            .FirstOrDefaultAsync(ct);

        if (raffle is null) return Results.NotFound(new { error = "Raffle not found." });

        return Results.Ok(raffle);
    }

    // ─── POST /api/events/{eventId}/raffles ──────────────────────────────────

    private static async Task<IResult> CreateRaffle(
        Guid eventId,
        CreateRaffleRequest request,
        IValidator<CreateRaffleRequest> validator,
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
        var raffle = new Raffle
        {
            Id = Guid.NewGuid(),
            EventId = eventId,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            PricePerTicket = request.PricePerTicket,
            SelfReportingEnabled = request.SelfReportingEnabled,
            Status = RaffleStatus.Open,
            CreatedAt = now,
            UpdatedAt = now
        };

        db.Raffles.Add(raffle);
        await db.SaveChangesAsync(ct);
        await realtime.RaffleCreatedAsync(eventId, raffle.Id, ct);

        return Results.Created($"/api/events/{eventId}/raffles/{raffle.Id}", new { raffle.Id });
    }

    // ─── PATCH /api/events/{eventId}/raffles/{raffleId} ──────────────────────

    private static async Task<IResult> PatchRaffle(
        Guid eventId,
        Guid raffleId,
        UpdateRaffleRequest request,
        IValidator<UpdateRaffleRequest> validator,
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

        var raffle = await db.Raffles.AsTracking()
            .FirstOrDefaultAsync(r => r.Id == raffleId && r.EventId == eventId, ct);
        if (raffle is null) return Results.NotFound(new { error = "Raffle not found." });

        if (raffle.DeletedAt is not null)
            return Results.Conflict(new { error = "Raffle has been deleted and cannot be edited." });

        // In Drawing state, only description is editable
        if (raffle.Status == RaffleStatus.Drawing)
        {
            var hasLockedFieldEdit = request.Name is not null
                || request.PricePerTicket.HasValue
                || request.SelfReportingEnabled.HasValue;
            if (hasLockedFieldEdit)
                return Results.Conflict(new { error = "Only description can be edited while a raffle is in Drawing state." });
        }

        if (request.Name is not null) raffle.Name = request.Name.Trim();
        if (request.Description is not null) raffle.Description = request.Description.Trim();
        if (request.PricePerTicket.HasValue) raffle.PricePerTicket = request.PricePerTicket;
        if (request.SelfReportingEnabled.HasValue) raffle.SelfReportingEnabled = request.SelfReportingEnabled.Value;
        raffle.UpdatedAt = DateTime.UtcNow;

        db.Raffles.Update(raffle);
        await db.SaveChangesAsync(ct);
        await realtime.RaffleUpdatedAsync(eventId, raffleId, ct);

        return Results.Ok(new { updated = true });
    }

    // ─── DELETE /api/events/{eventId}/raffles/{raffleId} ─────────────────────

    private static async Task<IResult> DeleteRaffle(
        Guid eventId,
        Guid raffleId,
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

        var raffle = await db.Raffles.AsTracking()
            .FirstOrDefaultAsync(r => r.Id == raffleId && r.EventId == eventId, ct);
        if (raffle is null) return Results.NotFound(new { error = "Raffle not found." });

        if (raffle.DeletedAt is not null)
            return Results.Conflict(new { error = "Raffle is already deleted." });

        // Soft-delete: keep the row + tickets + draws so hosts can review for refunds.
        raffle.DeletedAt = DateTime.UtcNow;
        raffle.UpdatedAt = raffle.DeletedAt.Value;
        db.Raffles.Update(raffle);
        await db.SaveChangesAsync(ct);
        await realtime.RaffleDeletedAsync(eventId, raffleId, ct);

        return Results.NoContent();
    }

    // ─── PUT /api/events/{eventId}/raffles/{raffleId}/entries/{userId} ────────

    private static async Task<IResult> SetTickets(
        Guid eventId,
        Guid raffleId,
        Guid userId,
        SetTicketsRequest request,
        IValidator<SetTicketsRequest> validator,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        var raffle = await db.Raffles.AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == raffleId && r.EventId == eventId, ct);
        if (raffle is null) return Results.NotFound(new { error = "Raffle not found." });

        if (raffle.DeletedAt is not null)
            return Results.Conflict(new { error = "Raffle has been deleted." });

        var isAdmin = await IsEventAdmin(db, eventId, dbUser.Id, ct);
        var isSelfReport = raffle.SelfReportingEnabled
            && userId == dbUser.Id
            && raffle.Status == RaffleStatus.Open;

        if (!isAdmin && !isSelfReport)
            return Results.Forbid();

        if (raffle.Status != RaffleStatus.Open)
            return Results.Conflict(new { error = "Entries can only be modified when the raffle is Open." });

        // Validate that the target userId is an event participant
        var targetIsParticipant = await db.EventParticipants
            .AnyAsync(p => p.EventId == eventId && p.UserId == userId, ct)
            || await db.EventCoAdmins.AnyAsync(c => c.EventId == eventId && c.UserId == userId, ct)
            || await db.Events.AnyAsync(e => e.Id == eventId && e.OwnerId == userId, ct);

        if (!targetIsParticipant)
            return Results.BadRequest(new { error = "The specified user is not an event participant." });

        if (ValidationError(await validator.ValidateAsync(request, ct)) is { } err)
            return err;

        // Upsert
        var existing = await db.RaffleEntries.AsTracking()
            .FirstOrDefaultAsync(e => e.RaffleId == raffleId && e.UserId == userId, ct);

        if (existing is not null)
        {
            existing.Tickets = request.Tickets;
            db.RaffleEntries.Update(existing);
        }
        else
        {
            db.RaffleEntries.Add(new RaffleEntry
            {
                Id = Guid.NewGuid(),
                RaffleId = raffleId,
                UserId = userId,
                Tickets = request.Tickets
            });
        }

        await db.SaveChangesAsync(ct);
        await realtime.RaffleEntryChangedAsync(eventId, raffleId, userId, request.Tickets, ct);

        return Results.Ok(new { updated = true, tickets = request.Tickets });
    }

    // ─── DELETE /api/events/{eventId}/raffles/{raffleId}/entries/{userId} ─────

    private static async Task<IResult> DeleteEntry(
        Guid eventId,
        Guid raffleId,
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

        var raffle = await db.Raffles.AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == raffleId && r.EventId == eventId, ct);
        if (raffle is null) return Results.NotFound(new { error = "Raffle not found." });

        if (raffle.DeletedAt is not null)
            return Results.Conflict(new { error = "Raffle has been deleted." });

        if (raffle.Status != RaffleStatus.Open)
            return Results.Conflict(new { error = "Entries can only be removed when the raffle is Open." });

        var entry = await db.RaffleEntries.AsTracking()
            .FirstOrDefaultAsync(e => e.RaffleId == raffleId && e.UserId == userId, ct);
        if (entry is null) return Results.NotFound(new { error = "Entry not found." });

        db.RaffleEntries.Remove(entry);
        await db.SaveChangesAsync(ct);
        await realtime.RaffleEntryChangedAsync(eventId, raffleId, userId, 0, ct);

        return Results.NoContent();
    }

    // ─── POST /api/events/{eventId}/raffles/{raffleId}/start ─────────────────

    private static async Task<IResult> StartDrawing(
        Guid eventId,
        Guid raffleId,
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

        var raffle = await db.Raffles.AsTracking()
            .FirstOrDefaultAsync(r => r.Id == raffleId && r.EventId == eventId, ct);
        if (raffle is null) return Results.NotFound(new { error = "Raffle not found." });

        if (raffle.DeletedAt is not null)
            return Results.Conflict(new { error = "Raffle has been deleted." });

        if (raffle.Status == RaffleStatus.Drawing)
            return Results.Conflict(new { error = "Raffle is already in Drawing state." });

        raffle.Status = RaffleStatus.Drawing;
        raffle.UpdatedAt = DateTime.UtcNow;
        db.Raffles.Update(raffle);
        await db.SaveChangesAsync(ct);

        await realtime.RaffleStartedAsync(eventId, raffleId, ct);

        return Results.Ok(new { started = true, status = "Drawing" });
    }

    // ─── POST /api/events/{eventId}/raffles/{raffleId}/draw ──────────────────

    private static async Task<IResult> DrawWinner(
        Guid eventId,
        Guid raffleId,
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

        const int maxRetries = 1;
        var strategy = db.Database.CreateExecutionStrategy();
        for (var attempt = 0; attempt <= maxRetries; attempt++)
        {
            try
            {
                return await strategy.ExecuteAsync(
                    ct,
                    (token) => AttemptDrawAsync(eventId, raffleId, db, realtime, notifications, token));
            }
            catch (DbUpdateConcurrencyException)
            {
                if (attempt == maxRetries)
                    return Results.Conflict(new { error = "Draw conflict — try again." });
                db.ChangeTracker.Clear();
            }
            catch (DbUpdateException ex) when (
                ex.InnerException is PostgresException pgEx
                && pgEx.SqlState == "40001") // serialization failure
            {
                if (attempt == maxRetries)
                    return Results.Conflict(new { error = "Draw conflict — try again." });
                db.ChangeTracker.Clear();
            }
        }

        return Results.Conflict(new { error = "Draw conflict — try again." });
    }

    private static async Task<IResult> AttemptDrawAsync(
        Guid eventId,
        Guid raffleId,
        ThuddleDbContext db,
        IRealtimeNotifier realtime,
        NotificationService notifications,
        CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);

        var raffle = await db.Raffles.FirstOrDefaultAsync(r => r.Id == raffleId && r.EventId == eventId, ct);
        if (raffle is null) return Results.NotFound();
        if (raffle.DeletedAt is not null)
            return Results.Conflict(new { error = "Raffle has been deleted." });
        if (raffle.Status != RaffleStatus.Drawing)
            return Results.Conflict(new { error = "Raffle is not in drawing state." });

        var entries = await db.RaffleEntries.Where(e => e.RaffleId == raffleId && e.Tickets > 0).ToListAsync(ct);
        var totalTickets = entries.Sum(e => e.Tickets);
        if (totalTickets == 0) return Results.Conflict(new { error = "No tickets remaining." });

        var pick = RandomNumberGenerator.GetInt32(0, totalTickets);
        var running = 0;
        RaffleEntry winner = null!;
        foreach (var e in entries) { running += e.Tickets; if (pick < running) { winner = e; break; } }

        var before = winner.Tickets;
        winner.Tickets = before - 1;
        var draw = new RaffleDraw
        {
            Id = Guid.NewGuid(),
            RaffleId = raffleId,
            WinnerUserId = winner.UserId,
            DrawnAt = DateTime.UtcNow,
            TicketsBefore = before,
            TicketsAfter = winner.Tickets
        };
        db.RaffleDraws.Add(draw);
        db.RaffleEntries.Update(winner);
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);

        // Load winner display name after commit
        var winnerUser = await db.Users.AsNoTracking()
            .Where(u => u.Id == winner.UserId)
            .Select(u => new { displayName = u.DisplayName ?? u.Email })
            .FirstOrDefaultAsync(ct);

        var displayName = winnerUser?.displayName ?? "Unknown";

        await realtime.RaffleWinnerRevealedAsync(
            eventId, raffleId, draw.Id,
            winner.UserId, displayName,
            draw.TicketsBefore, draw.TicketsAfter, draw.DrawnAt, ct);

        await notifications.CreateAsync(
            winner.UserId,
            NotificationKind.RaffleWon,
            eventId,
            raffleId,
            $"You won the {raffle.Name} raffle!",
            ct);

        return Results.Ok(new
        {
            drawId = draw.Id,
            winnerUserId = winner.UserId,
            displayName,
            ticketsBefore = draw.TicketsBefore,
            ticketsAfter = draw.TicketsAfter,
            drawnAt = draw.DrawnAt
        });
    }

    // ─── GET /api/events/{eventId}/raffles/{raffleId}/draws ──────────────────

    private static async Task<IResult> GetDraws(
        Guid eventId,
        Guid raffleId,
        ClaimsPrincipal user,
        ThuddleDbContext db,
        CancellationToken ct)
    {
        var keycloakId = GetKeycloakId(user);
        if (keycloakId is null) return Results.Unauthorized();

        var dbUser = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.KeycloakId == keycloakId, ct);
        if (dbUser is null) return Results.Unauthorized();

        if (!await IsEventParticipant(db, eventId, dbUser.Id, ct))
            return Results.Forbid();

        var raffleExists = await db.Raffles.AsNoTracking()
            .AnyAsync(r => r.Id == raffleId && r.EventId == eventId, ct);
        if (!raffleExists) return Results.NotFound(new { error = "Raffle not found." });

        var draws = await db.RaffleDraws
            .AsNoTracking()
            .Where(d => d.RaffleId == raffleId)
            .OrderByDescending(d => d.DrawnAt)
            .Select(d => new
            {
                d.Id,
                d.WinnerUserId,
                displayName = d.Winner.DisplayName ?? d.Winner.Email,
                d.DrawnAt,
                d.TicketsBefore,
                d.TicketsAfter
            })
            .ToListAsync(ct);

        return Results.Ok(draws);
    }
}

// ─── Request records ─────────────────────────────────────────────────────────

public record CreateRaffleRequest(
    string Name,
    string? Description,
    decimal? PricePerTicket,
    bool SelfReportingEnabled);

public record UpdateRaffleRequest(
    string? Name,
    string? Description,
    decimal? PricePerTicket,
    bool? SelfReportingEnabled);

public record SetTicketsRequest(int Tickets);
