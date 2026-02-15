using Keycloak.AuthServices.Authentication;
using Thuddle.Api.Data;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

// PostgreSQL via Aspire (connection string "thuddledb" injected by AppHost)
builder.AddNpgsqlDbContext<ThuddleDbContext>("thuddledb");

// Keycloak JWT Bearer authentication
// Keycloak__AuthServerUrl and Keycloak__Realm are injected by Aspire via WithReference(realm)
builder.Services.AddKeycloakWebApiAuthentication(
    builder.Configuration,
    jwtBearerOptions =>
    {
        jwtBearerOptions.RequireHttpsMetadata = false;
        jwtBearerOptions.TokenValidationParameters.ValidateAudience = false;
    });

builder.Services.AddAuthorization();

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

app.UseHttpsRedirection();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapDefaultEndpoints();

app.MapGet("/api/hello", () => Results.Ok(new { message = "Hello from Thuddle API!" }))
   .RequireAuthorization();

app.MapGet("/api/status", () => Results.Ok(new { status = "ok", timestamp = DateTime.UtcNow }));

app.Run();
