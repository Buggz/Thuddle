using Thuddle.Api.Data;
using Thuddle.MigrationService;

var builder = Host.CreateApplicationBuilder(args);

builder.AddServiceDefaults();
builder.AddNpgsqlDbContext<ThuddleDbContext>("thuddledb");

builder.Services.AddHostedService<MigrationWorker>();

var host = builder.Build();
host.Run();
