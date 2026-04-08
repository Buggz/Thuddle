using Microsoft.AspNetCore.Authentication.JwtBearer;
using Thuddle.Api.Data;
using Thuddle.Api.Endpoints;
using Thuddle.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

// PostgreSQL via Aspire (connection string "thuddledb" injected by AppHost)
builder.AddNpgsqlDbContext<ThuddleDbContext>("thuddledb");

// Azure Blob Storage via Aspire
builder.AddAzureBlobServiceClient("blobs");

// JWT Bearer authentication against Keycloak
// Keycloak__AuthServerUrl and Keycloak__Realm are injected by Aspire via WithReference(realm)
var keycloakUrl = builder.Configuration["Keycloak:AuthServerUrl"];
var realm = builder.Configuration["Keycloak:Realm"];
var authority = $"{keycloakUrl}/realms/{realm}";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = authority;
        options.RequireHttpsMetadata = false;
        options.TokenValidationParameters.ValidateAudience = false;
        options.TokenValidationParameters.NameClaimType = "email";
        options.MapInboundClaims = false;
        options.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = context =>
            {
                var logger = context.HttpContext.RequestServices.GetRequiredService<ILoggerFactory>()
                    .CreateLogger("JwtBearer");
                logger.LogError(context.Exception, "JWT authentication failed. Authority: {Authority}", authority);
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

builder.Services.AddSingleton<ImageScaler>();
builder.Services.AddSingleton<ProfilePictureStorage>();
builder.Services.AddMemoryCache();

// CORS for local development
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapDefaultEndpoints();
app.MapProfileEndpoints();

app.MapGet("/api/hello", () => Results.Ok(new { message = "Hello from Thuddle API!" }))
   .RequireAuthorization();

app.MapGet("/api/status", () => Results.Ok(new { status = "ok", timestamp = DateTime.UtcNow }));

app.Run();
