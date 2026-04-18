using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Thuddle.Api.Migrations
{
    /// <inheritdoc />
    public partial class AllowDuplicateContactGroupNames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ContactGroups_OwnerId_Name",
                table: "ContactGroups");

            migrationBuilder.CreateIndex(
                name: "IX_ContactGroups_OwnerId_Name",
                table: "ContactGroups",
                columns: new[] { "OwnerId", "Name" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ContactGroups_OwnerId_Name",
                table: "ContactGroups");

            migrationBuilder.CreateIndex(
                name: "IX_ContactGroups_OwnerId_Name",
                table: "ContactGroups",
                columns: new[] { "OwnerId", "Name" },
                unique: true);
        }
    }
}
