using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Thuddle.Api.Authorization;
using Thuddle.Api.Data;
using Thuddle.Api.Endpoints;
using Thuddle.Api.Realtime;
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
            },
            OnMessageReceived = context =>
            {
                // SignalR WebSockets cannot send custom headers, so the access
                // token is passed as a query-string parameter on the hub path.
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            },
            OnChallenge = context =>
            {
                var logger = context.HttpContext.RequestServices.GetRequiredService<ILoggerFactory>()
                    .CreateLogger("JwtBearer");
                logger.LogWarning(
                    "JWT challenge issued: error={Error} description={Description} hasAuthHeader={HasAuth} path={Path}",
                    context.Error,
                    context.ErrorDescription,
                    context.HttpContext.Request.Headers.ContainsKey("Authorization"),
                    context.HttpContext.Request.Path);
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build())
    .AddPolicy("events:write", policy =>
        policy.Requirements.Add(new PermissionRequirement("events:write")))
    .AddPolicy("groups:manage", policy =>
        policy.Requirements.Add(new PermissionRequirement("groups:manage")))
    .AddPolicy("admin:access", policy =>
        policy.Requirements.Add(new PermissionRequirement("admin:access")));

builder.Services.AddScoped<IAuthorizationHandler, PermissionHandler>();

builder.Services.AddSingleton<ImageScaler>();
builder.Services.AddSingleton<ProfilePictureStorage>();
builder.Services.AddSingleton<EventImageStorage>();
builder.Services.AddSingleton<AuctionImageStorage>();
builder.Services.AddSingleton<BggApiClient>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddHostedService<AuctionLifecycleWorker>();
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<SmtpEmailSender>();
builder.Services.AddSingleton(provider =>
    new RazorTemplateService(Path.Combine(AppContext.BaseDirectory, "EmailTemplates")));

builder.Services.AddHttpClient();

builder.Services.AddSignalR();
builder.Services.AddSingleton<IRealtimeNotifier, RealtimeNotifier>();

// CORS – origins loaded from configuration; production values injected via env vars
var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? Array.Empty<string>();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

builder.Services.AddOpenApi();

// Return structured ProblemDetails JSON for all error responses (including
// unhandled exceptions) instead of the default HTML developer exception page.
// This keeps API clients — including E2E tests — able to parse failures as
// JSON and surface the real server error in assertion messages.
builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = ctx =>
    {
        ctx.ProblemDetails.Extensions["traceId"] = ctx.HttpContext.TraceIdentifier;
    };
});

builder.Services.AddValidatorsFromAssemblyContaining<Program>();

var app = builder.Build();

// UseExceptionHandler must come before endpoints so unhandled exceptions in
// endpoint code return ProblemDetails JSON. In Development we still log the
// full exception to the console for debuggability.
app.UseExceptionHandler();
app.UseStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapDefaultEndpoints();
app.MapProfileEndpoints();
app.MapEventEndpoints();
app.MapDiscussionEndpoints();
app.MapContactGroupEndpoints();
app.MapAdminEndpoints();
app.MapAuctionEndpoints();
app.MapBoardGameEndpoints();
app.MapNotificationEndpoints();
app.MapRaffleEndpoints();
app.MapEventFeatureEndpoints();
app.MapActivityEndpoints();
app.MapHub<ThuddleHub>("/hubs/thuddle");

app.MapGet("/api/hello", () => Results.Ok(new { message = "Hello from Thuddle API!" }));

app.MapGet("/api/status", () => Results.Ok(new { status = "ok", timestamp = DateTime.UtcNow }));

app.Run();
