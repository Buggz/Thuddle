var builder = DistributedApplication.CreateBuilder(args);

// PostgreSQL: one server, two databases
var postgres = builder.AddPostgres("postgres")
    .WithDataVolume()
    .WithPgAdmin();

var keycloakDb = postgres.AddDatabase("keycloakdb");
var thuddleDb = postgres.AddDatabase("thuddledb");

// Keycloak: using PostgreSQL as backing store, importing the Thuddle realm
var keycloak = builder.AddKeycloakContainer("keycloak")
    .WithDataVolume()
    .WithImport("./KeycloakConfiguration/Thuddle-realm.json")
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
    .WaitFor(thuddleDb);

// .NET API with Keycloak auth, PostgreSQL, and Azure Blob Storage
var api = builder.AddProject<Projects.Thuddle_Api>("api")
    .WithReference(thuddleDb)
    .WithReference(realm)
    .WithReference(blobs)
    .WaitFor(thuddleDb)
    .WaitFor(keycloak)
    .WaitFor(storage)
    .WaitForCompletion(migrations)
    .WithExternalHttpEndpoints();

// Vue.js frontend
builder.AddViteApp("web", "../Thuddle.Web")
    .WithNpm()
    .WithReference(api)
    .WaitFor(api)
    .WaitFor(keycloak)
    .WithExternalHttpEndpoints()
    .WithEnvironment("VITE_KEYCLOAK_URL", keycloak.GetEndpoint("http"))
    .WithEnvironment("VITE_KEYCLOAK_REALM", "Thuddle")
    .WithEnvironment("VITE_KEYCLOAK_CLIENT_ID", "thuddle-web");

builder.Build().Run();
