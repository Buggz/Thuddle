using Microsoft.EntityFrameworkCore;

namespace Thuddle.Api.Data;

public class ThuddleDbContext(DbContextOptions<ThuddleDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(u => u.KeycloakId).IsUnique();
            entity.HasIndex(u => u.Email).IsUnique();
        });
    }
}
