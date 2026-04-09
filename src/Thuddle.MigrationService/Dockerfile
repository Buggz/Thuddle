FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY src/Thuddle.ServiceDefaults/Thuddle.ServiceDefaults.csproj Thuddle.ServiceDefaults/
COPY src/Thuddle.Api/Thuddle.Api.csproj Thuddle.Api/
COPY src/Thuddle.MigrationService/Thuddle.MigrationService.csproj Thuddle.MigrationService/
RUN dotnet restore Thuddle.MigrationService/Thuddle.MigrationService.csproj

COPY src/Thuddle.ServiceDefaults/ Thuddle.ServiceDefaults/
COPY src/Thuddle.Api/ Thuddle.Api/
COPY src/Thuddle.MigrationService/ Thuddle.MigrationService/
RUN dotnet publish Thuddle.MigrationService/Thuddle.MigrationService.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Thuddle.MigrationService.dll"]
