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

        logger.LogWarning("PermissionHandler: keycloakId={KeycloakId}, requirement={Permission}", keycloakId, requirement.Permission);

        if (keycloakId is null) return;

        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ThuddleDbContext>();

        var hasPermission = await db.UserPermissions
            .AnyAsync(p => p.User.KeycloakId == keycloakId && p.Permission == requirement.Permission);

        logger.LogWarning("PermissionHandler: hasPermission={HasPermission}", hasPermission);

        if (hasPermission)
        {
            context.Succeed(requirement);
        }
    }
}
