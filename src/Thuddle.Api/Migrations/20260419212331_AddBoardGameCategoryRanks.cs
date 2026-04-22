using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Thuddle.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddBoardGameCategoryRanks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AbstractsRank",
                table: "BoardGames",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CgsRank",
                table: "BoardGames",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ChildrensGamesRank",
                table: "BoardGames",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "FamilyGamesRank",
                table: "BoardGames",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PartyGamesRank",
                table: "BoardGames",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "StrategyGamesRank",
                table: "BoardGames",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ThematicRank",
                table: "BoardGames",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "WarGamesRank",
                table: "BoardGames",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AbstractsRank",
                table: "BoardGames");

            migrationBuilder.DropColumn(
                name: "CgsRank",
                table: "BoardGames");

            migrationBuilder.DropColumn(
                name: "ChildrensGamesRank",
                table: "BoardGames");

            migrationBuilder.DropColumn(
                name: "FamilyGamesRank",
                table: "BoardGames");

            migrationBuilder.DropColumn(
                name: "PartyGamesRank",
                table: "BoardGames");

            migrationBuilder.DropColumn(
                name: "StrategyGamesRank",
                table: "BoardGames");

            migrationBuilder.DropColumn(
                name: "ThematicRank",
                table: "BoardGames");

            migrationBuilder.DropColumn(
                name: "WarGamesRank",
                table: "BoardGames");
        }
    }
}
