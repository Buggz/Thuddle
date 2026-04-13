namespace Thuddle.Api.Services;

public sealed class RazorTemplateService
{
    private readonly string _rootDir;

    public RazorTemplateService(string rootDir)
    {
        _rootDir = rootDir;
    }

    public async Task<string> RenderAsync<T>(string templatePath, T model)
    {
        var fullPath = Path.Combine(_rootDir, templatePath);
        var template = await File.ReadAllTextAsync(fullPath);

        foreach (var prop in typeof(T).GetProperties())
        {
            var value = prop.GetValue(model)?.ToString() ?? "";
            template = template.Replace("{{" + prop.Name + "}}", value);
        }

        return template;
    }
}
