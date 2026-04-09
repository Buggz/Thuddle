using Microsoft.EntityFrameworkCore;

namespace Thuddle.Api.Data;

public class ThuddleDbContext(DbContextOptions<ThuddleDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Event> Events => Set<Event>();
    public DbSet<UserPermission> UserPermissions => Set<UserPermission>();
    public DbSet<EventInvitation> EventInvitations => Set<EventInvitation>();
    public DbSet<EventParticipant> EventParticipants => Set<EventParticipant>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(u => u.KeycloakId).IsUnique();
            entity.HasIndex(u => u.Email).IsUnique();
        });

        modelBuilder.Entity<Event>(entity =>
        {
            entity.HasOne(e => e.Owner)
                .WithMany()
                .HasForeignKey(e => e.OwnerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<UserPermission>(entity =>
        {
            entity.HasIndex(p => new { p.UserId, p.Permission }).IsUnique();
            entity.HasOne(p => p.User)
                .WithMany()
                .HasForeignKey(p => p.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EventInvitation>(entity =>
        {
            entity.HasIndex(i => new { i.EventId, i.Email }).IsUnique();
            entity.HasOne(i => i.Event)
                .WithMany()
                .HasForeignKey(i => i.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EventParticipant>(entity =>
        {
            entity.HasIndex(p => new { p.EventId, p.UserId }).IsUnique();
            entity.HasOne(p => p.Event)
                .WithMany()
                .HasForeignKey(p => p.EventId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(p => p.User)
                .WithMany()
                .HasForeignKey(p => p.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}