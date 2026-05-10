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
    public DbSet<DiscussionReadReceipt> DiscussionReadReceipts => Set<DiscussionReadReceipt>();
    public DbSet<ContactGroup> ContactGroups => Set<ContactGroup>();
    public DbSet<ContactGroupMember> ContactGroupMembers => Set<ContactGroupMember>();
    public DbSet<EventAuctionSettings> EventAuctionSettings => Set<EventAuctionSettings>();
    public DbSet<AuctionItemSubmitter> AuctionItemSubmitters => Set<AuctionItemSubmitter>();
    public DbSet<AuctionItem> AuctionItems => Set<AuctionItem>();
    public DbSet<AuctionItemImage> AuctionItemImages => Set<AuctionItemImage>();
    public DbSet<AuctionItemBoardGame> AuctionItemBoardGames => Set<AuctionItemBoardGame>();
    public DbSet<AuctionBid> AuctionBids => Set<AuctionBid>();
    public DbSet<AuctionPublishBan> AuctionPublishBans => Set<AuctionPublishBan>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<BoardGame> BoardGames => Set<BoardGame>();
    public DbSet<EventBlocklistEntry> EventBlocklist => Set<EventBlocklistEntry>();
    public DbSet<Raffle> Raffles => Set<Raffle>();
    public DbSet<RaffleEntry> RaffleEntries => Set<RaffleEntry>();
    public DbSet<RaffleDraw> RaffleDraws => Set<RaffleDraw>();
    public DbSet<EventFeature> EventFeatures => Set<EventFeature>();
    public DbSet<EventActivity> EventActivities => Set<EventActivity>();
    public DbSet<EventActivityParticipant> EventActivityParticipants => Set<EventActivityParticipant>();
    public DbSet<EventActivityWaitlistEntry> EventActivityWaitlistEntries => Set<EventActivityWaitlistEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.HasPostgresExtension("pg_trgm");

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

            // Slug is nullable in the DB during the transition period (backfill runs in
            // MigrationService after AddEventSlug migration). The conditional unique index
            // allows NULLs during backfill. MakeEventSlugRequired (future migration) will
            // drop this filter and add a plain unique index once all rows are populated.
            entity.Property(e => e.Slug).HasMaxLength(80).IsRequired(false);
            entity.HasIndex(e => e.Slug).IsUnique().HasFilter("\"Slug\" IS NOT NULL");
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

        modelBuilder.Entity<DiscussionReadReceipt>(entity =>
        {
            entity.HasIndex(r => new { r.UserId, r.EventId }).IsUnique();
            entity.HasOne(r => r.User)
                .WithMany()
                .HasForeignKey(r => r.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(r => r.Event)
                .WithMany()
                .HasForeignKey(r => r.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ContactGroup>(entity =>
        {
            entity.HasIndex(g => new { g.OwnerId, g.Name });
            entity.HasOne(g => g.Owner)
                .WithMany()
                .HasForeignKey(g => g.OwnerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ContactGroupMember>(entity =>
        {
            entity.HasIndex(m => new { m.GroupId, m.UserId }).IsUnique();
            entity.HasOne(m => m.Group)
                .WithMany()
                .HasForeignKey(m => m.GroupId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(m => m.User)
                .WithMany()
                .HasForeignKey(m => m.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EventAuctionSettings>(entity =>
        {
            entity.HasKey(e => e.EventId);
            entity.Ignore(e => e.EarliestEndsAt);
            entity.HasOne(e => e.Event)
                .WithOne()
                .HasForeignKey<EventAuctionSettings>(e => e.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AuctionItemSubmitter>(entity =>
        {
            entity.HasIndex(s => new { s.EventId, s.UserId }).IsUnique();
            entity.HasOne(s => s.Event)
                .WithMany()
                .HasForeignKey(s => s.EventId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(s => s.User)
                .WithMany()
                .HasForeignKey(s => s.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AuctionItem>(entity =>
        {
            entity.HasIndex(i => new { i.EventId, i.Status });
            entity.HasOne(i => i.Event)
                .WithMany()
                .HasForeignKey(i => i.EventId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(i => i.SubmittedByUser)
                .WithMany()
                .HasForeignKey(i => i.SubmittedByUserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(i => i.CurrentBid)
                .WithMany()
                .HasForeignKey(i => i.CurrentBidId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(i => i.Winner)
                .WithMany()
                .HasForeignKey(i => i.WinnerUserId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasMany(i => i.BoardGames)
                .WithOne(bg => bg.Item)
                .HasForeignKey(bg => bg.ItemId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.Property(i => i.RowVersion)
                .IsRowVersion();
            entity.Property(i => i.RejectionReason)
                .HasMaxLength(500);
        });

        modelBuilder.Entity<AuctionItemBoardGame>(entity =>
        {
            entity.HasIndex(e => new { e.ItemId, e.BggId }).IsUnique();
            entity.HasIndex(e => new { e.ItemId, e.SortOrder });
            entity.HasOne(e => e.Item)
                .WithMany(i => i.BoardGames)
                .HasForeignKey(e => e.ItemId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.BoardGame)
                .WithMany()
                .HasForeignKey(e => e.BggId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<AuctionItemImage>(entity =>
        {
            entity.HasIndex(img => new { img.ItemId, img.SortOrder });
            entity.HasOne(img => img.Item)
                .WithMany()
                .HasForeignKey(img => img.ItemId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AuctionBid>(entity =>
        {
            entity.HasIndex(b => new { b.ItemId, b.Amount }).IsUnique().IsDescending(false, true);
            entity.HasIndex(b => new { b.BidderUserId, b.CreatedAt }).IsDescending(false, true);
            entity.HasIndex(b => new { b.ItemId, b.IdempotencyKey }).IsUnique();
            entity.HasOne(b => b.Item)
                .WithMany()
                .HasForeignKey(b => b.ItemId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(b => b.Bidder)
                .WithMany()
                .HasForeignKey(b => b.BidderUserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Notification>(entity =>
        {
            entity.HasIndex(n => new { n.RecipientUserId, n.ReadAt, n.CreatedAt }).IsDescending(false, false, true);
            entity.HasOne(n => n.Recipient)
                .WithMany()
                .HasForeignKey(n => n.RecipientUserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AuctionPublishBan>(entity =>
        {
            entity.HasIndex(b => new { b.EventId, b.UserId }).IsUnique();
            entity.HasOne(b => b.Event)
                .WithMany()
                .HasForeignKey(b => b.EventId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(b => b.User)
                .WithMany()
                .HasForeignKey(b => b.UserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(b => b.BannedByUser)
                .WithMany()
                .HasForeignKey(b => b.BannedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.Property(b => b.Reason)
                .HasMaxLength(500);
        });

        modelBuilder.Entity<BoardGame>(entity =>
        {
            entity.HasKey(b => b.BggId);
            entity.Property(b => b.BggId).ValueGeneratedNever();
            entity.HasIndex(b => b.Name)
                .HasMethod("gist")
                .HasOperators("gist_trgm_ops");
            entity.HasIndex(b => b.BggRank);
        });

        modelBuilder.Entity<EventBlocklistEntry>(entity =>
        {
            entity.HasKey(e => new { e.EventId, e.UserId });
            entity.HasIndex(e => e.EventId);
            entity.HasOne(e => e.Event)
                .WithMany()
                .HasForeignKey(e => e.EventId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.BlockedByUser)
                .WithMany()
                .HasForeignKey(e => e.BlockedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Raffle>(entity =>
        {
            entity.HasIndex(r => r.EventId);
            entity.Property(r => r.Name).HasMaxLength(120);
            entity.HasOne(r => r.Event)
                .WithMany()
                .HasForeignKey(r => r.EventId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<RaffleEntry>(entity =>
        {
            entity.HasIndex(e => new { e.RaffleId, e.UserId }).IsUnique();
            entity.HasOne(e => e.Raffle)
                .WithMany(r => r.Entries)
                .HasForeignKey(e => e.RaffleId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<RaffleDraw>(entity =>
        {
            entity.HasIndex(d => d.RaffleId);
            entity.HasOne(d => d.Raffle)
                .WithMany(r => r.Draws)
                .HasForeignKey(d => d.RaffleId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(d => d.Winner)
                .WithMany()
                .HasForeignKey(d => d.WinnerUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<EventFeature>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.FeatureKey).IsRequired().HasMaxLength(50);
            entity.HasOne(e => e.Event)
                .WithMany()
                .HasForeignKey(e => e.EventId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<User>()
                .WithMany()
                .HasForeignKey(e => e.EnabledByUserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(e => e.EventId);
            entity.HasIndex(e => new { e.EventId, e.FeatureKey }).IsUnique();
        });

        modelBuilder.Entity<EventActivity>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Title).IsRequired().HasMaxLength(120);
            entity.Property(e => e.Description); // nvarchar/text — no length cap, validators enforce size
            entity.HasOne(e => e.Event)
                .WithMany()
                .HasForeignKey(e => e.EventId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasIndex(e => new { e.EventId, e.StartsAt });
        });

        modelBuilder.Entity<EventActivityParticipant>(entity =>
        {
            entity.HasKey(p => p.Id);
            entity.HasOne(p => p.Activity)
                .WithMany(a => a.Participants)
                .HasForeignKey(p => p.EventActivityId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(p => p.User)
                .WithMany()
                .HasForeignKey(p => p.UserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(p => new { p.EventActivityId, p.UserId }).IsUnique();
        });

        modelBuilder.Entity<EventActivityWaitlistEntry>(entity =>
        {
            entity.HasKey(w => w.Id);
            entity.HasOne(w => w.Activity)
                .WithMany(a => a.WaitlistEntries)
                .HasForeignKey(w => w.EventActivityId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(w => w.User)
                .WithMany()
                .HasForeignKey(w => w.UserId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(w => new { w.EventActivityId, w.UserId }).IsUnique();
        });
    }
}