using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;

namespace Thuddle.Api.Realtime;

/// <summary>
/// SignalR hub for realtime updates. Authenticated clients are auto-joined to a
/// per-user group for targeted notifications (e.g. invitations). Anonymous
/// connections are permitted so public event updates can flow to guests.
/// </summary>
public sealed class ThuddleHub : Hub
{
    public override Task OnConnectedAsync()
    {
        var keycloakId = GetKeycloakId(Context.User);
        if (!string.IsNullOrEmpty(keycloakId))
        {
            return Groups.AddToGroupAsync(Context.ConnectionId, UserGroup(keycloakId));
        }
        return Task.CompletedTask;
    }

    internal static string UserGroup(string keycloakId) => $"user:{keycloakId}";

    private static string? GetKeycloakId(ClaimsPrincipal? user)
    {
        if (user?.Identity?.IsAuthenticated != true) return null;
        return user.FindFirstValue("sub")
            ?? user.FindFirstValue("sid")
            ?? user.FindFirstValue("email");
    }
}
