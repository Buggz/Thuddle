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
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<SmtpEmailSender>();
builder.Services.AddSingleton(provider =>
    new RazorTemplateService(Path.Combine(AppContext.BaseDirectory, "EmailTemplates")));

builder.Services.AddSignalR();
builder.Services.AddSingleton<IRealtimeNotifier, RealtimeNotifier>();

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

builder.Services.AddValidatorsFromAssemblyContaining<Program>();

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
app.MapEventEndpoints();
app.MapDiscussionEndpoints();
app.MapContactGroupEndpoints();
app.MapAdminEndpoints();
app.MapHub<ThuddleHub>("/hubs/thuddle");

app.MapGet("/api/hello", () => Results.Ok(new { message = "Hello from Thuddle API!" }));

app.MapGet("/api/status", () => Results.Ok(new { status = "ok", timestamp = DateTime.UtcNow }));

app.Run();
