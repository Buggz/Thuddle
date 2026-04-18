using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Thuddle.Api.Data;

namespace Thuddle.Api.Authorization;

public sealed class PermissionRequirement(string permission) : IAuthorizationRequirement
{
    public string Permission { get; } = permission;
}

public sealed class PermissionHandler(IServiceScopeFactory scopeFactory, ILogger<PermissionHandler> logger) : AuthorizationHandler<PermissionRequirement>
{
    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        PermissionRequirement requirement)
    {
        var keycloakId = context.User.FindFirst("sub")?.Value
            ?? context.User.FindFirst("sid")?.Value
            ?? context.User.FindFirst("email")?.Value;

        if (keycloakId is null) return;

        // Match the same identity-resolution as /api/profile and /api/profile/init: prefer
        // KeycloakId, but fall back to email. Seeded users start with KeycloakId="" and only
        // get associated to a Keycloak subject after /api/profile/init runs and commits, so a
        // strict KeycloakId-only match would 403 a freshly-seeded admin between login and
        // the first /api/profile/init committing — even though /api/profile already returned
        // their permissions via the email fallback.
        var email = context.User.FindFirst("email")?.Value?.ToLowerInvariant() ?? "";

        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ThuddleDbContext>();

        var hasPermission = await db.UserPermissions
            .AnyAsync(p =>
                p.Permission == requirement.Permission &&
                (p.User.KeycloakId == keycloakId ||
                 (email != "" && p.User.Email.ToLower() == email)));

        if (hasPermission)
        {
            context.Succeed(requirement);
        }
        else
        {
            logger.LogDebug(
                "PermissionHandler denied: sub={KeycloakId}, email={Email}, perm={Permission}",
                keycloakId, email, requirement.Permission);
        }
    }
}
