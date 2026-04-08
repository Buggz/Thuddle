using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Thuddle.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddEventVisibilityJoinModeCapacity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Capacity",
                table: "Events",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "JoinMode",
                table: "Events",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Visibility",
                table: "Events",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Capacity",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "JoinMode",
                table: "Events");

            migrationBuilder.DropColumn(
                name: "Visibility",
                table: "Events");
        }
    }
}
