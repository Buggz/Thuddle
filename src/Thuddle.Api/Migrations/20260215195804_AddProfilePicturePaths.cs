using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Thuddle.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddProfilePicturePaths : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "ProfilePicturePath",
                table: "Users",
                newName: "ScaledPicturePath");

            migrationBuilder.AddColumn<string>(
                name: "OriginalPicturePath",
                table: "Users",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "OriginalPicturePath",
                table: "Users");

            migrationBuilder.RenameColumn(
                name: "ScaledPicturePath",
                table: "Users",
                newName: "ProfilePicturePath");
        }
    }
}
