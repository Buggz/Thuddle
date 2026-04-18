using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Security.Cryptography;
using Thuddle.Api.Data;

namespace Thuddle.Api.Services;

public static class AuctionService
{
    public static readonly ActivitySource Source = new("Thuddle.Auctions");
    private static readonly Meter Meter = new("Thuddle.Auctions");
    public static readonly Counter<long> BidsPlaced = Meter.CreateCounter<long>("auction.bids.placed");
    public static readonly Counter<long> BidsRejected = Meter.CreateCounter<long>("auction.bids.rejected");

    public static decimal ComputeMinNextBid(decimal startingBid, decimal? currentHighBid, decimal minBidIncrement)
    {
        if (currentHighBid is null)
            return startingBid;

        return currentHighBid.Value + minBidIncrement;
    }

    public static string? ValidateSettings(EventAuctionSettings settings)
    {
        if (settings.StartsAt.HasValue && settings.LatestEndsAt.HasValue)
        {
            if (settings.StartsAt.Value >= settings.LatestEndsAt.Value)
                return "StartsAt must be before LatestEndsAt.";

            var auctionDuration = settings.LatestEndsAt.Value - settings.StartsAt.Value;
            var maxVeiled = auctionDuration / 2;
            if (settings.VeiledCloseWindow > maxVeiled)
                return "VeiledCloseWindow must be at most half the auction duration.";
        }

        if (settings.VeiledCloseWindow < TimeSpan.Zero)
            return "VeiledCloseWindow must be non-negative.";

        if (settings.MinBidIncrement <= 0)
            return "MinBidIncrement must be greater than zero.";

        return null;
    }

    public static DateTime SealRandomEndsAt(DateTime earliest, DateTime latest)
    {
        if (earliest >= latest)
            return latest;

        var tickRange = latest.Ticks - earliest.Ticks;
        var randomOffset = (long)(RandomNumberGenerator.GetInt32(0, int.MaxValue) / (double)int.MaxValue * tickRange);
        return new DateTime(earliest.Ticks + randomOffset, DateTimeKind.Utc);
    }
}
