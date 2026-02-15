using Microsoft.EntityFrameworkCore;

namespace Thuddle.Api.Data;

public class ThuddleDbContext(DbContextOptions<ThuddleDbContext> options) : DbContext(options)
{
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
    }
}
