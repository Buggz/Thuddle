using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Thuddle.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddBoardGames : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "BggId",
                table: "AuctionItems",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BggImageUrl",
                table: "AuctionItems",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "BoardGames",
                columns: table => new
                {
                    BggId = table.Column<int>(type: "integer", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    YearPublished = table.Column<int>(type: "integer", nullable: true),
                    BggRank = table.Column<int>(type: "integer", nullable: true),
                    AverageRating = table.Column<decimal>(type: "numeric", nullable: true),
                    UsersRated = table.Column<int>(type: "integer", nullable: false),
                    IsExpansion = table.Column<bool>(type: "boolean", nullable: false),
                    ThumbnailUrl = table.Column<string>(type: "text", nullable: true),
                    ImageUrl = table.Column<string>(type: "text", nullable: true),
                    LastDetailFetch = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ImportedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BoardGames", x => x.BggId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AuctionItems_BggId",
                table: "AuctionItems",
                column: "BggId");

            migrationBuilder.CreateIndex(
                name: "IX_BoardGames_BggRank",
                table: "BoardGames",
                column: "BggRank");

            migrationBuilder.CreateIndex(
                name: "IX_BoardGames_Name",
                table: "BoardGames",
                column: "Name")
                .Annotation("Npgsql:IndexMethod", "gist")
                .Annotation("Npgsql:IndexOperators", new[] { "gist_trgm_ops" });

            migrationBuilder.AddForeignKey(
                name: "FK_AuctionItems_BoardGames_BggId",
                table: "AuctionItems",
                column: "BggId",
                principalTable: "BoardGames",
                principalColumn: "BggId",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AuctionItems_BoardGames_BggId",
                table: "AuctionItems");

            migrationBuilder.DropTable(
                name: "BoardGames");

            migrationBuilder.DropIndex(
                name: "IX_AuctionItems_BggId",
                table: "AuctionItems");

            migrationBuilder.DropColumn(
                name: "BggId",
                table: "AuctionItems");

            migrationBuilder.DropColumn(
                name: "BggImageUrl",
                table: "AuctionItems");
        }
    }
}
