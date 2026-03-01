FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY Thuddle.ServiceDefaults/Thuddle.ServiceDefaults.csproj Thuddle.ServiceDefaults/
COPY Thuddle.Api/Thuddle.Api.csproj Thuddle.Api/
RUN dotnet restore Thuddle.Api/Thuddle.Api.csproj

COPY Thuddle.ServiceDefaults/ Thuddle.ServiceDefaults/
COPY Thuddle.Api/ Thuddle.Api/
RUN dotnet publish Thuddle.Api/Thuddle.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
RUN apt-get update && apt-get install -y --no-install-recommends libfontconfig1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Thuddle.Api.dll"]
