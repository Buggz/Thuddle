var builder = DistributedApplication.CreateBuilder(args);

var useVolumes = builder.Configuration["NoVolumes"] is not "true";

// PostgreSQL: one server, two databases
var postgresBuilder = builder.AddPostgres("postgres");
if (useVolumes) postgresBuilder.WithDataVolume();
var postgres = postgresBuilder.WithPgAdmin();

var keycloakDb = postgres.AddDatabase("keycloakdb");
var thuddleDb = postgres.AddDatabase("thuddledb");

// Keycloak: using PostgreSQL as backing store, importing the Thuddle realm
var keycloakBuilder = builder.AddKeycloakContainer("keycloak");
if (useVolumes) keycloakBuilder.WithDataVolume();
var keycloak = keycloakBuilder
    .WithEndpoint("http", e => e.Port = 8080)
    .WithImport("./KeycloakConfiguration/Thuddle-realm.dev.json")
    .WithEnvironment("KC_DB", "postgres")
    .WithEnvironment(context =>
    {
        context.EnvironmentVariables["KC_DB_URL"] = keycloakDb.Resource.JdbcConnectionString;
        context.EnvironmentVariables["KC_DB_USERNAME"] = postgres.Resource.UserNameReference;
        context.EnvironmentVariables["KC_DB_PASSWORD"] = postgres.Resource.PasswordParameter!;
    })
    .WaitFor(keycloakDb);

var realm = keycloak.AddRealm("Thuddle");

// Azure Storage (Azurite emulator in local dev)
var storage = builder.AddAzureStorage("storage")
    .RunAsEmulator();
var blobs = storage.AddBlobs("blobs");

// Database migrations run first, then exit
var migrations = builder.AddProject<Projects.Thuddle_MigrationService>("migrations")
    .WithReference(thuddleDb)
    .WaitFor(thuddleDb)
    .WithEnvironment("Seed__AdminEmail", "testuser@thuddle.dev");

var fakeBgg = builder.AddProject<Projects.Thuddle_FakeBgg>("fake-bgg")
    .WithReference(thuddleDb)
    .WaitFor(thuddleDb)
    .WaitForCompletion(migrations)
    .WithEndpoint("http", e => e.Port = 5217)
    .WithExternalHttpEndpoints();

// .NET API with Keycloak auth, PostgreSQL, and Azure Blob Storage
var api = builder.AddProject<Projects.Thuddle_Api>("api")
    .WithReference(thuddleDb)
    .WithReference(realm)
    .WithReference(blobs)
    .WaitFor(thuddleDb)
    .WaitFor(keycloak)
    .WaitFor(fakeBgg)
    .WaitFor(storage)
    .WaitForCompletion(migrations)
    .WithEndpoint("http", e => e.Port = 5208)
    .WithEnvironment("Bgg__BaseUrl", fakeBgg.GetEndpoint("http"))
    .WithExternalHttpEndpoints();

// Vue.js frontend
builder.AddViteApp("web", "../Thuddle.Web")
    .WithNpm()
    .WithReference(api)
    .WaitFor(api)
    .WaitFor(keycloak)
    .WithEndpoint("http", e => e.Port = 50279)
    .WithExternalHttpEndpoints()
    .WithEnvironment("VITE_KEYCLOAK_URL", keycloak.GetEndpoint("http"))
    .WithEnvironment("VITE_KEYCLOAK_REALM", "Thuddle")
    .WithEnvironment("VITE_KEYCLOAK_CLIENT_ID", "thuddle-web");

builder.Build().Run();
