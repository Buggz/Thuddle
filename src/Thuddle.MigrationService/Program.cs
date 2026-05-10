using Thuddle.Api.Data;
using Thuddle.Api.Services;
using Thuddle.MigrationService;

var builder = Host.CreateApplicationBuilder(args);

builder.AddServiceDefaults();
builder.AddNpgsqlDbContext<ThuddleDbContext>("thuddledb");

builder.Services.AddHostedService<MigrationWorker>();
builder.Services.AddScoped<SlugService>();

var host = builder.Build();
host.Run();
