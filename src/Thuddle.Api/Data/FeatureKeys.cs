namespace Thuddle.Api.Data;

/// <summary>
/// Canonical set of event feature keys. Kept as strings (not an enum) so the
/// catalog is extensible without DB churn. Frontend mirrors this list in its
/// own catalog file.
/// </summary>
public static class FeatureKeys
{
    public const string Raffles = "raffles";
    public const string Auction = "auction";
    public const string Activities = "activities";

    public static readonly IReadOnlySet<string> All =
        new HashSet<string>(StringComparer.Ordinal) { Raffles, Auction, Activities };
}
