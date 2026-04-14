using Microsoft.EntityFrameworkCore;

namespace Thuddle.Api.Data;

public class ThuddleDbContext(DbContextOptions<ThuddleDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Event> Events => Set<Event>();
    public DbSet<UserPermission> UserPermissions => Set<UserPermission>();
    public DbSet<EventInvitation> EventInvitations => Set<EventInvitation>();
    public DbSet<EventParticipant> EventParticipants => Set<EventParticipant>();
    public DbSet<EventCoAdmin> EventCoAdmins => Set<EventCoAdmin>();
    public DbSet<DiscussionPost> DiscussionPosts => Set<DiscussionPost>();
    public DbSet<DiscussionComment> DiscussionComments => Set<DiscussionComment>();

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

        modelBuilder.Entity<EventCoAdmin>(entity =>
        {
            entity.HasIndex(c => new { c.EventId, c.UserId }).IsUnique();
            entity.HasOne(c => c.Event)
                .WithMany()
                .HasForeignKey(c => c.EventId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(c => c.User)
                .WithMany()
                .HasForeignKey(c => c.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DiscussionPost>(entity =>
        {
            entity.HasIndex(p => new { p.EventId, p.CreatedAt });
            entity.HasOne(p => p.Event)
                .WithMany()
                .HasForeignKey(p => p.EventId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(p => p.Author)
                .WithMany()
                .HasForeignKey(p => p.AuthorId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DiscussionComment>(entity =>
        {
            entity.HasIndex(c => new { c.PostId, c.CreatedAt });
            entity.HasOne(c => c.Post)
                .WithMany()
                .HasForeignKey(c => c.PostId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(c => c.Author)
                .WithMany()
                .HasForeignKey(c => c.AuthorId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}