namespace Thuddle.Api.Services;

public sealed class BggApiClient(IHttpClientFactory httpClientFactory, IConfiguration configuration)
{
    public async Task<string?> GetThingXmlAsync(int bggId, CancellationToken ct)
    {
        try
        {
            var baseUrl = configuration["Bgg:BaseUrl"] 
                ?? throw new InvalidOperationException("Bgg:BaseUrl configuration is required and must not be null");
            baseUrl = baseUrl.TrimEnd('/');
            var url = $"{baseUrl}/xmlapi2/thing?id={bggId}&stats=1";

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
        catch
        {
            return null;
        }
    }
}
