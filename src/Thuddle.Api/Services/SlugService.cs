using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;

namespace Thuddle.Api.Services;

public sealed class SlugService(ThuddleDbContext db, ILogger<SlugService> logger)
{
    private static readonly Regex NonAlphanumericRun = new(@"[^a-z0-9]+", RegexOptions.Compiled);

    public string Slugify(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
            return "event";

        // Decompose characters via Unicode FormD, then strip diacritics (NonSpacingMark category)
        var normalized = input.Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(normalized.Length);
        foreach (var c in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        }

        var slug = sb.ToString().Normalize(NormalizationForm.FormC).ToLowerInvariant();

        // Replace any run of non-alphanumeric characters with a single dash, then trim edges
        slug = NonAlphanumericRun.Replace(slug, "-").Trim('-');

        if (slug.Length > 80)
            slug = slug[..80].TrimEnd('-');

        return string.IsNullOrEmpty(slug) ? "event" : slug;
    }

    public async Task<string> EnsureUniqueAsync(string baseSlug, Guid? excludeEventId, CancellationToken ct)
    {
        var prefix = baseSlug + "-";

        // Fetch all slugs that match the base slug or the base-N suffix pattern
        var candidates = await db.Events
            .AsNoTracking()
            .Where(e => (excludeEventId == null || e.Id != excludeEventId)
                && (e.Slug == baseSlug || e.Slug!.StartsWith(prefix)))
            .Select(e => e.Slug)
            .ToListAsync(ct);

        if (!candidates.Contains(baseSlug))
            return baseSlug;

        // Find the smallest free suffix index starting at 2
        var usedNumbers = new HashSet<int>();
        foreach (var slug in candidates)
        {
            if (slug is null || slug == baseSlug) continue;
            if (slug.StartsWith(prefix) && int.TryParse(slug[prefix.Length..], out var n))
                usedNumbers.Add(n);
        }

        var i = 2;
        while (usedNumbers.Contains(i))
            i++;

        logger.LogWarning("Slug collision on '{BaseSlug}', assigned suffix -{Suffix}", baseSlug, i);
        return $"{baseSlug}-{i}";
    }
}
