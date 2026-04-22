namespace Thuddle.Api.Services;

public sealed class BggApiClient(
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<BggApiClient> logger)
{
    public async Task<string?> GetThingXmlAsync(int bggId, CancellationToken ct)
    {
        var baseUrl = NormalizeBaseUrl(ResolveBaseUrl());

        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            logger.LogWarning(
                "BGG base URL is not configured. Set Bgg:BaseUrl or wire fake-bgg via Aspire service discovery. bggId={BggId}",
                bggId);
            return null;
        }

        baseUrl = baseUrl.TrimEnd('/');
        var url = $"{baseUrl}/xmlapi2/thing?id={bggId}&stats=1";

        try
        {
            var client = httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(5);

            var request = new HttpRequestMessage(HttpMethod.Get, url);

            var token = configuration["Bgg:ApiToken"];
            if (!string.IsNullOrEmpty(token))
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var response = await client.SendAsync(request, ct);
            response.EnsureSuccessStatusCode();

            return await response.Content.ReadAsStringAsync(ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex,
                "BGG API request failed. bggId={BggId} baseUrl={BaseUrl}",
                bggId, baseUrl);
            return null;
        }
    }

    private string? ResolveBaseUrl()
    {
        var explicit_ = configuration["Bgg:BaseUrl"];
        if (!string.IsNullOrWhiteSpace(explicit_)) return explicit_;

        var http = configuration["services__fake-bgg__http__0"];
        if (!string.IsNullOrWhiteSpace(http)) return http;

        var https = configuration["services__fake-bgg__https__0"];
        if (!string.IsNullOrWhiteSpace(https)) return https;

        return null;
    }

    private static string? NormalizeBaseUrl(string? resolvedBaseUrl)
    {
        if (string.IsNullOrWhiteSpace(resolvedBaseUrl))
            return null;

        if (!Uri.TryCreate(resolvedBaseUrl, UriKind.Absolute, out var uri))
            return resolvedBaseUrl.TrimEnd('/');

        if (!string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(uri.Scheme, "tcp", StringComparison.OrdinalIgnoreCase))
        {
            return resolvedBaseUrl.TrimEnd('/');
        }

        var builder = new UriBuilder(uri)
        {
            Scheme = string.Equals(uri.Scheme, "tcp", StringComparison.OrdinalIgnoreCase)
                ? Uri.UriSchemeHttp
                : uri.Scheme,
            Path = string.Empty,
            Query = string.Empty,
            Fragment = string.Empty
        };

        return builder.Uri.GetLeftPart(UriPartial.Authority);
    }
}
