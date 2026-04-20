using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Thuddle.Api.Migrations
{
    /// <inheritdoc />
    public partial class PersistBoardGameDetails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Description",
                table: "BoardGames",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxPlayTime",
                table: "BoardGames",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxPlayers",
                table: "BoardGames",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MinPlayTime",
                table: "BoardGames",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MinPlayers",
                table: "BoardGames",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Description",
                table: "BoardGames");

            migrationBuilder.DropColumn(
                name: "MaxPlayTime",
                table: "BoardGames");

            migrationBuilder.DropColumn(
                name: "MaxPlayers",
                table: "BoardGames");

            migrationBuilder.DropColumn(
                name: "MinPlayTime",
                table: "BoardGames");

            migrationBuilder.DropColumn(
                name: "MinPlayers",
                table: "BoardGames");
        }
    }
}
